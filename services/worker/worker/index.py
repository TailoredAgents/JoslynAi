import os
import math
import psycopg
from openai import OpenAI

EMBED_MODEL = os.getenv("OPENAI_EMBEDDINGS_MODEL", "text-embedding-3-small")
DB_URL = os.getenv("DATABASE_URL")

def _chunk(text: str, max_chars: int = 1800):
    text = text or ""
    parts = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        parts.append(text[start:end])
        start = end
    return [p for p in parts if p.strip()]

def embed_and_store(task: dict):
    document_id = task["document_id"]
    pages = task.get("pages") or []
    print(f"[INDEX] Embedding and storing spans for document_id={document_id}")

    chunks = []
    meta = []
    for p in pages:
        for c in _chunk(p.get("text") or ""):
            chunks.append(c)
            meta.append({"page": p["page"]})

    if not chunks:
        print("[INDEX] No text chunks to embed")
        return

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    resp = client.embeddings.create(model=EMBED_MODEL, input=chunks)
    vectors = [d.embedding for d in resp.data]

    if not DB_URL:
        print("[INDEX] DATABASE_URL not set; skipping DB write")
        return

    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            for vec, m, text in zip(vectors, meta, chunks):
                vec_lit = "ARRAY[" + ",".join(str(x) for x in vec) + "]::vector"
                cur.execute(
                    f"""
                    INSERT INTO doc_spans (document_id, page, bbox, text, embedding, tsv)
                    VALUES (%s, %s, %s, %s, {vec_lit}, to_tsvector('english', %s))
                    """,
                    (document_id, m["page"], None, text[:4000], text[:4000])
                )
        conn.commit()
