import os, tempfile, subprocess
import boto3
import fitz  # PyMuPDF

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

def process_pdf(task: dict) -> dict:
    key = task["s3_key"]
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "in.pdf")
        dst = os.path.join(td, "ocr.pdf")
        _download_from_s3(key, src)

        # If text layer exists, skip OCR
        try:
            d = fitz.open(src)
            has_text = any(p.get_text().strip() for p in d)
        except Exception:
            has_text = False

        pdf_path = src
        if not has_text:
            try:
                subprocess.run(
                    ["ocrmypdf", "--skip-text", "--fast-web-view", src, dst],
                    check=True, capture_output=True
                )
                pdf_path = dst
            except subprocess.CalledProcessError:
                pdf_path = src

        # Quick page-level text for chunking
        pages = []
        doc = fitz.open(pdf_path)
        for i, page in enumerate(doc):
            text = page.get_text("text") or ""
            pages.append({"page": i + 1, "text": text})

        task["pages"] = pages
        return task

