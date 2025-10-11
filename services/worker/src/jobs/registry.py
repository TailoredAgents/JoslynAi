from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from src.metrics import MetricsRecorder


JobHandler = Callable[[Dict[str, Any]], None]


class JobFailed(Exception):
    def __init__(self, kind: str, task: Dict[str, Any], error: Exception, attempts: int):
        super().__init__(f"{kind} failed after {attempts} attempts: {error}")
        self.kind = kind
        self.task = task
        self.error = error
        self.attempts = attempts


class JobRegistry:
    def __init__(self) -> None:
        self._handlers: Dict[str, JobHandler] = {}

    @property
    def handlers(self) -> Dict[str, JobHandler]:
        return self._handlers

    def register(self, kind: str) -> Callable[[JobHandler], JobHandler]:
        kind_key = (kind or "").strip().lower()

        def decorator(fn: JobHandler) -> JobHandler:
            self._handlers[kind_key] = fn
            return fn

        return decorator

    def get(self, kind: str) -> Optional[JobHandler]:
        return self._handlers.get((kind or "").strip().lower())

    def clear(self) -> None:
        self._handlers.clear()

    def update(self, handlers: Dict[str, JobHandler]) -> None:
        self._handlers.update(handlers)


registry = JobRegistry()


def register_job(kind: str) -> Callable[[JobHandler], JobHandler]:
    return registry.register(kind)


def dispatch_job(
    task: Dict[str, Any],
    *,
    max_attempts: int = 3,
    backoff_seconds: float = 2.0,
    max_delay_seconds: float = 30.0,
    sleep_fn: Callable[[float], None] = time.sleep,
    log_fn: Optional[Callable[..., None]] = None,
    metrics: Optional["MetricsRecorder"] = None,
) -> None:
    kind = (task.get("kind") or "").strip().lower()
    handler = registry.get(kind)
    if not handler:
        raise JobFailed(kind or "unknown", task, Exception("unknown_job_kind"), 0)

    attempt = 0
    last_err: Optional[Exception] = None
    while attempt < max(1, max_attempts):
        attempt += 1
        if metrics:
            metrics.record_attempt(kind)
        try:
            handler(task)
            if metrics:
                metrics.record_success(kind)
            return
        except Exception as err:
            last_err = err
            if log_fn:
                log_fn("job.attempt_failed", kind=kind, attempt=attempt, error=str(err))
            if attempt >= max(max_attempts, 1):
                break
            if metrics:
                metrics.record_retry(kind)
            delay = min(max_delay_seconds, backoff_seconds * attempt)
            if delay > 0:
                sleep_fn(delay)

    if metrics:
        metrics.record_failure(kind)
    raise JobFailed(kind, task, last_err or Exception("unknown failure"), attempt)
