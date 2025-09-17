import os, json, re
from typing import List, Dict
from openai import OpenAI

MODEL = os.getenv("OPENAI_MODEL_NANO", "gpt-5-nano")

LABELS = ["iep","eob","denial_letter","therapy_notes","provider_letter","eval_report","other"]
DOMAINS = [
  "speech_language",
  "occupational_therapy",
  "physical_therapy",
  "behavior",
  "academic",
  "social_emotional",
  "medical",
  "assistive_technology",
  "transportation",
  "other"
]

SCHEMA = {
  "name":"DocClass",
  "strict": True,
  "schema":{
    "type":"object",
    "properties": {
      "doc_type": {
        "type":"string",
        "enum": LABELS
      },
      "domains": {
        "type":"array",
        "items":{"type":"string","enum": DOMAINS},
        "default": []
      }
    },
    "required":["doc_type","domains"]
  }
}

Classification = Dict[str, List[str] | str | None]

def heuristics(filename:str, sample:str = "") -> Classification:
  f = (filename or "").lower()
  text = (sample or "").lower()
  doc_type = None
  if "eob" in f:
    doc_type = "eob"
  elif "denial" in f:
    doc_type = "denial_letter"
  elif "iep" in f:
    doc_type = "iep"
  elif re.search(r"progress|session|therapy", f):
    doc_type = "therapy_notes"
  elif re.search(r"eval|evaluation|assessment", f):
    doc_type = "eval_report"

  domains: List[str] = []
  domain_keywords = [
    ("speech", "speech_language"),
    ("language", "speech_language"),
    ("ot ", "occupational_therapy"),
    ("occupational therapy", "occupational_therapy"),
    ("pta", "physical_therapy"),
    ("physical therapy", "physical_therapy"),
    ("behavior", "behavior"),
    ("aba", "behavior"),
    ("reading", "academic"),
    ("math", "academic"),
    ("social", "social_emotional"),
    ("emotional", "social_emotional"),
    ("medical", "medical"),
    ("assistive", "assistive_technology"),
    ("device", "assistive_technology"),
    ("transport", "transportation")
  ]
  for token, domain in domain_keywords:
    if token in text:
      domains.append(domain)
  domains = sorted(set(domains))
  return {"doc_type": doc_type, "domains": domains}

def classify_text(doc_text:str, filename:str) -> Classification:
  client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
  heur = heuristics(filename, doc_text)
  prompt = f"Filename: {filename}

Text sample:
{(doc_text or '')[:4000]}"
  try:
    resp = client.responses.create(
      model=MODEL,
      input=[{"role":"system","content":f"Classify the document. Return doc_type (one of {', '.join(LABELS)}) and up to 3 evaluation domains from {DOMAINS}."},
             {"role":"user","content": prompt}],
      response_format={ "type":"json_schema", "json_schema": SCHEMA }
    )
    parsed = json.loads(resp.output[0].content[0].text)
  except Exception:
    return heur
  doc_type = parsed.get("doc_type") or heur.get("doc_type") or "other"
  domains = parsed.get("domains") or []
  domains = [d for d in domains if d and d != "other"]
  domains.extend(heur.get("domains") or [])
  domains = sorted(set(domains))
  return {"doc_type": doc_type, "domains": domains}

