import os
import json
import psycopg

DATABASE_URL = os.getenv("DATABASE_URL", "")

def embed_and_store(task: dict):
    doc_id = task.get("document_id")
    org_id = task.get("org_id")
    print(f"[INDEX] Embedding and storing spans for doc_id={doc_id}")
    # TODO: generate embeddings via OpenAI, store in DocSpan (embedding, tsv)
    if not DATABASE_URL:
        print("[INDEX] DATABASE_URL not set; skipping DB write")
        return
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO \"Document\" (id, \"orgId\", \"childId\", type, title, \"s3Key\") VALUES (gen_random_uuid(), %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                            (org_id, org_id, 'pdf', 'Placeholder', 's3://placeholder'))
                conn.commit()
    except Exception as e:
        print("[INDEX] DB error:", e)

