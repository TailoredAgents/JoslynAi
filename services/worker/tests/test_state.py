import time

from src.state import WorkerState


def test_worker_state_reports_stalled_job():
    state = WorkerState(stall_threshold_seconds=30)
    state._stall_threshold = 0.01  # tighten for test
    state.mark_job_start("job-1", "demo")
    time.sleep(0.02)
    summary = state.health()
    assert not summary.ok
    assert "job_running_longer_than_threshold" in summary.reasons


def test_worker_state_handles_success_resets_failures():
    state = WorkerState()
    state._stall_threshold = 0.01
    state.mark_job_start("job-1", "demo")
    state.mark_job_failure("boom")
    assert state.snapshot()["consecutive_failures"] == 1
    state.mark_job_start("job-2", "demo")
    state.mark_job_success()
    snap = state.snapshot()
    assert snap["consecutive_failures"] == 0
    assert snap["last_success"] is not None


def test_worker_state_backlog_detection():
    state = WorkerState()
    state._stall_threshold = 0.05
    state.mark_job_success()
    snap = state.snapshot()
    assert snap["last_success"] is not None
    state.record_queue_depth(5)
    # Simulate old success
    state._data["last_success"] = state._data["last_success"] - 1.0  # type: ignore[attr-defined]
    summary = state.health()
    assert not summary.ok
    assert summary.status in {"backlog_stalled", "stalled"}
