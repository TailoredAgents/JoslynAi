import os, json
import redis
from worker.ocr import process_pdf
from worker.index import embed_and_store
from worker.extract import extract_iep, extract_eob

REDIS_URL = os.getenv("REDIS_URL","redis://localhost:6379")
r = redis.from_url(REDIS_URL, decode_responses=True)

def health():
    return {"ok": True}

def run():
    print("Worker starting; listening on Redis LIST 'jobs'.")
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
                embed_and_store(task)
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
