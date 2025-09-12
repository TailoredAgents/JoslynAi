FROM python:3.13-slim
WORKDIR /app
# OCR deps
RUN apt-get update && apt-get install -y tesseract-ocr libtesseract-dev poppler-utils ghostscript && rm -rf /var/lib/apt/lists/*
COPY services/worker/requirements.txt ./services/worker/requirements.txt
RUN pip install --no-cache-dir -r services/worker/requirements.txt
COPY services/worker ./services/worker
COPY packages/core ./packages/core
ENV PYTHONUNBUFFERED=1
EXPOSE 9090
CMD ["python","-m","services.worker.main"]

