import os, tempfile
import psycopg
from openai import OpenAI
import boto3
import fitz  # PyMuPDF
import requests

EMBED_MODEL = os.getenv("OPENAI_EMBEDDINGS_MODEL", "text-embedding-3-small")
DB_URL = os.getenv("DATABASE_URL")
API_BASE = os.getenv("API_BASE_URL", "http://localhost:8080")

S3_ENDPOINT = os.environ.get("S3_ENDPOINT")
S3_BUCKET = os.environ.get("S3_BUCKET")
S3_ACCESS_KEY_ID = os.environ.get("S3_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.environ.get("S3_SECRET_ACCESS_KEY")

def _download_from_s3(key: str, path: str):
    s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY_ID,
        aws_secret_access_key=S3_SECRET_ACCESS_KEY,
    )
    s3.download_file(S3_BUCKET, key, path)

def _patch_job(job_id: str | None, stage: str, status: str, error_text: str | None = None):
    if not job_id:
        return
    try:
        requests.patch(f"{API_BASE}/jobs/{job_id}", json={"type": stage, "status": status, **({"error_text": error_text} if error_text else {})}, timeout=5)
    except Exception as e:
        print("[INDEX] patch job failed:", e)

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
    job_id = task.get("job_id")
    s3_key = task.get("s3_key")
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
    # Build bbox map by matching chunks to page blocks
    bbox_by_index: dict[int, tuple[float,float,float,float,float,float]] = {}
    # Download original PDF to derive coordinates
    tmp_pdf = None
    try:
        if s3_key:
            td = tempfile.mkdtemp()
            tmp_pdf = os.path.join(td, "doc.pdf")
            _download_from_s3(s3_key, tmp_pdf)
    except Exception as e:
        print("[INDEX] download for bbox failed:", e)
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

    # If we have the pdf locally, compute bboxes for first match per chunk
    if tmp_pdf:
        try:
            doc = fitz.open(tmp_pdf)
            for idx, m in enumerate(meta):
                try:
                    page_num = int(m["page"]) - 1
                    if page_num < 0 or page_num >= len(doc):
                        continue
                    page = doc[page_num]
                    blocks = page.get_text("blocks")
                    needle = (chunks[idx] or "").strip()[:100].lower()
                    # strip [Summary] prefix if present
                    if needle.startswith("[summary]"):
                        needle = needle.split("\n",1)[-1].lower()
                    best = None
                    for b in blocks:
                        x0,y0,x1,y1,btxt,*_ = b
                        if not isinstance(btxt, str):
                            continue
                        hay = btxt.replace("\n"," ").strip().lower()
                        if needle and needle[:30] in hay:
                            best = (x0,y0,x1,y1,page.rect.width,page.rect.height)
                            break
                    if best:
                        bbox_by_index[idx] = best
                except Exception as e:
                    continue
        except Exception as e:
            print("[INDEX] bbox compute failed:", e)

    if not chunks:
        print("[INDEX] No text chunks to embed")
        return

    resp = client.embeddings.create(model=EMBED_MODEL, input=chunks)
    vectors = [d.embedding for d in resp.data]

    if not DB_URL:
        print("[INDEX] DATABASE_URL not set; skipping DB write")
        return

    _patch_job(job_id, "index", "processing")
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            for idx, (vec, m, text) in enumerate(zip(vectors, meta, chunks)):
                vec_lit = "ARRAY[" + ",".join(str(x) for x in vec) + "]::vector"
                bb = bbox_by_index.get(idx)
                bbox_arr = None
                pw = None
                ph = None
                if bb:
                    x0,y0,x1,y1,pw,ph = bb
                    bbox_arr = f"ARRAY[{x0},{y0},{(x1 - x0)},{(y1 - y0)}]::float8[]"
                cur.execute(
                    f"""
                    INSERT INTO doc_spans (document_id, page, bbox, page_width, page_height, text, embedding)
                    VALUES (%s, %s, {bbox_arr if bbox_arr else 'NULL'}, %s, %s, %s, {vec_lit})
                    """,
                    (document_id, m["page"], pw, ph, text[:4000])
                )
        try:
            conn.execute("UPDATE documents SET processed_at = NOW() WHERE id=%s", (document_id,))
        except Exception:
            pass
        conn.commit()
