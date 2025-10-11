import os, json, datetime
from openai import OpenAI
import requests
import psycopg
from psycopg.types.json import Json

MODEL = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
API_URL = os.getenv("API_URL", "http://api:8080")
INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "dev-internal")
DATABASE_URL = os.getenv("DATABASE_URL")

IEP_SCHEMA = {
    "name": "IepSnapshot",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "services": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "minutes": {"type": ["string", "number", "null"], "default": None},
                        "frequency": {"type": ["string", "null"], "default": None},
                        "provider": {"type": ["string", "null"], "default": None},
                        "location": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []},
                    },
                    "required": ["name"]
                },
                "default": []
            },
            "goals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "area": {"type": ["string", "null"], "default": None},
                        "baseline": {"type": ["string", "null"], "default": None},
                        "target": {"type": ["string", "null"], "default": None},
                        "measurement": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []},
                    },
                    "required": ["area"]
                },
                "default": []
            },
            "accommodations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "details": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []},
                    },
                    "required": ["name"]
                },
                "default": []
            },
            "placement": {"type": ["string", "null"], "default": None},
            "start_date": {"type": ["string", "null"], "default": None},
            "end_date": {"type": ["string", "null"], "default": None},
            "notes": {"type": "array", "items": {"type": "string"}, "default": []}
        },
        "required": ["services", "goals", "accommodations"],
        "additionalProperties": False
    }
}


def _set_org_context(conn: psycopg.Connection, org_id: str | None) -> None:
    if not org_id:
        return
    try:
        conn.execute("SELECT set_config('request.jwt.org_id', %s, true)", (org_id,))
    except Exception:
        pass


def _parse_date(value: str | None) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value[:10])
    except Exception:
        return None


def _fetch_segments(conn: psycopg.Connection, document_id: str, limit: int = 80) -> list[dict]:
    rows = conn.execute(
        """
        SELECT ds.id::text, ds.page, ds.text, ds.document_id, d.original_name
        FROM doc_spans ds
        JOIN documents d ON d.id = ds.document_id
        WHERE ds.document_id = %s
        ORDER BY ds.page ASC, ds.id ASC
        LIMIT %s
        """,
        (document_id, limit)
    ).fetchall()
    segments = []
    for idx, (span_id, page, text, doc_id, doc_name) in enumerate(rows, start=1):
        label = f"I{idx:03d}"
        segments.append({
            "label": label,
            "span_id": span_id,
            "page": page,
            "text": (text or "").strip(),
            "document_id": doc_id,
            "doc_name": doc_name or "Document"
        })
    return segments


def extract_iep(task: dict):
    document_id = task.get("document_id")
    org_id = task.get("org_id")
    child_id = task.get("child_id")
    print(f"[EXTRACT] IEP for document_id={document_id}")
    if not document_id or not DATABASE_URL:
        return {"status": "skipped"}

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            _set_org_context(conn, org_id)
            segments = _fetch_segments(conn, document_id, limit=80)
            if not segments:
                conn.execute(
                    """
                    INSERT INTO iep_extract (document_id, org_id, services_json, goals_json, accommodations_json, placement, start_date, end_date, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, NULL, NULL, %s)
                    ON CONFLICT (document_id) DO UPDATE
                      SET services_json = EXCLUDED.services_json,
                          goals_json = EXCLUDED.goals_json,
                          accommodations_json = EXCLUDED.accommodations_json,
                          placement = EXCLUDED.placement,
                          start_date = EXCLUDED.start_date,
                          end_date = EXCLUDED.end_date,
                          notes = EXCLUDED.notes
                    """,
                    (document_id, org_id, Json([]), Json([]), Json([]), None, "No readable text extracted.")
                )
                conn.commit()
                return {"status": "empty"}

            label_map = {seg["label"]: seg for seg in segments}
            prompt_parts = [
                "Summarize the following IEP excerpts.",
                "Return structured JSON matching the schema with services, goals, accommodations, placement, and meeting dates.",
                "Include excerpt labels in each item's citations array so staff can trace back to the source."
            ]
            prompt_parts.append("Excerpts:")
            for seg in segments:
                prompt_parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text'][:800]}")
            prompt = "\n".join(prompt_parts)

            response = client.responses.create(
                model=MODEL,
                input=[
                    {"role": "system", "content": "You are Joslyn, a special education assistant. Extract concrete details without inventing."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_schema", "json_schema": IEP_SCHEMA}
            )
            raw = response.output[0].content[0].text if response.output and response.output[0].content else None
            if not raw:
                raise ValueError("empty iep extraction response")
            data = json.loads(raw)

            def _resolve(items: list[dict]) -> list[dict]:
                resolved = []
                for item in items or []:
                    citations = []
                    for label in item.get("citations") or []:
                        label = str(label).strip()
                        if label and label in label_map:
                            citations.append(label)
                    new_item = dict(item)
                    new_item["citations"] = citations
                    resolved.append(new_item)
                return resolved

            services = _resolve(data.get("services") or [])
            goals = _resolve(data.get("goals") or [])
            accommodations = _resolve(data.get("accommodations") or [])
            placement = data.get("placement") or None
            start_date = _parse_date(data.get("start_date"))
            end_date = _parse_date(data.get("end_date"))
            notes = data.get("notes") or []

            notes_text = "\n".join([str(n).strip() for n in (notes or []) if str(n).strip()]) or None
            conn.execute(
                """
                INSERT INTO iep_extract (document_id, org_id, services_json, goals_json, accommodations_json, placement, start_date, end_date, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (document_id) DO UPDATE
                  SET services_json = EXCLUDED.services_json,
                      goals_json = EXCLUDED.goals_json,
                      accommodations_json = EXCLUDED.accommodations_json,
                      placement = EXCLUDED.placement,
                      start_date = EXCLUDED.start_date,
                      end_date = EXCLUDED.end_date,
                      notes = EXCLUDED.notes
                """,
                (
                    document_id,
                    org_id,
                    Json(services),
                    Json(goals),
                    Json(accommodations),
                    placement,
                    start_date,
                    end_date,
                    notes_text,
                ),
            )
            conn.commit()
    except Exception as err:
        print("[WORKER] extract_iep failed:", err)
        if DATABASE_URL:
            try:
                with psycopg.connect(DATABASE_URL) as conn:
                    _set_org_context(conn, org_id)
                    conn.execute(
                        "INSERT INTO iep_extract (document_id, org_id, services_json, goals_json, accommodations_json, placement, start_date, end_date, notes) VALUES (%s, %s, %s, %s, %s, %s, NULL, NULL, %s) ON CONFLICT (document_id) DO UPDATE SET notes = EXCLUDED.notes",
                        (document_id, org_id, Json([]), Json([]), Json([]), None, f"Error: {err}")
                    )
                    conn.commit()
            except Exception as inner:
                print("[WORKER] failed to mark iep_extract error:", inner)
        return {"status": "error"}

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
        if task.get("org_id"):
            headers["x-org-id"] = task["org_id"]
        requests.post(url, headers=headers, json={
            "child_id": task.get("child_id"),
            "document_id": document_id,
            "parsed": parsed,
        }, timeout=20)
    except Exception as e:
        print("[WORKER] failed to POST EOB ingest:", e)
    return {"status":"ok"}
