import os, json
from openai import OpenAI
import psycopg

DB_URL = os.getenv("DATABASE_URL")
MODEL = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")

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
    with psycopg.connect(DB_URL) as conn:
        spans = conn.execute("SELECT text FROM doc_spans WHERE document_id=%s ORDER BY page ASC LIMIT 30", (document_id,)).fetchall()
    text = "\n\n".join([s[0] for s in spans])

    resp = client.responses.create(
        model=MODEL,
        input=[{"role":"system","content":"Extract EOB fields from this text. Do not invent values."},
               {"role":"user","content": text[:120000]}],
        response_format={ "type":"json_schema", "json_schema": EOB_SCHEMA }
    )
    parsed = json.loads(resp.output[0].content[0].text)

    with psycopg.connect(DB_URL) as conn:
        claim = conn.execute(
            "SELECT id FROM claims WHERE child_id=%s AND service_date=%s AND provider=%s LIMIT 1",
            (task.get("child_id"), parsed.get("service_date"), parsed.get("provider"))
        ).fetchone()
        if claim:
            claim_id = claim[0]
            conn.execute("UPDATE eobs SET parsed_json=%s WHERE document_id=%s", (json.dumps(parsed), document_id))
        else:
            cur = conn.execute(
                "INSERT INTO claims (id, child_id, service_date, provider, amounts_json, status, linked_document_ids) VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s) RETURNING id",
                (task.get("child_id"), parsed.get("service_date"), parsed.get("provider"), json.dumps(parsed.get("amounts", {})), "open", json.dumps([task.get("document_id")]))
            )
            claim_id = cur.fetchone()[0]
            conn.execute(
                "INSERT INTO eobs (id, claim_id, document_id, parsed_json, explanation_text) VALUES (gen_random_uuid(), %s, %s, %s, %s)",
                (claim_id, document_id, json.dumps(parsed), None)
            )
        conn.commit()
    return {"status":"ok"}
