import types
import sys

import pytest

for _name in ("fitz", "ocrmypdf", "pytesseract", "pypdfium2"):
    if _name not in sys.modules:
        sys.modules[_name] = types.ModuleType(_name)

if "openai" not in sys.modules:
    openai_mod = types.ModuleType("openai")
    class _StubOpenAI:
        def __init__(self, *args, **kwargs):
            pass
    openai_mod.OpenAI = _StubOpenAI  # type: ignore[attr-defined]
    sys.modules["openai"] = openai_mod

if "redis" not in sys.modules:
    redis_mod = types.ModuleType("redis")
    class _FakeRedis:
        def blpop(self, *_args, **_kwargs):
            return None
        def llen(self, *_args, **_kwargs):
            return 0
        def rpush(self, *_args, **_kwargs):
            return 0
    redis_mod.from_url = lambda *_args, **_kwargs: _FakeRedis()  # type: ignore[attr-defined]
    sys.modules["redis"] = redis_mod

psycopg_mod = sys.modules.setdefault("psycopg", types.ModuleType("psycopg"))

def _missing_connect(*_args, **_kwargs):
    raise RuntimeError("psycopg stub")

psycopg_mod.connect = _missing_connect  # type: ignore[attr-defined]
psycopg_mod.Connection = object  # type: ignore[attr-defined]

psycopg_types = sys.modules.setdefault("psycopg.types", types.ModuleType("psycopg.types"))
psycopg_mod.types = psycopg_types  # type: ignore[attr-defined]

json_mod = sys.modules.setdefault("psycopg.types.json", types.ModuleType("psycopg.types.json"))
def _json_wrapper(value):
    return value
json_mod.Json = _json_wrapper  # type: ignore[attr-defined]
psycopg_types.json = json_mod  # type: ignore[attr-defined]

from src import main  # type: ignore


@pytest.fixture(autouse=True)
def reset_handlers(monkeypatch):
    original_handlers = main.JOB_HANDLERS.copy()
    original_retries = main.MAX_JOB_RETRIES
    original_backoff = main.JOB_RETRY_BACKOFF_SECONDS
    original_max_delay = main.JOB_RETRY_MAX_DELAY
    def fake_sleep(_seconds: float) -> None:
        return None
    monkeypatch.setattr(main.time, "sleep", fake_sleep)
    yield
    main.JOB_HANDLERS.clear()
    main.JOB_HANDLERS.update(original_handlers)
    main.MAX_JOB_RETRIES = original_retries
    main.JOB_RETRY_BACKOFF_SECONDS = original_backoff
    main.JOB_RETRY_MAX_DELAY = original_max_delay


def test_dispatch_job_success():
    calls = []

    @main.register_job("success")
    def handler(task):
        calls.append(task)

    main.dispatch_job({"kind": "success", "payload": 1})
    assert calls == [{"kind": "success", "payload": 1}]


def test_dispatch_job_retries_and_failure(monkeypatch):
    attempts = []

    @main.register_job("flaky")
    def handler(task):
        attempts.append(task)
        raise RuntimeError("boom")

    main.MAX_JOB_RETRIES = 2
    with pytest.raises(main.JobFailed) as exc:
        main.dispatch_job({"kind": "flaky"})

    assert exc.value.kind == "flaky"
    assert exc.value.attempts == 2
    assert len(attempts) == 2


class FakeConn:
    def __init__(self):
        self.executed = []
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params):
        self.executed.append((sql.strip(), params))

    def commit(self):
        self.commits += 1


def test_generate_safety_phrase_fallback_on_failure(monkeypatch):
    fake_conn = FakeConn()

    class FakeResponses:
        def create(self, *args, **kwargs):
            raise RuntimeError("openai down")

    class FakeClient:
        def __init__(self):
            self.responses = FakeResponses()

    monkeypatch.setattr(main, "_openai", lambda: FakeClient())
    monkeypatch.setattr(main, "_set_org_context", lambda conn, org_id: None)
    monkeypatch.setattr(main, "_select_segments", lambda *args, **kwargs: [])
    monkeypatch.setattr(main, "psycopg", types.SimpleNamespace(connect=lambda *a, **k: fake_conn))

    monkeypatch.setenv("DATABASE_URL", "postgres://test")

    task = {
        "child_id": "child-1",
        "org_id": "org-1",
        "tag": "teacher",
        "document_id": None,
        "contexts": ["meeting coming up"],
    }

    main.handle_generate_safety_phrase(task)

    assert fake_conn.commits == 1
    assert any("INSERT INTO safety_phrases" in sql for sql, _ in fake_conn.executed)
    inserted = fake_conn.executed[-1][1]
    assert inserted[1] == "teacher"
    assert inserted[4] == "draft"
