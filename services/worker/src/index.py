import os, tempfile
import psycopg
from openai import OpenAI
import boto3
import fitz  # PyMuPDF
import requests

EMBED_MODEL = os.getenv("OPENAI_EMBEDDINGS_MODEL", "text-embedding-3-small")
DB_URL = os.getenv("DATABASE_URL")
API_BASE = os.getenv("API_BASE_URL") or os.getenv("API_URL") or "http://localhost:8080"
DEFAULT_ORG = os.getenv("DEMO_ORG_ID", "00000000-0000-4000-8000-000000000000")

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

def _patch_job(job_id: str | None, stage: str, status: str, org_id: str | None = None, error_text: str | None = None):
    if not job_id:
        return
    headers = {
        "x-org-id": (org_id or DEFAULT_ORG),
        "x-user-id": "worker",
        "x-user-email": "worker@system",
        "x-user-role": "system",
    }
    payload = {"type": stage, "status": status}
    if error_text:
        payload["error_text"] = error_text
    try:
        base = API_BASE.rstrip("/")
        resp = requests.patch(f"{base}/jobs/{job_id}", json=payload, headers=headers, timeout=5)
        if resp.status_code >= 400:
            print(f"[INDEX] patch job failed: {resp.status_code} {resp.text}")
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
                try:
                    org = task.get("org_id")
                    conn.execute("SELECT set_config('request.jwt.org_id', %s, true)", (org,))
                except Exception:
                    pass
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
    tmp_dir = None
    bbox_doc = None
    try:
        if s3_key:
            tmp_dir = tempfile.TemporaryDirectory()
            tmp_path = os.path.join(tmp_dir.name, "doc.pdf")
            _download_from_s3(s3_key, tmp_path)
            bbox_doc = fitz.open(tmp_path)
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
    if bbox_doc:
        try:
            for idx, m in enumerate(meta):
                try:
                    page_num = int(m["page"]) - 1
                    if page_num < 0 or not bbox_doc or page_num >= len(bbox_doc):
                        continue
                    page = bbox_doc[page_num]
                    blocks = page.get_text("blocks")
                    needle = (chunks[idx] or "").strip()[:100].lower()
                    if needle.startswith("[summary]"):
                        needle = needle.split("\n", 1)[-1].lower()
                    best = None
                    for b in blocks:
                        x0, y0, x1, y1, btxt, *_ = b
                        if not isinstance(btxt, str):
                            continue
                        hay = btxt.replace("\n", " ").strip().lower()
                        if needle and needle[:30] in hay:
                            best = (x0, y0, x1, y1, page.rect.width, page.rect.height)
                            break
                    if best:
                        bbox_by_index[idx] = best
                except Exception:
                    continue
        except Exception as e:
            print("[INDEX] bbox compute failed:", e)
        finally:
            try:
                bbox_doc.close()
            except Exception:
                pass
            bbox_doc = None
    if tmp_dir:
        try:
            tmp_dir.cleanup()
        except Exception:
            pass

    if not chunks:
        print("[INDEX] No text chunks to embed")
        return

    resp = client.embeddings.create(model=EMBED_MODEL, input=chunks)
    vectors = [d.embedding for d in resp.data]

    if not DB_URL:
        print("[INDEX] DATABASE_URL not set; skipping DB write")
        return

    _patch_job(job_id, "index", "processing", task.get("org_id"))
    with psycopg.connect(DB_URL) as conn:
        try:
            org = task.get("org_id")
            conn.execute("SELECT set_config('request.jwt.org_id', %s, true)", (org,))
        except Exception:
            pass
        with conn.cursor() as cur:
            for idx, (vec, m, text) in enumerate(zip(vectors, meta, chunks)):
                vec_lit = "ARRAY[" + ",".join(str(x) for x in vec) + "]::vector"
                bb = bbox_by_index.get(idx)
                bbox_values = None
                pw = None
                ph = None
                if bb:
                    x0, y0, x1, y1, pw, ph = bb
                    bbox_values = [float(x0), float(y0), float(x1 - x0), float(y1 - y0)]
                    if pw is not None:
                        pw = float(pw)
                    if ph is not None:
                        ph = float(ph)
                query = (
                    "INSERT INTO doc_spans (document_id, org_id, page, bbox, page_width, page_height, text, embedding) "
                    f"VALUES (%s, %s, %s, %s, %s, %s, %s, {vec_lit})"
                )
                cur.execute(
                    query,
                    (document_id, task.get("org_id"), m["page"], bbox_values, pw, ph, text[:4000])
                )
        try:
            conn.execute("UPDATE documents SET processed_at = NOW() WHERE id=%s", (document_id,))
        except Exception:
            pass
        conn.commit()


