import os, json, threading
import redis
from src.ocr import process_pdf
from src.index import embed_and_store
from src.extract import extract_iep, extract_eob
from src.classify import heuristics, classify_text
import psycopg
import psycopg
from http.server import BaseHTTPRequestHandler, HTTPServer

REDIS_URL = os.getenv("REDIS_URL","redis://localhost:6379")
r = redis.from_url(REDIS_URL, decode_responses=True)

def health():
    return {"ok": True}

def run():
    print("Worker starting; listening on Redis LIST 'jobs'.")
    start_health_server()
    while True:
        job = r.blpop("jobs", timeout=5)
        if not job:
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
                task = process_pdf(task)
                # classify
                filename = task.get("filename", "")
                first_page_text = (task.get("pages") or [{"text":""}])[0]["text"]
                tags = heuristics(filename)
                if not tags:
                    try:
                        tags = classify_text(first_page_text, filename)
                    except Exception:
                        tags = ["other"]
                try:
                    db_url = os.getenv("DATABASE_URL")
                    with psycopg.connect(db_url) as conn:
                        conn.execute("UPDATE documents SET doc_tags=%s WHERE id=%s", (tags, task.get("document_id")))
                        conn.commit()
                except Exception as e:
                    print("[WORKER] update doc_tags failed:", e)

                embed_and_store(task)
                # If document is an EOB, run extraction
                try:
                    db_url = os.getenv("DATABASE_URL")
                    with psycopg.connect(db_url) as conn:
                        row = conn.execute("SELECT type FROM documents WHERE id=%s", (task.get("document_id"),)).fetchone()
                        if row and isinstance(row[0], str) and 'eob' in row[0].lower():
                            extract_eob(task)
                except Exception as e:
                    print("[WORKER] eob auto-extract check failed:", e)
            elif kind == "extract_iep":
                extract_iep(task)
            elif kind == "extract_eob":
                extract_eob(task)
            else:
                print("Unknown job kind:", kind)
        except Exception as e:
            print("Job failed:", e)

if __name__ == "__main__":
    run()

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
