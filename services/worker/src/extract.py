import os, json
from openai import OpenAI
import requests

MODEL = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
API_URL = os.getenv("API_URL", "http://api:8080")
INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal")

def extract_iep(task: dict):
    print(f"[EXTRACT] IEP for document_id={task.get('document_id')}")
    return {"status": "ok"}

EOB_SCHEMA = {
  "name": "EOBParse", "strict": True,
  "schema": {
    "type":"object",
    "properties":{
      "claim_id":{"type":["string","null"]},
      "service_date":{"type":["string","null"]},
      "provider":{"type":["string","null"]},
      "codes":{"type":"array","items":{"type":"object"},"default":[]},
      "amounts":{"type":"object","properties":{
        "billed":{"type":["number","null"]},"allowed":{"type":["number","null"]},
        "paid":{"type":["number","null"]},"owed":{"type":["number","null"]}
      }},
      "denial_reason":{"type":["string","null"]}
    },
    "required":["amounts"]
  }
}

def extract_eob(task: dict):
    print(f"[EXTRACT] EOB for document_id={task.get('document_id')}")
    document_id = task["document_id"]
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    # gather a few pages from task if present, else skip
    pages = task.get("pages") or []
    text = "\n\n".join([(p.get("text") or "") for p in pages][:30])

    resp = client.responses.create(
        model=MODEL,
        input=[{"role":"system","content":"Extract EOB fields from this text. Do not invent values."},
               {"role":"user","content": text[:120000]}],
        response_format={ "type":"json_schema", "json_schema": EOB_SCHEMA }
    )
    parsed = json.loads(resp.output[0].content[0].text)
    try:
        url = f"{API_URL}/internal/eob/ingest"
        headers = {"x-internal-key": INTERNAL_KEY, "Content-Type": "application/json"}
        requests.post(url, headers=headers, json={
            "child_id": task.get("child_id"),
            "document_id": document_id,
            "parsed": parsed,
        }, timeout=20)
    except Exception as e:
        print("[WORKER] failed to POST EOB ingest:", e)
    return {"status":"ok"}
