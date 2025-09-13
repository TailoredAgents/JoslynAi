FROM python:3.13-slim
WORKDIR /app
# OCR deps
RUN apt-get update && apt-get install -y tesseract-ocr libtesseract-dev poppler-utils ghostscript && rm -rf /var/lib/apt/lists/*
COPY services/worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/worker/src ./src
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
EXPOSE 9090
CMD ["python","-m","src.main"]
