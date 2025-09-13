import os, json, re
from typing import List
from openai import OpenAI

MODEL = os.getenv("OPENAI_MODEL_NANO", "gpt-5-nano")

LABELS = ["iep","eob","denial_letter","therapy_notes","provider_letter","eval_report","other"]

SCHEMA = {
  "name":"DocClass",
  "strict": True,
  "schema":{
    "type":"object",
    "properties": {
      "tags": {
        "type":"array",
        "items":{"type":"string","enum": LABELS},
        "minItems":1
      }
    },
    "required":["tags"]
  }
}

def heuristics(filename:str) -> List[str]:
  f = (filename or "").lower()
  if "eob" in f: return ["eob"]
  if "denial" in f: return ["denial_letter"]
  if "iep" in f: return ["iep"]
  if re.search(r"progress|session|therapy", f): return ["therapy_notes"]
  if re.search(r"eval|evaluation|assessment", f): return ["eval_report"]
  return []

def classify_text(doc_text:str, filename:str) -> List[str]:
  client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
  prompt = f"Filename: {filename}\n\nText sample:\n{(doc_text or '')[:4000]}"
  resp = client.responses.create(
    model=MODEL,
    input=[{"role":"system","content":f"Classify the document into any of {', '.join(LABELS)}. Return 1-2 best tags."},
           {"role":"user","content": prompt}],
    response_format={ "type":"json_schema", "json_schema": SCHEMA }
  )
  return json.loads(resp.output[0].content[0].text)["tags"]

