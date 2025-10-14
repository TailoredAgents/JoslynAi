import json
from typing import Any, Dict, List, Optional

from src.jobs.registry import JobFailed
from src.metrics import metrics as worker_metrics
from src.runner import JobRunner
from src.state import WorkerState


class FakePipeline:
    def __init__(self, redis: "FakeRedis") -> None:
        self._redis = redis
        self._commands: List[tuple[str, tuple, dict]] = []

    def hset(self, *args, **kwargs):
        self._commands.append(("hset", args, kwargs))
        return self

    def zadd(self, *args, **kwargs):
        self._commands.append(("zadd", args, kwargs))
        return self

    def lrem(self, *args, **kwargs):
        self._commands.append(("lrem", args, kwargs))
        return self

    def hdel(self, *args, **kwargs):
        self._commands.append(("hdel", args, kwargs))
        return self

    def zrem(self, *args, **kwargs):
        self._commands.append(("zrem", args, kwargs))
        return self

    def lpush(self, *args, **kwargs):
        self._commands.append(("lpush", args, kwargs))
        return self

    def execute(self):
        for name, args, kwargs in self._commands:
            getattr(self._redis, name)(*args, **kwargs)
        self._commands.clear()
        return []


class FakeRedis:
    def __init__(self, jobs: Optional[List[Dict[str, Any]]] = None) -> None:
        self.jobs = [json.dumps(job) for job in (jobs or [])]
        self.processing: List[str] = []
        self.claims: Dict[str, str] = {}
        self.visibility: Dict[str, float] = {}
        self.brpoplpush_calls: List[Any] = []
        self.llen_calls: List[Any] = []
        self.rpush_calls: List[Any] = []

    def brpoplpush(self, source: str, dest: str, timeout: int):
        self.brpoplpush_calls.append((source, dest, timeout))
        if not self.jobs:
            return None
        payload = self.jobs.pop(0)
        self.processing.insert(0, payload)
        return payload

    def llen(self, queue: str) -> int:
        self.llen_calls.append(queue)
        if queue.endswith(":processing"):
            return len(self.processing)
        return len(self.jobs)

    def rpush(self, queue: str, payload: str) -> None:
        self.rpush_calls.append((queue, payload))

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)

    # --- basic data ops used by the runner ---------------------------------
    def hset(self, _key: str, field: str, value: str) -> None:
        self.claims[field] = value

    def zadd(self, _key: str, mapping: Dict[str, float]) -> None:
        self.visibility.update(mapping)

    def lrem(self, queue: str, _count: int, value: str) -> None:
        target = self.processing if queue.endswith(":processing") else self.jobs
        target[:] = [existing for existing in target if existing != value]

    def hdel(self, _key: str, field: str) -> None:
        self.claims.pop(field, None)

    def zrem(self, _key: str, field: str) -> None:
        self.visibility.pop(field, None)

    def lpush(self, queue: str, value: str) -> None:
        if not queue.endswith(":processing"):
            self.jobs.insert(0, value)
        else:
            self.processing.insert(0, value)

    def hget(self, _key: str, field: str) -> Optional[str]:
        return self.claims.get(field)

    def zrangebyscore(self, _key: str, _min: float, max_score: float) -> List[str]:
        return [token for token, score in self.visibility.items() if score <= max_score]


def test_runner_idle_updates_queue_depth_and_notify():
    worker_metrics.reset()
    state = WorkerState()
    state._stall_threshold = 0.01  # tighten for quick test detection

    redis_client = FakeRedis()
    events: List[str] = []
    notify_called: List[bool] = []

    def notify():
        notify_called.append(True)

    runner = JobRunner(
        redis_client=redis_client,
        state=state,
        queue_name="jobs",
        dead_letter_queue="jobs:dead",
        max_retries=1,
        backoff_seconds=0.0,
        max_delay_seconds=0.0,
        queue_poll_timeout=1,
        queue_log_interval=5,
        failure_sleep_seconds=0.1,
        dispatch_fn=lambda *args, **kwargs: None,
        patch_job_fn=lambda *args, **kwargs: None,
        notify_fn=notify,
        log_fn=lambda event, **fields: events.append(event),
    )

    runner._tick()

    snap = state.snapshot()
    assert snap["queue_depth"] == 0
    assert notify_called == [True]
    assert "queue.depth" in events


def test_runner_dispatch_success():
    worker_metrics.reset()
    task = {"kind": "demo", "job_id": "job-123", "org_id": "org-1"}
    redis_client = FakeRedis(jobs=[task])
    state = WorkerState()
    events: List[str] = []
    dispatched: List[Dict[str, Any]] = []

    def dispatch(task_payload, **kwargs):
        dispatched.append(task_payload)

    runner = JobRunner(
        redis_client=redis_client,
        state=state,
        queue_name="jobs",
        dead_letter_queue="jobs:dead",
        max_retries=1,
        backoff_seconds=0.0,
        max_delay_seconds=0.0,
        queue_poll_timeout=1,
        queue_log_interval=5,
        failure_sleep_seconds=0.1,
        dispatch_fn=dispatch,
        patch_job_fn=lambda *args, **kwargs: None,
        notify_fn=None,
        log_fn=lambda event, **fields: events.append(event),
    )

    runner._tick()

    snap = state.snapshot()
    assert dispatched and dispatched[0]["job_id"] == "job-123"
    assert snap["last_success"] is not None
    assert "job.success" in events


def test_runner_dispatch_failure_records_dead_letter():
    worker_metrics.reset()
    task = {"kind": "fail-demo", "job_id": "job-err", "org_id": "org-1"}
    redis_client = FakeRedis(jobs=[task])
    state = WorkerState()
    events: List[str] = []
    patched: List[Any] = []

    def dispatch(_task, **kwargs):
        raise JobFailed("fail-demo", _task, Exception("boom"), attempts=kwargs.get("max_attempts", 1))

    def patch_job(job_id, kind, status, org_id, error_text):
        patched.append((job_id, kind, status, org_id, error_text))

    runner = JobRunner(
        redis_client=redis_client,
        state=state,
        queue_name="jobs",
        dead_letter_queue="jobs:dead",
        max_retries=1,
        backoff_seconds=0.0,
        max_delay_seconds=0.0,
        queue_poll_timeout=1,
        queue_log_interval=5,
        failure_sleep_seconds=0.1,
        dispatch_fn=dispatch,
        patch_job_fn=patch_job,
        notify_fn=None,
        log_fn=lambda event, **fields: events.append(event),
    )

    runner._tick()

    snap = state.snapshot()
    assert snap["consecutive_failures"] >= 1
    assert patched and patched[0][0] == "job-err"
    assert redis_client.rpush_calls, "dead-letter queue should receive payload"
    assert "job.failed" in events
