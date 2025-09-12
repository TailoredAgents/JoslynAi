import os
from pathlib import Path

def process_pdf(task: dict):
    doc_id = task.get("document_id")
    s3_key = task.get("s3_key")
    print(f"[OCR] Processing PDF doc_id={doc_id} s3_key={s3_key}")
    # TODO: download from S3 (boto3), run OCR (ocrmypdf/pytesseract), store pages
    # For scaffold, do nothing
    return True

