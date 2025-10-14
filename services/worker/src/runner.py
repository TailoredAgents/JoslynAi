from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable, Dict, Optional, Tuple

from src.jobs.registry import JobFailed
from src.metrics import metrics
from src.state import WorkerState


class JobRunner:
    """Supervises queue consumption, dispatch, and heartbeat recording."""

    def __init__(
        self,
        *,
        redis_client: Any,
        state: WorkerState,
        queue_name: str = "jobs",
        dead_letter_queue: str = "jobs:dead",
        processing_queue: Optional[str] = None,
        visibility_timeout_seconds: float = 300.0,
        max_retries: int = 3,
        backoff_seconds: float = 2.0,
        max_delay_seconds: float = 30.0,
        queue_poll_timeout: int = 5,
        queue_log_interval: float = 60.0,
        failure_sleep_seconds: float = 1.0,
        dispatch_fn: Callable[..., None],
        patch_job_fn: Callable[[Optional[str], str, str, Optional[str], Optional[str]], None],
        notify_fn: Optional[Callable[[], None]],
        log_fn: Callable[..., None],
    ) -> None:
        self.redis = redis_client
        self.state = state
        self.queue_name = queue_name
        self.processing_queue = processing_queue or f"{queue_name}:processing"
        self.processing_claims_key = f"{self.processing_queue}:claims"
        self.processing_visibility_key = f"{self.processing_queue}:visibility"
        self.dead_letter_queue = dead_letter_queue
        self.max_retries = max(1, max_retries)
        self.backoff_seconds = backoff_seconds
        self.max_delay_seconds = max_delay_seconds
        self.queue_poll_timeout = max(1, queue_poll_timeout)
        self.queue_log_interval = max(5.0, queue_log_interval)
        self.failure_sleep_seconds = max(0.5, failure_sleep_seconds)
        self.dispatch_fn = dispatch_fn
        self.patch_job_fn = patch_job_fn
        self.notify_fn = notify_fn
        self.log_fn = log_fn
        self._last_queue_log = 0.0
        self.visibility_timeout = max(0.0, float(visibility_timeout_seconds or 0))
        if self.visibility_timeout:
            self._requeue_scan_interval = max(5.0, min(self.queue_log_interval, self.visibility_timeout / 2))
        else:
            self._requeue_scan_interval = 0.0
        self._last_requeue_scan = 0.0

    # ------------------------------------------------------------------ loop -

    def run_forever(self) -> None:
        while True:
            try:
                self._tick()
            except Exception as exc:  # pragma: no cover - extreme guardrail
                self.state.record_loop_error(str(exc))
                self.log_fn("runner.loop_error", error=str(exc))
                time.sleep(self.failure_sleep_seconds)

    def _tick(self) -> None:
        try:
            claimed = self._claim_next_job()
        except Exception:
            time.sleep(self.failure_sleep_seconds)
            return

        if not claimed:
            self._handle_idle()
            return

        claim_token, payload = claimed

        try:
            task = json.loads(payload)
        except Exception as exc:
            self.state.mark_job_failure(str(exc))
            self.log_fn("job.payload_error", error=str(exc))
            self._ack_job(claim_token, payload)
            return

        kind = (task.get("kind") or "").lower()
        job_id = task.get("job_id")
        org_id = task.get("org_id")

        self.state.mark_job_start(job_id, kind)
        self.log_fn("job.start", kind=kind, job_id=job_id, org_id=org_id)

        start = time.perf_counter()
        try:
            self.dispatch_fn(
                task,
                max_attempts=self.max_retries,
                backoff_seconds=self.backoff_seconds,
                max_delay_seconds=self.max_delay_seconds,
                sleep_fn=time.sleep,
                log_fn=self.log_fn,
                metrics=metrics,
            )
        except JobFailed as jf:
            self._record_duration(kind, start)
            self.state.mark_job_failure(str(jf.error))
            self.log_fn(
                "job.failed",
                kind=jf.kind,
                job_id=job_id,
                attempts=jf.attempts,
                error=str(jf.error),
            )
            self._patch_dead_letter(job_id, jf.kind or "unknown", org_id, jf.task, str(jf.error))
        except Exception as exc:
            self._record_duration(kind, start)
            self.state.mark_job_crash(str(exc))
            self.log_fn("job.crash", kind=kind, job_id=job_id, error=str(exc))
            self._patch_dead_letter(job_id, kind or "unknown", org_id, task, str(exc))
        else:
            self._record_duration(kind, start)
            self.state.mark_job_success()
            self.log_fn("job.success", kind=kind, job_id=job_id, org_id=org_id)
        finally:
            self._ack_job(claim_token, payload)

    # --------------------------------------------------------------- helpers -

    def _claim_next_job(self) -> Optional[Tuple[str, str]]:
        payload = self.redis.brpoplpush(self.queue_name, self.processing_queue, timeout=self.queue_poll_timeout)
        if not payload:
            return None

        token = hashlib.sha1(payload.encode("utf-8")).hexdigest()
        now = time.time()
        try:
            pipe = self.redis.pipeline()
            pipe.hset(self.processing_claims_key, token, payload)
            if self.visibility_timeout:
                pipe.zadd(self.processing_visibility_key, {token: now})
            pipe.execute()
        except Exception as exc:
            self.state.record_loop_error(str(exc))
            self.log_fn("job.claim_error", error=str(exc))
            try:
                self.redis.lpush(self.queue_name, payload)
            except Exception:
                pass
            raise
        return token, payload

    def _ack_job(self, token: str, payload: str) -> None:
        try:
            pipe = self.redis.pipeline()
            pipe.lrem(self.processing_queue, 0, payload)
            pipe.hdel(self.processing_claims_key, token)
            if self.visibility_timeout:
                pipe.zrem(self.processing_visibility_key, token)
            pipe.execute()
        except Exception as exc:
            self.state.record_loop_error(str(exc))
            self.log_fn("job.ack_error", token=token, error=str(exc))

    def _handle_idle(self) -> None:
        now = time.time()
        self.state.record_idle()
        if self.visibility_timeout:
            self._requeue_expired_jobs(now)

        if now - self._last_queue_log >= self.queue_log_interval:
            try:
                depth = self.redis.llen(self.queue_name)
                metrics.record_queue_depth(self.queue_name, depth)
                self.state.record_queue_depth(depth)
                self.log_fn("queue.depth", queue=self.queue_name, depth=depth)
            except Exception as exc:
                self.state.record_loop_error(str(exc))
                self.log_fn("queue.depth_error", queue=self.queue_name, error=str(exc))
            self._last_queue_log = now

        if self.notify_fn:
            try:
                self.notify_fn()
                self.state.record_notify_success()
            except Exception as exc:
                self.state.record_notify_error(str(exc))
                self.log_fn("notify.error", error=str(exc))

    def _requeue_expired_jobs(self, now: float) -> None:
        if not self.visibility_timeout:
            return
        if self._requeue_scan_interval and now - self._last_requeue_scan < self._requeue_scan_interval:
            return

        cutoff = now - self.visibility_timeout
        try:
            expired_tokens = self.redis.zrangebyscore(self.processing_visibility_key, 0, cutoff)
        except Exception as exc:
            self.state.record_loop_error(str(exc))
            self.log_fn("job.requeue_scan_error", error=str(exc))
            self._last_requeue_scan = now
            return

        for token in expired_tokens:
            payload = self.redis.hget(self.processing_claims_key, token)
            if not payload:
                self.redis.zrem(self.processing_visibility_key, token)
                continue
            pipe = self.redis.pipeline()
            pipe.lrem(self.processing_queue, 0, payload)
            pipe.hdel(self.processing_claims_key, token)
            pipe.zrem(self.processing_visibility_key, token)
            pipe.lpush(self.queue_name, payload)
            try:
                pipe.execute()
                self.log_fn("job.requeued", token=token)
            except Exception as exc:
                self.state.record_loop_error(str(exc))
                self.log_fn("job.requeue_error", token=token, error=str(exc))
        self._last_requeue_scan = now

    def _record_duration(self, kind: str, started_at: float) -> None:
        duration = time.perf_counter() - started_at
        metrics.record_duration(kind or "unknown", duration)

    def _patch_dead_letter(
        self,
        job_id: Optional[str],
        kind: str,
        org_id: Optional[str],
        task: Dict[str, Any],
        error: str,
    ) -> None:
        try:
            self.patch_job_fn(job_id, kind, "error", org_id, error[:400] if error else None)
        except Exception as patch_err:
            self.state.record_loop_error(str(patch_err))
            self.log_fn("job.patch_error", kind=kind, job_id=job_id, error=str(patch_err))
        dead_payload = dict(task)
        dead_payload["failed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        dead_payload["error"] = error
        dead_payload.setdefault("kind", kind)
        try:
            self.redis.rpush(self.dead_letter_queue, json.dumps(dead_payload, default=str))
            self.log_fn("job.dead_letter", queue=self.dead_letter_queue, kind=kind, job_id=job_id)
        except Exception as dead_err:
            self.state.record_loop_error(str(dead_err))
            self.log_fn(
                "job.dead_letter_error",
                queue=self.dead_letter_queue,
                kind=kind,
                job_id=job_id,
                error=str(dead_err),
            )
