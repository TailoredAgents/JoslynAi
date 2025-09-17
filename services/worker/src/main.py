import os, json, threading
import redis
from src.ocr import process_pdf
from src.index import embed_and_store
from src.extract import extract_iep, extract_eob
from src.classify import heuristics, classify_text
from src.notify import tick as notify_tick
import psycopg
from http.server import BaseHTTPRequestHandler, HTTPServer

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
r = redis.from_url(REDIS_URL, decode_responses=True)

def health():
    return {"ok": True}

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = b'{"ok": true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

def start_health_server():
    port = int(os.getenv("PORT", "9090"))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Health server listening on :{port}")

def _set_org_context(conn, org_id):
    if not org_id:
        return
    try:
        conn.execute("SELECT set_config('request.jwt.org_id', %s, true)", (org_id,))
    except Exception:
        pass

def run():
    print("Worker starting; listening on Redis LIST 'jobs'.")
    start_health_server()
    while True:
        job = r.blpop("jobs", timeout=5)
        if not job:
            try:
                notify_tick()
            except Exception:
                pass
            continue
        _, payload = job
        print("Got job:")
        try:
            task = json.loads(payload)
        except Exception as e:
            print("Invalid job payload", e)
            continue
        kind = task.get("kind")
        try:
            if kind == "ingest_pdf":
                job_id = task.get("job_id")
                try:
                    from src.index import _patch_job as patch_job  # reuse helper
                except Exception:
                    patch_job = lambda *args, **kwargs: None

                patch_job(job_id, "ocr", "processing")
                task = process_pdf(task)
                patch_job(job_id, "ocr", "done")

                filename = task.get("filename", "")
                first_page_text = (task.get("pages") or [{"text": ""}])[0]["text"]
                classification = heuristics(filename, first_page_text)
                if not classification.get("doc_type"):
                    try:
                        classification = classify_text(first_page_text, filename)
                    except Exception:
                        classification = classification or {"doc_type": None, "domains": []}

                doc_type_guess = classification.get("doc_type")
                doc_domains = classification.get("domains") or []
                doc_type_final = doc_type_guess or None
                doc_child_id = task.get("child_id")
                doc_version = None
                doc_tags = []

                db_url = os.getenv("DATABASE_URL")
                if db_url:
                    try:
                        with psycopg.connect(db_url) as conn:
                            _set_org_context(conn, task.get("org_id"))
                            info = conn.execute(
                                "SELECT type, child_id, version FROM documents WHERE id=%s",
                                (task.get("document_id"),)
                            ).fetchone()
                            existing_type = info[0] if info else None
                            if info and info[1]:
                                doc_child_id = info[1]
                            if info:
                                doc_version = info[2]

                            doc_type_final = doc_type_guess or existing_type or "other"
                            tags_buffer = []
                            if doc_type_final:
                                tags_buffer.append(doc_type_final)
                            tags_buffer.extend(f"domain:{d}" for d in doc_domains)
                            if doc_version is not None:
                                try:
                                    tags_buffer.append(f"version:{int(doc_version)}")
                                except Exception:
                                    pass
                            doc_tags = sorted(set(filter(None, tags_buffer))) or ["other"]

                            conn.execute(
                                "UPDATE documents SET doc_tags=%s WHERE id=%s",
                                (doc_tags, task.get("document_id"))
                            )

                            if doc_type_guess and (not existing_type or existing_type in ("", "other")):
                                conn.execute(
                                    "UPDATE documents SET type=%s WHERE id=%s",
                                    (doc_type_guess, task.get("document_id"))
                                )
                                doc_type_final = doc_type_guess

                            conn.commit()
                    except Exception as e:
                        print("[WORKER] update document metadata failed:", e)
                else:
                    doc_type_final = doc_type_final or "other"
                    doc_tags = sorted(set([doc_type_final] + [f"domain:{d}" for d in doc_domains])) or ["other"]

                patch_job(job_id, "index", "processing")
                embed_and_store(task)
                patch_job(job_id, "index", "done")

                if doc_type_final and isinstance(doc_type_final, str) and 'eob' in doc_type_final.lower():
                    patch_job(job_id, "extract", "processing")
                    extract_eob(task)
                    patch_job(job_id, "extract", "done")

                followups = []
                if db_url and doc_child_id:
                    if doc_type_final == "iep":
                        followups.append({
                            "kind": "prep_iep_diff",
                            "document_id": task.get("document_id"),
                            "child_id": doc_child_id,
                            "org_id": task.get("org_id")
                        })
                        followups.append({
                            "kind": "prep_recommendations",
                            "document_id": task.get("document_id"),
                            "child_id": doc_child_id,
                            "org_id": task.get("org_id"),
                            "source": "iep"
                        })
                    elif doc_type_final == "eval_report":
                        followups.append({
                            "kind": "prep_recommendations",
                            "document_id": task.get("document_id"),
                            "child_id": doc_child_id,
                            "org_id": task.get("org_id"),
                            "source": "evaluation"
                        })
                for payload in followups:
                    try:
                        r.rpush("jobs", json.dumps(payload))
                    except Exception as enqueue_err:
                        print("[WORKER] enqueue followup failed:", enqueue_err)

            elif kind == "extract_iep":
                extract_iep(task)
            elif kind == "extract_eob":
                extract_eob(task)
            elif kind == "prep_iep_diff":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, task.get("org_id"))
                        prev = conn.execute(
                            """
                            SELECT id FROM documents
                            WHERE child_id=%s AND type='iep' AND id <> %s
                            ORDER BY version DESC, created_at DESC
                            LIMIT 1
                            """,
                            (task.get("child_id"), task.get("document_id"))
                        ).fetchone()
                        conn.execute(
                            """
                            INSERT INTO iep_diffs (org_id, child_id, latest_document_id, previous_document_id, diff_json, risk_flags_json, citations_json, status)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
                            ON CONFLICT (latest_document_id) DO UPDATE
                              SET previous_document_id = EXCLUDED.previous_document_id,
                                  diff_json = EXCLUDED.diff_json,
                                  risk_flags_json = EXCLUDED.risk_flags_json,
                                  citations_json = EXCLUDED.citations_json,
                                  status = 'pending',
                                  updated_at = NOW()
                            """,
                            (
                                task.get("org_id"),
                                task.get("child_id"),
                                task.get("document_id"),
                                prev[0] if prev else None,
                                {"sections": []},
                                [],
                                []
                            )
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] prep_iep_diff failed:", e)
            elif kind == "prep_recommendations":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, task.get("org_id"))
                        conn.execute(
                            """
                            INSERT INTO recommendations (org_id, child_id, source_kind, recommendations_json, citations_json, status)
                            VALUES (%s, %s, %s, %s, %s, 'stale')
                            ON CONFLICT (child_id, source_kind) DO UPDATE
                              SET status = 'stale',
                                  recommendations_json = EXCLUDED.recommendations_json,
                                  citations_json = EXCLUDED.citations_json,
                                  updated_at = NOW()
                            """,
                            (
                                task.get("org_id"),
                                task.get("child_id"),
                                task.get("source") or "auto",
                                [],
                                []
                            )
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] prep_recommendations failed:", e)
            else:
                print("Unknown job kind:", kind)
        except Exception as e:
            print("Job failed:", e)

if __name__ == "__main__":
    run()
