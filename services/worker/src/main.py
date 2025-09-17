import os, json, threading, datetime
import redis
from src.ocr import process_pdf
from src.index import embed_and_store
from src.extract import extract_iep, extract_eob
from src.classify import heuristics, classify_text
from src.notify import tick as notify_tick
import psycopg
from psycopg.types.json import Json
from openai import OpenAI
from http.server import BaseHTTPRequestHandler, HTTPServer

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
r = redis.from_url(REDIS_URL, decode_responses=True)

def health():
    return {"ok": True}

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = b'{"ok": true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

def start_health_server():
    port = int(os.getenv("PORT", "9090"))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Health server listening on :{port}")

def _set_org_context(conn, org_id):
    if not org_id:
        return
    try:
        conn.execute("SELECT set_config('request.jwt.org_id', %s, true)", (org_id,))
    except Exception:
        pass

IEP_DIFF_SCHEMA = {
    "name": "IepDiffAnalysis",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "default": ""},
            "minutes_changes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service": {"type": "string"},
                        "previous_minutes": {"type": ["number", "string", "null"], "default": None},
                        "current_minutes": {"type": ["number", "string", "null"], "default": None},
                        "change_minutes": {"type": ["number", "string", "null"], "default": None},
                        "change_direction": {"type": "string", "enum": ["increase", "decrease", "same", "unknown"], "default": "unknown"},
                        "frequency": {"type": ["string", "null"], "default": None},
                        "note": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["service"]
                },
                "default": []
            },
            "goals_added": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "goal": {"type": "string"},
                        "note": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["goal"]
                },
                "default": []
            },
            "goals_removed": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "goal": {"type": "string"},
                        "note": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["goal"]
                },
                "default": []
            },
            "accommodations_changed": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "accommodation": {"type": "string"},
                        "change": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["accommodation"]
                },
                "default": []
            },
            "other_notes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "note": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["note"]
                },
                "default": []
            },
            "risk_flags": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "level": {"type": "string", "enum": ["high", "medium", "low"]},
                        "reason": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["level", "reason"]
                },
                "default": []
            }
        },
        "required": ["summary", "minutes_changes", "goals_added", "goals_removed", "accommodations_changed", "other_notes", "risk_flags"],
        "additionalProperties": False
    }
}

IEP_DIFF_SYSTEM_PROMPT = (
    "You are an expert special education advocate comparing two versions of an Individualized Education Program (IEP). "
    "Use the provided labeled excerpts to identify concrete changes. "
    "Only rely on the excerpts; if information is missing, leave fields empty. "
    "Provide clear, parent-friendly language and reference citations using the excerpt IDs exactly as given."
)


def _score_span(text):
    lower = text.lower()
    score = 1
    if "minute" in lower or "min" in lower:
        score += 3
    if "service" in lower or "therapy" in lower:
        score += 2
    if "goal" in lower:
        score += 2
    if "accommodation" in lower or "modification" in lower or "support" in lower:
        score += 2
    if "frequency" in lower or "per week" in lower:
        score += 1
    return score


def _select_segments(conn, document_id, prefix, doc_name, limit=60):
    rows = conn.execute("SELECT id, page, text FROM doc_spans WHERE document_id=%s ORDER BY page ASC LIMIT %s", (document_id, limit * 4)).fetchall()
    scored = []
    for row in rows:
        span_id, page, text = row
        text = (text or "").strip()
        if len(text) < 40:
            continue
        score = _score_span(text)
        scored.append((score, str(span_id), page, text))
    scored.sort(key=lambda item: (-item[0], item[2], item[1]))
    segments = []
    used = set()
    for score, span_id, page, text in scored:
        if span_id in used:
            continue
        label = f"{prefix}{len(segments) + 1:03d}"
        segments.append({
            "label": label,
            "span_id": span_id,
            "document_id": document_id,
            "doc_name": doc_name,
            "page": page,
            "text": text[:600],
            "score": score,
            "which": "latest" if prefix == "L" else "previous"
        })
        used.add(span_id)
        if len(segments) >= limit:
            break
    return segments


def _render_segments(latest_segments, previous_segments):
    parts = []
    if latest_segments:
        parts.append("Latest IEP excerpts:")
        for seg in latest_segments:
            parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
    else:
        parts.append("Latest IEP excerpts: none found.")
    if previous_segments:
        parts.append("\nPrevious IEP excerpts:")
        for seg in previous_segments:
            parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
    else:
        parts.append("\nPrevious IEP excerpts: none found.")
    return "\n".join(parts)


def _resolve_citations(collection, label_map):
    for item in collection or []:
        resolved = []
        for label in item.get("citations") or []:
            label_str = str(label).strip()
            seg = label_map.get(label_str)
            if seg:
                resolved.append(seg["span_id"])
        item["citations"] = resolved


def _collect_used_span_ids(diff_payload, risk_flags):
    used = set()
    for key in ["minutes_changes", "goals_added", "goals_removed", "accommodations_changed", "other_notes"]:
        for item in diff_payload.get(key, []) or []:
            for span_id in item.get("citations") or []:
                used.add(span_id)
    for flag in risk_flags or []:
        for span_id in flag.get("citations") or []:
            used.add(span_id)
    return used


def _build_citation_entries(label_map, used_span_ids):
    entries = []
    for seg in label_map.values():
        if seg["span_id"] not in used_span_ids:
            continue
        entries.append({
            "span_id": seg["span_id"],
            "document_id": seg["document_id"],
            "doc_name": seg["doc_name"],
            "page": seg["page"],
            "snippet": seg["text"][:280],
            "which": seg["which"]
        })
    return entries

_OPENAI_CLIENT = None


def _openai():
    global _OPENAI_CLIENT
    if _OPENAI_CLIENT is None:
        _OPENAI_CLIENT = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _OPENAI_CLIENT


DENIAL_TRANSLATE_SCHEMA = {
    "name": "DenialExplain",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "overview": {"type": "string"},
            "codes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "code": {"type": ["string", "null"]},
                        "title": {"type": ["string", "null"]},
                        "plain_language": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["plain_language"]
                },
                "default": []
            },
            "next_steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string"},
                        "details": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["action", "details"]
                },
                "default": []
            },
            "appeal_recommended": {"type": "boolean", "default": False},
            "appeal_reason": {"type": ["string", "null"], "default": None}
        },
        "required": ["overview", "codes", "next_steps", "appeal_recommended", "appeal_reason"],
        "additionalProperties": False
    }
}

DENIAL_TRANSLATE_SYSTEM_PROMPT = (
    "You are Joslyn, a special education and insurance advocate helping caregivers understand denial letters. "
    "Using only the data and excerpts provided, explain the denial in plain language. Summarize the key codes, the insurer's stated reason, and practical next steps. "
    "If an appeal looks worthwhile, set appeal_recommended to true and explain why. Cite evidence using the excerpt labels (e.g., [D001])."
)


def _score_eob_span(text: str) -> int:
    lower = (text or "").lower()
    score = 1
    if "denial" in lower or "denied" in lower:
        score += 3
    if "code" in lower or "reason" in lower:
        score += 2
    if "appeal" in lower or "next step" in lower:
        score += 2
    if "benefit" in lower or "coverage" in lower:
        score += 1
    if len(lower) > 120:
        score += 1
    return score


def _select_eob_segments(conn, document_id: str, doc_name: str, limit: int = 40):
    rows = conn.execute("SELECT id, page, text FROM doc_spans WHERE document_id=%s ORDER BY page ASC LIMIT %s", (document_id, limit * 3)).fetchall()
    scored = []
    for row in rows:
        span_id, page, text = row
        text = (text or "").strip()
        if len(text) < 40:
            continue
        score = _score_eob_span(text)
        scored.append((score, str(span_id), page, text))
    scored.sort(key=lambda item: (-item[0], item[2], item[1]))
    segments = []
    used = set()
    for score, span_id, page, text in scored:
        if span_id in used:
            continue
        label = f"D{len(segments) + 1:03d}"
        segments.append({
            "label": label,
            "span_id": span_id,
            "document_id": document_id,
            "doc_name": doc_name,
            "page": page,
            "text": text[:600],
            "which": "denial"
        })
        used.add(span_id)
        if len(segments) >= limit:
            break
    return segments


def _render_denial_prompt(parsed: dict, segments: list[dict]) -> str:
    parts = ["Denial data extracted:", json.dumps(parsed or {}, ensure_ascii=False, indent=2)]
    parts.append("
Document excerpts (cite with the bracketed labels):")
    if segments:
        for seg in segments:
            parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
    else:
        parts.append("[No readable excerpts found]")
    return "
".join(parts)


def run():
    print("Worker starting; listening on Redis LIST 'jobs'.")
    start_health_server()
    while True:
        job = r.blpop("jobs", timeout=5)
        if not job:
            try:
                notify_tick()
            except Exception:
                pass
            continue
        _, payload = job
        print("Got job:")
        try:
            task = json.loads(payload)
        except Exception as e:
            print("Invalid job payload", e)
            continue
        kind = task.get("kind")
        try:
            if kind == "ingest_pdf":
                job_id = task.get("job_id")
                try:
                    from src.index import _patch_job as patch_job  # reuse helper
                except Exception:
                    patch_job = lambda *args, **kwargs: None

                patch_job(job_id, "ocr", "processing")
                task = process_pdf(task)
                patch_job(job_id, "ocr", "done")

                filename = task.get("filename", "")
                first_page_text = (task.get("pages") or [{"text": ""}])[0]["text"]
                classification = heuristics(filename, first_page_text)
                if not classification.get("doc_type"):
                    try:
                        classification = classify_text(first_page_text, filename)
                    except Exception:
                        classification = classification or {"doc_type": None, "domains": []}

                doc_type_guess = classification.get("doc_type")
                doc_domains = classification.get("domains") or []
                doc_type_final = doc_type_guess or None
                doc_child_id = task.get("child_id")
                doc_version = None
                doc_tags = []

                db_url = os.getenv("DATABASE_URL")
                if db_url:
                    try:
                        with psycopg.connect(db_url) as conn:
                            _set_org_context(conn, task.get("org_id"))
                            info = conn.execute(
                                "SELECT type, child_id, version FROM documents WHERE id=%s",
                                (task.get("document_id"),)
                            ).fetchone()
                            existing_type = info[0] if info else None
                            if info and info[1]:
                                doc_child_id = info[1]
                            if info:
                                doc_version = info[2]

                            doc_type_final = doc_type_guess or existing_type or "other"
                            tags_buffer = []
                            if doc_type_final:
                                tags_buffer.append(doc_type_final)
                            tags_buffer.extend(f"domain:{d}" for d in doc_domains)
                            if doc_version is not None:
                                try:
                                    tags_buffer.append(f"version:{int(doc_version)}")
                                except Exception:
                                    pass
                            doc_tags = sorted(set(filter(None, tags_buffer))) or ["other"]

                            conn.execute(
                                "UPDATE documents SET doc_tags=%s WHERE id=%s",
                                (doc_tags, task.get("document_id"))
                            )

                            if doc_type_guess and (not existing_type or existing_type in ("", "other")):
                                conn.execute(
                                    "UPDATE documents SET type=%s WHERE id=%s",
                                    (doc_type_guess, task.get("document_id"))
                                )
                                doc_type_final = doc_type_guess

                            conn.commit()
                    except Exception as e:
                        print("[WORKER] update document metadata failed:", e)
                else:
                    doc_type_final = doc_type_final or "other"
                    doc_tags = sorted(set([doc_type_final] + [f"domain:{d}" for d in doc_domains])) or ["other"]

                patch_job(job_id, "index", "processing")
                embed_and_store(task)
                patch_job(job_id, "index", "done")

                if doc_type_final and isinstance(doc_type_final, str) and 'eob' in doc_type_final.lower():
                    patch_job(job_id, "extract", "processing")
                    extract_eob(task)
                    patch_job(job_id, "extract", "done")

                followups = []
                if db_url and doc_child_id:
                    if doc_type_final == "iep":
                        followups.append({
                            "kind": "prep_iep_diff",
                            "document_id": task.get("document_id"),
                            "child_id": doc_child_id,
                            "org_id": task.get("org_id")
                        })
                        followups.append({
                            "kind": "prep_recommendations",
                            "document_id": task.get("document_id"),
                            "child_id": doc_child_id,
                            "org_id": task.get("org_id"),
                            "source": "iep"
                        })
                    elif doc_type_final == "eval_report":
                        followups.append({
                            "kind": "prep_recommendations",
                            "document_id": task.get("document_id"),
                            "child_id": doc_child_id,
                            "org_id": task.get("org_id"),
                            "source": "evaluation"
                        })
                for payload in followups:
                    try:
                        r.rpush("jobs", json.dumps(payload))
                    except Exception as enqueue_err:
                        print("[WORKER] enqueue followup failed:", enqueue_err)

            elif kind == "extract_iep":
                extract_iep(task)
            elif kind == "extract_eob":
                extract_eob(task)


            elif kind == "prep_iep_diff":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                child_id = task.get("child_id")
                latest_document_id = task.get("document_id")
                org_id = task.get("org_id")
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        latest_info = conn.execute(
                            "SELECT original_name, type FROM documents WHERE id=%s",
                            (latest_document_id,)
                        ).fetchone()
                        latest_doc_name = (latest_info[0] if latest_info and latest_info[0] else (latest_info[1] if latest_info else "IEP"))
                        prev_row = conn.execute(
                            """
                            SELECT id, original_name, type FROM documents
                            WHERE child_id=%s AND type='iep' AND id <> %s
                            ORDER BY version DESC, created_at DESC
                            LIMIT 1
                            """,
                            (child_id, latest_document_id)
                        ).fetchone()
                        previous_document_id = prev_row[0] if prev_row else None
                        previous_doc_name = None
                        if prev_row:
                            previous_doc_name = prev_row[1] or prev_row[2] or "Previous IEP"

                        diff_row = conn.execute(
                            "SELECT id FROM iep_diffs WHERE latest_document_id=%s",
                            (latest_document_id,)
                        ).fetchone()
                        if diff_row:
                            diff_id = diff_row[0]
                            conn.execute(
                                "UPDATE iep_diffs SET previous_document_id=%s, status='pending', updated_at=NOW() WHERE id=%s",
                                (previous_document_id, diff_id)
                            )
                        else:
                            diff_id = conn.execute(
                                """
                                INSERT INTO iep_diffs (org_id, child_id, latest_document_id, previous_document_id, diff_json, risk_flags_json, citations_json, status)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
                                RETURNING id
                                """,
                                (org_id, child_id, latest_document_id, previous_document_id, Json({}), Json([]), Json([]))
                            ).fetchone()[0]
                        conn.commit()

                        if not previous_document_id:
                            payload = {
                                "summary": "No previous IEP found to compare against this version.",
                                "minutes_changes": [],
                                "goals_added": [],
                                "goals_removed": [],
                                "accommodations_changed": [],
                                "other_notes": []
                            }
                            conn.execute(
                                "UPDATE iep_diffs SET diff_json=%s, risk_flags_json=%s, citations_json=%s, status='ready', updated_at=NOW() WHERE id=%s",
                                (Json(payload), Json([]), Json([]), diff_id)
                            )
                            conn.commit()
                            continue

                        latest_segments = _select_segments(conn, latest_document_id, "L", latest_doc_name or "IEP", limit=60)
                        previous_segments = _select_segments(conn, previous_document_id, "P", previous_doc_name or "Previous IEP", limit=60)

                        if not latest_segments:
                            payload = {
                                "summary": "We couldn't locate readable text in the IEP to compare.",
                                "minutes_changes": [],
                                "goals_added": [],
                                "goals_removed": [],
                                "accommodations_changed": [],
                                "other_notes": []
                            }
                            conn.execute(
                                "UPDATE iep_diffs SET diff_json=%s, risk_flags_json=%s, citations_json=%s, status='error', updated_at=NOW() WHERE id=%s",
                                (Json(payload), Json([]), Json([]), diff_id)
                            )
                            conn.commit()
                            continue

                        label_map = {seg["label"]: seg for seg in latest_segments + previous_segments}
                        prompt = _render_segments(latest_segments, previous_segments)

                        api_key = os.getenv("OPENAI_API_KEY")
                        if not api_key:
                            payload = {
                                "summary": "Joslyn needs an API key to finish this comparison.",
                                "minutes_changes": [],
                                "goals_added": [],
                                "goals_removed": [],
                                "accommodations_changed": [],
                                "other_notes": []
                            }
                            conn.execute(
                                "UPDATE iep_diffs SET diff_json=%s, risk_flags_json=%s, citations_json=%s, status='error', updated_at=NOW() WHERE id=%s",
                                (Json(payload), Json([]), Json([]), diff_id)
                            )
                            conn.commit()
                            continue

                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": IEP_DIFF_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={"type": "json_schema", "json_schema": IEP_DIFF_SCHEMA}
                        )
                        raw = (response.output[0].content[0].text if response.output and response.output[0].content else None)
                        if not raw:
                            raise ValueError("empty diff response")
                        data = json.loads(raw)
                        diff_payload = {
                            "summary": data.get("summary", ""),
                            "minutes_changes": data.get("minutes_changes") or [],
                            "goals_added": data.get("goals_added") or [],
                            "goals_removed": data.get("goals_removed") or [],
                            "accommodations_changed": data.get("accommodations_changed") or [],
                            "other_notes": data.get("other_notes") or []
                        }
                        risk_flags = data.get("risk_flags") or []
                        for key in ["minutes_changes", "goals_added", "goals_removed", "accommodations_changed", "other_notes"]:
                            _resolve_citations(diff_payload.get(key), label_map)
                        _resolve_citations(risk_flags, label_map)
                        used_span_ids = _collect_used_span_ids(diff_payload, risk_flags)
                        citations_json = _build_citation_entries(label_map, used_span_ids)

                        conn.execute(
                            "UPDATE iep_diffs SET diff_json=%s, risk_flags_json=%s, citations_json=%s, status='ready', updated_at=NOW() WHERE id=%s",
                            (Json(diff_payload), Json(risk_flags), Json(citations_json), diff_id)
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] prep_iep_diff failed:", e)
                    if db_url and latest_document_id:
                        try:
                            with psycopg.connect(db_url) as conn2:
                                _set_org_context(conn2, org_id)
                                conn2.execute(
                                    "UPDATE iep_diffs SET status='error', diff_json=%s, risk_flags_json=%s WHERE latest_document_id=%s",
                                    (Json({"summary": "We ran into a problem generating this diff."}), Json([]), latest_document_id)
                                )
                                conn2.commit()
                        except Exception as inner:
                            print("[WORKER] unable to mark diff error:", inner)

elif kind == "denial_explain":
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        continue
    eob_id = eob_id
    document_id = task.get("document_id")
    child_id = task.get("child_id")
    org_id = task.get("org_id")
    if not eob_id or not document_id:
        continue
    try:
        with psycopg.connect(db_url) as conn:
            _set_org_context(conn, org_id)
            eob_row = conn.execute(
                "SELECT parsed_json FROM eobs WHERE id=%s",
                (eob_id,)
            ).fetchone()
            parsed = eob_row[0] if eob_row else None
            doc_info = conn.execute(
                "SELECT original_name, type FROM documents WHERE id=%s",
                (document_id,)
            ).fetchone()
            doc_name = None
            if doc_info:
                doc_name = doc_info[0] or doc_info[1]
            doc_name = doc_name or "Denial Letter"

            if not parsed:
                conn.execute(
                    """
                    INSERT INTO denial_explanations (org_id, child_id, eob_id, document_id, explanation_json, next_steps_json, citations_json, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'error')
                    ON CONFLICT (eob_id) DO UPDATE
                      SET explanation_json = EXCLUDED.explanation_json,
                          next_steps_json = EXCLUDED.next_steps_json,
                          citations_json = EXCLUDED.citations_json,
                          status = 'error',
                          updated_at = NOW()
                    """,
                    (org_id, child_id, eob_id, document_id, Json({}), Json([]), Json([]))
                )
                conn.commit()
                continue

            segments = _select_eob_segments(conn, document_id, doc_name, limit=40)
            label_map = {seg["label"]: seg for seg in segments}
            prompt = _render_denial_prompt(parsed, segments)

            client = _openai()
            model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
            response = client.responses.create(
                model=model,
                input=[
                    {"role": "system", "content": DENIAL_TRANSLATE_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_schema", "json_schema": DENIAL_TRANSLATE_SCHEMA}
            )
            raw = (response.output[0].content[0].text if response.output and response.output[0].content else None)
            if not raw:
                raise ValueError("empty denial explanation response")
            data = json.loads(raw)
            explanation_json = {
                "overview": data.get("overview", ""),
                "codes": data.get("codes") or [],
                "appeal_recommended": bool(data.get("appeal_recommended")),
                "appeal_reason": data.get("appeal_reason")
            }
            next_steps_json = data.get("next_steps") or []

            _resolve_citations(explanation_json.get("codes"), label_map)
            _resolve_citations(next_steps_json, label_map)

            used_ids = set()
            for collection in (explanation_json.get("codes") or []):
                for span_id in collection.get("citations") or []:
                    used_ids.add(span_id)
            for step in next_steps_json or []:
                for span_id in step.get("citations") or []:
                    used_ids.add(span_id)

            citations_json = _build_citation_entries(label_map, used_ids)

            conn.execute(
                """
                INSERT INTO denial_explanations (org_id, child_id, eob_id, document_id, explanation_json, next_steps_json, citations_json, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ready')
                ON CONFLICT (eob_id) DO UPDATE
                  SET explanation_json = EXCLUDED.explanation_json,
                      next_steps_json = EXCLUDED.next_steps_json,
                      citations_json = EXCLUDED.citations_json,
                      status = 'ready',
                      updated_at = NOW()
                """,
                (org_id, child_id, eob_id, document_id, Json(explanation_json), Json(next_steps_json), Json(citations_json))
            )
            conn.commit()
    except Exception as e:
        print("[WORKER] denial_explain failed:", e)
        if db_url and eob_id:
            try:
                with psycopg.connect(os.getenv("DATABASE_URL")) as conn2:
                    _set_org_context(conn2, org_id)
                    conn2.execute(
                        "UPDATE denial_explanations SET status='error', updated_at=NOW() WHERE eob_id=%s",
                        (eob_id,)
                    )
                    conn2.commit()
            except Exception as inner:
                print("[WORKER] unable to mark denial explanation error:", inner)


            elif kind == "goal_smart":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                document_id = task.get("document_id")
                goal_identifier = task.get("goal_identifier")
                goal_text = task.get("goal_text")
                if not goal_text or not goal_identifier:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        segments = []
                        if document_id:
                            segments = _select_segments(conn, document_id, "G", "IEP Goal", limit=30)
                        prompt_parts = [
                            "Original goal:",
                            goal_text,
                            "",
                            "Evaluate the goal using SMART criteria (Specific, Measurable, Attainable, Relevant, Time-bound).",
                            "Return a table of ratings plus a rewritten goal that is measurable and includes baseline/progress monitoring plan.",
                        ]
                        if segments:
                            prompt_parts.append("Supporting excerpts:")
                            for seg in segments:
                                prompt_parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
                        prompt = "
".join(prompt_parts)

                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        schema = {
                            "name": "GoalSmartRewrite",
                            "strict": True,
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "rubric": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "criterion": {"type": "string"},
                                                "rating": {"type": "string"},
                                                "notes": {"type": "string"}
                                            },
                                            "required": ["criterion", "rating"]
                                        },
                                        "default": []
                                    },
                                    "baseline": {"type": "string", "default": ""},
                                    "measurement_plan": {"type": "string", "default": ""},
                                    "rewrite": {"type": "string"},
                                    "citations": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                        "default": []
                                    }
                                },
                                "required": ["rubric", "rewrite"],
                                "additionalProperties": False
                            }
                        }

                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": "You are Joslyn, a special education advocate. Provide concise, actionable output."},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={"type": "json_schema", "json_schema": schema}
                        )
                        raw = response.output[0].content[0].text if response.output and response.output[0].content else None
                        if not raw:
                            raise ValueError("empty SMART response")
                        data = json.loads(raw)
                        rewrite_json = {
                            "rubric": data.get("rubric") or [],
                            "rewrite": data.get("rewrite") or "",
                            "baseline": data.get("baseline") or "",
                            "measurement_plan": data.get("measurement_plan") or "",
                            "citations": data.get("citations") or []
                        }

                        label_map = {seg["label"]: seg for seg in segments}
                        _resolve_citations([rewrite_json], label_map)
                        citations_json = _build_citation_entries(label_map, set(rewrite_json.get("citations") or []))

                        conn.execute(
                            """
                            INSERT INTO goal_rewrites (org_id, child_id, document_id, goal_identifier, rubric_json, rewrite_json, citations_json, status)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, 'draft')
                            ON CONFLICT (child_id, goal_identifier) DO UPDATE
                              SET rubric_json = EXCLUDED.rubric_json,
                                  rewrite_json = EXCLUDED.rewrite_json,
                                  citations_json = EXCLUDED.citations_json,
                                  status = 'draft',
                                  updated_at = NOW()
                            """,
                            (org_id, child_id, document_id, goal_identifier, Json(rewrite_json.get("rubric") or []), Json(rewrite_json), Json(citations_json))
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] goal_smart failed:", e)
            elif kind == "build_appeal_kit":
                kit_id = task.get("kit_id")
                db_url = os.getenv("DATABASE_URL")
                if not db_url or not kit_id:
                    continue
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        kit = conn.execute(
                            "SELECT id, child_id, org_id, denial_id, deadline_date, metadata_json FROM appeal_kits WHERE id=%s",
                            (kit_id,)
                        ).fetchone()
                        if not kit:
                            continue
                        denial_id = kit[3]
                        if not denial_id:
                            conn.execute(
                                "UPDATE appeal_kits SET status='error', updated_at=NOW() WHERE id=%s",
                                (kit_id,)
                            )
                            conn.commit()
                            continue
                        explanation = conn.execute(
                            "SELECT explanation_json, next_steps_json, citations_json, status FROM denial_explanations WHERE eob_id=%s",
                            (denial_id,)
                        ).fetchone()
                        if not explanation or explanation[3] != 'ready':
                            conn.execute(
                                "UPDATE appeal_kits SET status='pending', updated_at=NOW() WHERE id=%s",
                                (kit_id,)
                            )
                            conn.commit()
                            continue
                        explanation_json = explanation[0] or {}
                        next_steps = explanation[1] or []
                        citations = explanation[2] or []
                        conn.execute("DELETE FROM appeal_kit_items WHERE appeal_kit_id=%s", (kit_id,))
                        cover_lines = [
                            "To whom it may concern,",
                            "",
                            explanation_json.get("overview") or "We are requesting reconsideration of this denial.",
                        ]
                        appeal_reason = explanation_json.get("appeal_reason")
                        if appeal_reason:
                            cover_lines.append("")
                            cover_lines.append(f"Why this matters: {appeal_reason}")
                        cover_lines.append("")
                        cover_lines.append("Please review the attached evidence and respond within the required timelines.")
                        cover_letter = "
".join(cover_lines)
                        conn.execute(
                            "INSERT INTO appeal_kit_items (appeal_kit_id, org_id, kind, status, payload_json, citations_json) VALUES (%s, %s, %s, %s, %s, %s)",
                            (kit_id, org_id, "cover_letter", "ready", Json({"title": "Appeal Letter", "body": cover_letter}), Json(citations))
                        )
                        evidence_entries = []
                        for code in explanation_json.get("codes") or []:
                            evidence_entries.append({
                                "code": code.get("code"),
                                "description": code.get("plain_language"),
                                "citations": code.get("citations") or []
                            })
                        conn.execute(
                            "INSERT INTO appeal_kit_items (appeal_kit_id, org_id, kind, status, payload_json, citations_json) VALUES (%s, %s, %s, %s, %s, %s)",
                            (kit_id, org_id, "evidence", "ready", Json({"items": evidence_entries}), Json(citations))
                        )
                        checklist = [
                            {"label": "Signed appeal letter", "completed": False},
                            {"label": "Copy of denial letter/EOB", "completed": False},
                            {"label": "Supporting documentation", "completed": False}
                        ]
                        for idx, step in enumerate(next_steps or []):
                            label = step.get("action") or f"Step {idx + 1}"
                            checklist.append({"label": label, "completed": False})
                        conn.execute(
                            "INSERT INTO appeal_kit_items (appeal_kit_id, org_id, kind, status, payload_json, citations_json) VALUES (%s, %s, %s, %s, %s, %s)",
                            (kit_id, org_id, "checklist", "ready", Json({"items": checklist}), Json(citations))
                        )
                        metadata = kit[5] or {}
                        metadata["appeal_recommended"] = bool(explanation_json.get("appeal_recommended"))
                        metadata["appeal_reason"] = appeal_reason
                        metadata["generated_at"] = datetime.datetime.utcnow().isoformat() + "Z"
                        conn.execute(
                            "UPDATE appeal_kits SET metadata_json=%s, checklist_json=%s, citations_json=%s, status='ready', updated_at=NOW() WHERE id=%s",
                            (Json(metadata), Json(checklist), Json(citations), kit_id)
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] build_appeal_kit failed:", e)
            elif kind == "prep_recommendations":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, task.get("org_id"))
                        conn.execute(
                            """
                            INSERT INTO recommendations (org_id, child_id, source_kind, recommendations_json, citations_json, status)
                            VALUES (%s, %s, %s, %s, %s, 'stale')
                            ON CONFLICT (child_id, source_kind) DO UPDATE
                              SET status = 'stale',
                                  recommendations_json = EXCLUDED.recommendations_json,
                                  citations_json = EXCLUDED.citations_json,
                                  updated_at = NOW()
                            """,
                            (
                                task.get("org_id"),
                                task.get("child_id"),
                                task.get("source") or "auto",
                                [],
                                []
                            )
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] prep_recommendations failed:", e)
            else:
                print("Unknown job kind:", kind)
        except Exception as e:
            print("Job failed:", e)

if __name__ == "__main__":
    run()
