from __future__ import annotations

import threading
from collections import defaultdict
from typing import Dict, Iterable, Tuple


class MetricsRecorder:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._latency: Dict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "total": 0.0, "max": 0.0})
        self._queue_depths: Dict[str, int] = {}

    def record_attempt(self, kind: str) -> None:
        with self._lock:
            self._counters["attempts"][kind] += 1

    def record_retry(self, kind: str) -> None:
        with self._lock:
            self._counters["retries"][kind] += 1

    def record_success(self, kind: str) -> None:
        with self._lock:
            self._counters["success"][kind] += 1

    def record_failure(self, kind: str) -> None:
        with self._lock:
            self._counters["failure"][kind] += 1

    def record_duration(self, kind: str, duration_seconds: float) -> None:
        with self._lock:
            entry = self._latency[kind]
            entry["count"] += 1
            entry["total"] += duration_seconds
            if duration_seconds > entry["max"]:
                entry["max"] = duration_seconds

    def record_queue_depth(self, queue: str, depth: int) -> None:
        with self._lock:
            self._queue_depths[queue] = depth

    def snapshot(self) -> Dict[str, object]:
        with self._lock:
            counters = {section: dict(values) for section, values in self._counters.items()}
            latency = {
                kind: {
                    "count": data["count"],
                    "p50": data["total"] / data["count"] if data["count"] else 0.0,
                    "max": data["max"],
                }
                for kind, data in self._latency.items()
            }
            depths = dict(self._queue_depths)
        return {"counters": counters, "latency_seconds": latency, "queue_depths": depths}

    def reset(self) -> None:
        with self._lock:
            self._counters.clear()
            self._latency.clear()
            self._queue_depths.clear()


metrics = MetricsRecorder()


__all__ = ["MetricsRecorder", "metrics"]
