from __future__ import annotations

import json
import time
from typing import Any, Callable, Dict, Optional

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
        job = self.redis.blpop(self.queue_name, timeout=self.queue_poll_timeout)
        if not job:
            self._handle_idle()
            return

        _, payload = job
        try:
            task = json.loads(payload)
        except Exception as exc:
            self.state.mark_job_failure(str(exc))
            self.log_fn("job.payload_error", error=str(exc))
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

    # --------------------------------------------------------------- helpers -

    def _handle_idle(self) -> None:
        now = time.time()
        self.state.record_idle()
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
