import os
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

def _summarize(text: str, client: OpenAI) -> str:
    model = os.getenv("OPENAI_MODEL_NANO", "gpt-5-nano")
    prompt = (text or "").strip()[:2000]
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Summarize in 1-2 short sentences (<=200 chars)."},
                {"role": "user", "content": prompt },
            ],
            max_tokens=80,
        )
        return (resp.choices[0].message.content or "").strip()[:200]
    except Exception as e:
        print("[INDEX] summarize failed:", e)
        return ""

def embed_and_store(task: dict):
    document_id = task["document_id"]
    pages = task.get("pages") or []
    print(f"[INDEX] Embedding and storing spans for document_id={document_id}")
    # Idempotency: skip if already indexed
    try:
        if DB_URL:
            with psycopg.connect(DB_URL) as conn:
                cnt = conn.execute("SELECT COUNT(*) FROM doc_spans WHERE document_id=%s", (document_id,)).fetchone()[0]
                if cnt and cnt > 0:
                    print("[INDEX] Spans already exist; skipping embed")
                    return
    except Exception as e:
        print("[INDEX] idempotency check failed:", e)

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    chunks = []
    meta = []
    for p in pages:
        text = p.get("text") or ""
        summary = _summarize(text, client)
        first = True
        for c in _chunk(text):
            if first and summary:
                c = f"[Summary] {summary}\n" + c
                first = False
            chunks.append(c)
            meta.append({"page": p["page"]})

    if not chunks:
        print("[INDEX] No text chunks to embed")
        return

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
                    INSERT INTO doc_spans (document_id, page, bbox, text, embedding)
                    VALUES (%s, %s, %s, %s, {vec_lit})
                    """,
                    (document_id, m["page"], None, text[:4000])
                )
        try:
            conn.execute("UPDATE documents SET processed_at = NOW() WHERE id=%s", (document_id,))
        except Exception:
            pass
        conn.commit()
