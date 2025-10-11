from src.metrics import metrics as worker_metrics  # type: ignore


def test_metrics_snapshot_updates():
    worker_metrics.reset()
    worker_metrics.record_attempt("demo")
    worker_metrics.record_retry("demo")
    worker_metrics.record_success("demo")
    worker_metrics.record_failure("demo")
    worker_metrics.record_duration("demo", 0.5)
    worker_metrics.record_queue_depth("jobs", 3)

    snapshot = worker_metrics.snapshot()
    assert snapshot["counters"]["attempts"]["demo"] == 1
    assert snapshot["counters"]["retries"]["demo"] == 1
    assert snapshot["counters"]["success"]["demo"] == 1
    assert snapshot["counters"]["failure"]["demo"] == 1
    assert snapshot["queue_depths"]["jobs"] == 3
    assert snapshot["latency_seconds"]["demo"]["max"] == 0.5
    assert snapshot["latency_seconds"]["demo"]["count"] == 1
