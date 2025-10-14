from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


def _now() -> float:
    return time.time()


def _to_iso(ts: Optional[float]) -> Optional[str]:
    if not ts:
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


@dataclass
class HealthStatus:
    ok: bool
    status: str
    reasons: list[str] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return {"ok": self.ok, "status": self.status, "reasons": self.reasons}


class WorkerState:
    """Thread-safe runtime state used for health and diagnostics."""

    def __init__(
        self,
        *,
        stall_threshold_seconds: float = 300.0,
        failure_threshold: int = 5,
    ) -> None:
        self._lock = threading.Lock()
        now = _now()
        self._stall_threshold = max(30.0, stall_threshold_seconds)
        self._failure_threshold = max(1, failure_threshold)
        self._data: Dict[str, Any] = {
            "started_at": now,
            "last_heartbeat": now,
            "last_queue_depth_check": None,
            "queue_depth": 0,
            "current_job": None,
            "current_kind": None,
            "last_job_started": None,
            "last_job_finished": None,
            "last_success": None,
            "last_failure": None,
            "consecutive_failures": 0,
            "notify_errors": 0,
            "last_notify_error": None,
            "last_loop_error": None,
        }

    # ---- heartbeat and queue observability ---------------------------------

    def record_idle(self) -> None:
        with self._lock:
            self._data["last_heartbeat"] = _now()

    def record_queue_depth(self, depth: int) -> None:
        with self._lock:
            now = _now()
            self._data["queue_depth"] = max(0, int(depth))
            self._data["last_queue_depth_check"] = now
            self._data["last_heartbeat"] = now

    # ---- job lifecycle ------------------------------------------------------

    def mark_job_start(self, job_id: Optional[str], kind: Optional[str]) -> None:
        with self._lock:
            now = _now()
            self._data.update(
                {
                    "current_job": job_id,
                    "current_kind": kind,
                    "last_job_started": now,
                    "last_heartbeat": now,
                }
            )

    def mark_job_success(self) -> None:
        with self._lock:
            now = _now()
            self._data.update(
                {
                    "last_success": now,
                    "last_job_finished": now,
                    "current_job": None,
                    "current_kind": None,
                    "consecutive_failures": 0,
                    "last_heartbeat": now,
                }
            )

    def mark_job_failure(self, error: Optional[str] = None) -> None:
        with self._lock:
            now = _now()
            self._data.update(
                {
                    "last_failure": now,
                    "last_job_finished": now,
                    "current_job": None,
                    "current_kind": None,
                    "consecutive_failures": self._data.get("consecutive_failures", 0) + 1,
                    "last_loop_error": error or self._data.get("last_loop_error"),
                    "last_heartbeat": now,
                }
            )

    def mark_job_crash(self, error: Optional[str] = None) -> None:
        self.mark_job_failure(error)

    # ---- notify + loop instrumentation -------------------------------------

    def record_notify_success(self) -> None:
        with self._lock:
            self._data["last_heartbeat"] = _now()

    def record_notify_error(self, error: str) -> None:
        with self._lock:
            now = _now()
            self._data["notify_errors"] = self._data.get("notify_errors", 0) + 1
            self._data["last_notify_error"] = {"at": now, "error": error}
            self._data["last_heartbeat"] = now

    def record_loop_error(self, error: str) -> None:
        with self._lock:
            self._data["last_loop_error"] = {"at": _now(), "error": error}

    # ---- snapshots & health -------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            data = dict(self._data)
        return {
            "started_at": _to_iso(data["started_at"]),
            "last_heartbeat": _to_iso(data["last_heartbeat"]),
            "last_queue_depth_check": _to_iso(data["last_queue_depth_check"]),
            "queue_depth": data["queue_depth"],
            "current_job": data["current_job"],
            "current_kind": data["current_kind"],
            "last_job_started": _to_iso(data["last_job_started"]),
            "last_job_finished": _to_iso(data["last_job_finished"]),
            "last_success": _to_iso(data["last_success"]),
            "last_failure": _to_iso(data["last_failure"]),
            "consecutive_failures": data["consecutive_failures"],
            "notify_errors": data["notify_errors"],
            "last_notify_error": (
                {
                    "at": _to_iso(data["last_notify_error"]["at"]),
                    "error": data["last_notify_error"]["error"],
                }
                if isinstance(data.get("last_notify_error"), dict)
                else None
            ),
            "last_loop_error": (
                {
                    "at": _to_iso(data["last_loop_error"]["at"]),
                    "error": data["last_loop_error"]["error"],
                }
                if isinstance(data.get("last_loop_error"), dict)
                else None
            ),
        }

    def health(self) -> HealthStatus:
        with self._lock:
            data = dict(self._data)
            stall_threshold = self._stall_threshold
            failure_threshold = self._failure_threshold

        now = _now()
        reasons: list[str] = []
        status = "ok"
        ok = True

        last_success = data.get("last_success")
        last_started = data.get("last_job_started")
        queue_depth = data.get("queue_depth", 0)
        consecutive_failures = data.get("consecutive_failures", 0)
        last_heartbeat = data.get("last_heartbeat")

        if data.get("current_job") and last_started and now - last_started > stall_threshold:
            ok = False
            status = "stalled"
            reasons.append("job_running_longer_than_threshold")

        elif queue_depth > 0 and last_success and now - last_success > stall_threshold:
            ok = False
            status = "backlog_stalled"
            reasons.append("queue_backlog_without_recent_success")

        if consecutive_failures >= failure_threshold:
            ok = False
            if status == "ok":
                status = "failing"
            reasons.append("consecutive_failures_exceeded_threshold")

        if last_heartbeat and now - last_heartbeat > stall_threshold * 2:
            ok = False
            if status == "ok":
                status = "no_heartbeat"
            reasons.append("no_recent_activity")

        return HealthStatus(ok=ok, status=status, reasons=reasons)
