import os, json, threading, datetime, hashlib
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


RESEARCH_SUMMARY_SCHEMA = {
    "name": "ResearchSummary",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "teacher_voice": {"type": "string", "default": ""},
            "caregiver_voice": {"type": "string", "default": ""},
            "reading_level": {"type": ["string", "null"], "default": None},
            "glossary": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "term": {"type": "string"},
                        "definition": {"type": "string"}
                    },
                    "required": ["term", "definition"]
                },
                "default": []
            },
            "citations": {"type": "array", "items": {"type": "string"}, "default": []}
        },
        "required": ["summary"],
        "additionalProperties": False
    }
}

RECOMMENDATIONS_SCHEMA = {
    "name": "AccommodationRecommendations",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "recommendations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "default": ""},
                        "title": {"type": "string", "default": ""},
                        "support": {"type": "string"},
                        "rationale": {"type": "string"},
                        "support_es": {"type": "string", "default": ""},
                        "rationale_es": {"type": "string", "default": ""},
                        "citations": {
                            "type": "array",
                            "items": {"type": "string"},
                            "default": []
                        }
                    },
                    "required": ["support", "rationale"],
                    "additionalProperties": False
                },
                "default": []
            }
        },
        "required": ["recommendations"],
        "additionalProperties": False
    }
}

RECOMMENDATIONS_SYSTEM_PROMPT = (
    "You are Joslyn, a special education advocate preparing service and accommodation recommendations for a family. "
    "Review the labeled excerpts and suggest concrete supports that are backed by the evidence provided. "
    "Each recommendation must include a brief plain-language summary, a rationale that references student need, "
    "and cite the supporting excerpts using the provided labels. "
    "Provide Spanish translations so caregivers can share them bilingually. "
    "If there is not enough evidence to justify a recommendation, return an empty list."
)

ADVOCACY_OUTLINE_SCHEMA = {
    "name": "AdvocacyOutline",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "default": ""},
            "facts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "detail": {"type": "string"},
                        "impact": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["detail"],
                    "additionalProperties": False
                },
                "default": []
            },
            "attempts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "attempt": {"type": "string"},
                        "outcome": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["attempt"],
                    "additionalProperties": False
                },
                "default": []
            },
            "remedies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "remedy": {"type": "string"},
                        "rationale": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["remedy"],
                    "additionalProperties": False
                },
                "default": []
            },
            "next_steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "step": {"type": "string"},
                        "timeline": {"type": ["string", "null"], "default": None},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["step"],
                    "additionalProperties": False
                },
                "default": []
            },
            "closing": {"type": "string", "default": ""}
        },
        "required": ["facts", "remedies"],
        "additionalProperties": False
    }
}

ADVOCACY_OUTLINE_SYSTEM_PROMPT = (
    "You are Joslyn, a special education advocate drafting a mediation or complaint outline for a caregiver. "
    "Use plain, empowering language, keep entries concise, and rely only on the provided excerpts. "
    "Organize the response into background facts, previous attempts to resolve the issue, requested remedies, and suggested next steps. "
    "Include citations by referencing the excerpt labels (e.g., [O001]) that justify each entry."
)

SAFETY_PHRASE_SYSTEM_PROMPT = (
    "You are Joslyn, a special education advocate drafting supportive phrases to guide caregivers. "
    "Use the provided context and tagged events to suggest trauma-informed wording in English and Spanish. "
    "Keep each phrase concise (<=40 words), empathetic, and actionable. "
    "Return entries grouped by tag, each with English and Spanish text and optional rationale."
)

ONE_PAGER_SCHEMA = {
    "name": "TeacherOnePager",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "default": ""},
            "intro_en": {"type": "string", "default": ""},
            "intro_es": {"type": "string", "default": ""},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "heading": {"type": "string"},
                        "body_en": {"type": "string"},
                        "body_es": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["heading", "body_en", "body_es"],
                    "additionalProperties": False
                },
                "default": []
            },
            "strategies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label_en": {"type": "string"},
                        "label_es": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}, "default": []}
                    },
                    "required": ["label_en", "label_es"],
                    "additionalProperties": False
                },
                "default": []
            },
            "closing_en": {"type": "string", "default": ""},
            "closing_es": {"type": "string", "default": ""}
        },
        "required": ["intro_en", "intro_es"],
        "additionalProperties": False
    }
}

ONE_PAGER_SYSTEM_PROMPT = (
    "You are Joslyn, a special education advocate creating a bilingual one-pager for school staff. "
    "Use the provided child context, supports, and excerpts to draft concise sections in English and Spanish. "
    "Focus on strengths, key supports, and collaboration tips. "
    "Cite evidence using the excerpt labels (e.g., [W001]) wherever you reference evaluation data."
)


def _select_research_segments(conn, document_id: str, doc_name: str, limit: int = 60):
    rows = conn.execute("SELECT id, page, text FROM doc_spans WHERE document_id=%s ORDER BY page ASC LIMIT %s", (document_id, limit * 3)).fetchall()
    scored = []
    for row in rows:
        span_id, page, text = row
        text = (text or "").strip()
        if len(text) < 80:
            continue
        lower = text.lower()
        score = 1
        if "summary" in lower or "conclusion" in lower:
            score += 3
        if "recommend" in lower or "score" in lower or "percentile" in lower:
            score += 2
        if "strength" in lower or "need" in lower:
            score += 1
        scored.append((score, str(span_id), page, text))
    scored.sort(key=lambda item: (-item[0], item[2], item[1]))
    segments = []
    used = set()
    for score, span_id, page, text in scored:
        if span_id in used:
            continue
        label = f"R{len(segments) + 1:03d}"
        segments.append({
            "label": label,
            "span_id": span_id,
            "document_id": document_id,
            "doc_name": doc_name,
            "page": page,
            "text": text[:600],
            "which": "research"
        })
        used.add(span_id)
        if len(segments) >= limit:
            break
    return segments


def _resolve_labels(collection, label_map):
    for item in collection or []:
        resolved = []
        for label in item.get("citations") or []:
            seg = label_map.get(str(label).strip())
            if seg:
                resolved.append(seg["span_id"])
        item["citations"] = resolved

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
    parts.append("\nDocument excerpts (cite with the bracketed labels):")
    if segments:
        for seg in segments:
            parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
    else:
        parts.append("[No readable excerpts found]")
    return "\n".join(parts)


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

                patch_job(job_id, "ocr", "processing", task.get("org_id"))
                task = process_pdf(task)
                patch_job(job_id, "ocr", "done", task.get("org_id"))

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

                patch_job(job_id, "index", "processing", task.get("org_id"))
                embed_and_store(task)
                patch_job(job_id, "index", "done", task.get("org_id"))

                if doc_type_final and isinstance(doc_type_final, str) and 'eob' in doc_type_final.lower():
                    patch_job(job_id, "extract", "processing", task.get("org_id"))
                    extract_eob(task)
                    patch_job(job_id, "extract", "done", task.get("org_id"))

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
                eob_id = task.get("eob_id")
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
                            with psycopg.connect(db_url) as conn2:
                                _set_org_context(conn2, org_id)
                                conn2.execute(
                                    "UPDATE denial_explanations SET status='error', updated_at=NOW() WHERE eob_id=%s",
                                    (eob_id,)
                                )
                                conn2.commit()
                        except Exception as inner:
                            print("[WORKER] unable to mark denial explanation error:", inner)



            elif kind == "research_summary":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                document_id = task.get("document_id")
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                if not document_id:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        doc = conn.execute(
                            "SELECT original_name, type FROM documents WHERE id=%s",
                            (document_id,)
                        ).fetchone()
                        doc_name = None
                        if doc:
                            doc_name = doc[0] or doc[1]
                        doc_name = doc_name or "Report"
                        segments = _select_research_segments(conn, document_id, doc_name, limit=60)
                        prompt_parts = [
                            "Summarize this report for families:",
                        ]
                        if segments:
                            prompt_parts.append("Excerpts (cite labels):")
                            for seg in segments:
                                prompt_parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
                        prompt = "
".join(prompt_parts)

                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": RESEARCH_SUMMARY_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={"type": "json_schema", "json_schema": RESEARCH_SUMMARY_SCHEMA}
                        )
                        raw = response.output[0].content[0].text if response.output and response.output[0].content else None
                        if not raw:
                            raise ValueError("empty research summary response")
                        data = json.loads(raw)
                        summary = {
                            "summary": data.get("summary") or "",
                            "teacher_voice": data.get("teacher_voice") or "",
                            "caregiver_voice": data.get("caregiver_voice") or "",
                            "glossary": data.get("glossary") or [],
                            "citations": data.get("citations") or []
                        }
                        reading_level = data.get("reading_level")
                        label_map = {seg["label"]: seg for seg in segments}
                        _resolve_labels([summary], label_map)
                        citations_json = _build_citation_entries(label_map, set(summary.get("citations") or []))

                        conn.execute(
                            """
                            INSERT INTO research_summaries (org_id, document_id, summary_json, glossary_json, citations_json, reading_level, status)
                            VALUES (%s, %s, %s, %s, %s, %s, 'ready')
                            ON CONFLICT (document_id) DO UPDATE
                              SET summary_json = EXCLUDED.summary_json,
                                  glossary_json = EXCLUDED.glossary_json,
                                  citations_json = EXCLUDED.citations_json,
                                  reading_level = EXCLUDED.reading_level,
                                  status = 'ready',
                                  updated_at = NOW()
                            """,
                            (org_id, document_id, Json({
                                "summary": summary["summary"],
                                "teacher_voice": summary["teacher_voice"],
                                "caregiver_voice": summary["caregiver_voice"]
                            }), Json(summary.get("glossary") or []), Json(citations_json), reading_level)
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] research_summary failed:", e)
            elif kind == "build_advocacy_outline":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                outline_id = task.get("outline_id")
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                document_id = task.get("document_id")
                outline_kind = task.get("outline_kind") or "mediation"
                if not outline_id or not child_id:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        row = conn.execute(
                            "SELECT outline_json FROM advocacy_outlines WHERE id=%s",
                            (outline_id,)
                        ).fetchone()
                        if not row:
                            continue
                        existing_outline = row[0] or {}
                        source_document_id = document_id or existing_outline.get("document_id")
                        doc_name = existing_outline.get("document_name") or "Document"
                        if source_document_id:
                            doc_info = conn.execute(
                                "SELECT original_name, type FROM documents WHERE id=%s",
                                (source_document_id,)
                            ).fetchone()
                            if doc_info:
                                doc_name = doc_info[0] or doc_info[1] or doc_name
                        segments = []
                        if source_document_id:
                            segments = _select_segments(conn, source_document_id, "O", doc_name, limit=60)
                        if not segments:
                            payload = {
                                "document_id": source_document_id,
                                "outline_kind": outline_kind,
                                "summary": "",
                                "facts": [],
                                "attempts": [],
                                "remedies": [],
                                "next_steps": [],
                                "closing": ""
                            }
                            conn.execute(
                                "UPDATE advocacy_outlines SET outline_json=%s, citations_json=%s, status='empty', updated_at=NOW() WHERE id=%s",
                                (Json(payload), Json([]), outline_id)
                            )
                            conn.commit()
                            continue
                        label_map = {seg["label"]: seg for seg in segments}
                        prompt_parts = [
                            "Draft a mediation or complaint outline for a caregiver.",
                            f"Outline kind: {outline_kind}.",
                            "Organize the outline into background facts, previous attempts, requested remedies, and next steps.",
                            "Use only the provided excerpts and cite them with their labels (e.g., [O001]).",
                            "Return JSON that matches the schema."
                        ]
                        prompt_parts.append("Excerpts:")
                        for seg in segments:
                            prompt_parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
                        prompt = "\n".join(prompt_parts)

                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": ADVOCACY_OUTLINE_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={"type": "json_schema", "json_schema": ADVOCACY_OUTLINE_SCHEMA}
                        )
                        raw = response.output[0].content[0].text if response.output and response.output[0].content else None
                        if not raw:
                            raise ValueError("empty advocacy outline response")
                        data = json.loads(raw)
                        facts = data.get("facts") or []
                        attempts = data.get("attempts") or []
                        remedies = data.get("remedies") or []
                        next_steps = data.get("next_steps") or []
                        for collection in (facts, attempts, remedies, next_steps):
                            _resolve_labels(collection, label_map)
                        used_ids = set()
                        for collection in (facts, attempts, remedies, next_steps):
                            for item in collection:
                                for span_id in item.get("citations") or []:
                                    used_ids.add(span_id)
                        outline_payload = {
                            "document_id": source_document_id,
                            "outline_kind": outline_kind,
                            "summary": data.get("summary") or "",
                            "facts": facts,
                            "attempts": attempts,
                            "remedies": remedies,
                            "next_steps": next_steps,
                            "closing": data.get("closing") or ""
                        }
                        citations_json = _build_citation_entries(label_map, used_ids)
                        status_value = "ready" if (facts or remedies) else "empty"
                        conn.execute(
                            "UPDATE advocacy_outlines SET outline_json=%s, citations_json=%s, status=%s, updated_at=NOW() WHERE id=%s",
                            (Json(outline_payload), Json(citations_json), status_value, outline_id)
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] build_advocacy_outline failed:", e)
                    try:
                        if db_url:
                            with psycopg.connect(db_url) as conn2:
                                _set_org_context(conn2, org_id)
                                conn2.execute("UPDATE advocacy_outlines SET status='error', updated_at=NOW() WHERE id=%s", (outline_id,))
                                conn2.commit()
                    except Exception as inner:
                        print("[WORKER] build_advocacy_outline error mark failed:", inner)
            elif kind == "seed_safety_phrases":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                phrases = task.get("phrases")
                org_id = task.get("org_id")
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        if isinstance(phrases, list):
                            for phrase in phrases:
                                conn.execute(
                                    """
                                    INSERT INTO safety_phrases (org_id, tag, contexts, content_json, status)
                                    VALUES (%s, %s, %s, %s, %s)
                                    ON CONFLICT (id) DO NOTHING
                                    """,
                                    (
                                        phrase.get("org_id") or org_id,
                                        phrase.get("tag") or "general",
                                        phrase.get("contexts") or [],
                                        Json(phrase.get("content") or {}),
                                        phrase.get("status") or "active",
                                    ),
                                )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] seed_safety_phrases failed:", e)

            elif kind == "generate_safety_phrase":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                tag = task.get("tag") or "general"
                doc_id = task.get("document_id")
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        doc_name = "Document"
                        segments = []
                        if doc_id:
                            doc_info = conn.execute(
                                "SELECT original_name FROM documents WHERE id=%s",
                                (doc_id,),
                            ).fetchone()
                            if doc_info:
                                doc_name = doc_info[0] or doc_name
                            segments = _select_segments(conn, doc_id, "S", doc_name, limit=30)
                        prompt_parts = [
                            f"Tag: {tag}",
                            f"Child ID: {child_id}",
                            "Context cues:",
                        ]
                        for context in (task.get("contexts") or []):
                            prompt_parts.append(f"- {context}")
                        if segments:
                            prompt_parts.append("Excerpts (cite labels):")
                            for seg in segments:
                                prompt_parts.append(f"[{seg['label']}] {seg['doc_name']} (p.{seg['page']})
{seg['text']}")
                        prompt = "

".join(prompt_parts)

                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": SAFETY_PHRASE_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={
                                "type": "json_schema",
                                "json_schema": {
                                    "name": "SafetyPhrase",
                                    "strict": True,
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "phrase_en": {"type": "string"},
                                            "phrase_es": {"type": "string", "default": ""},
                                            "rationale": {"type": ["string", "null"], "default": None},
                                        },
                                        "required": ["phrase_en"],
                                        "additionalProperties": False,
                                    },
                                },
                            },
                        )
                        raw = response.output[0].content[0].text if response.output and response.output[0].content else None
                        if not raw:
                            raise ValueError("empty safety phrase response")
                        data = json.loads(raw)
                        content = {
                            "phrase_en": data.get("phrase_en") or "",
                            "phrase_es": data.get("phrase_es") or "",
                            "rationale": data.get("rationale") or None,
                        }
                        conn.execute(
                            "INSERT INTO safety_phrases (org_id, tag, contexts, content_json, status) VALUES (%s, %s, %s, %s, %s)",
                            (org_id, tag, task.get("contexts") or [], Json(content), "active"),
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] generate_safety_phrase failed:", e)
            elif kind == "build_one_pager":
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    continue
                one_pager_id = task.get("one_pager_id")
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                audience = task.get("audience") or "teacher"
                document_id = task.get("document_id")
                language_primary = task.get("language_primary") or "en"
                language_secondary = task.get("language_secondary") or "es"
                if not one_pager_id or not child_id:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        row = conn.execute(
                            "SELECT language_primary, language_secondary FROM one_pagers WHERE id=%s",
                            (one_pager_id,)
                        ).fetchone()
                        if not row:
                            continue
                        language_primary = row[0] or language_primary
                        language_secondary = row[1] or language_secondary
                        child_row = conn.execute(
                            "SELECT name FROM children WHERE id=%s",
                            (child_id,)
                        ).fetchone()
                        child_name = child_row[0] if child_row else "the student"
                        profile_row = conn.execute(
                            "SELECT profile_json FROM child_profile WHERE child_id=%s",
                            (child_id,)
                        ).fetchone()
                        profile_json = profile_row[0] if profile_row else {}
                        rec_row = conn.execute(
                            "SELECT recommendations_json, citations_json FROM recommendations WHERE child_id=%s AND status='ready' ORDER BY updated_at DESC LIMIT 1",
                            (child_id,)
                        ).fetchone()
                        recommendations = rec_row[0] if rec_row else []
                        rec_citations = rec_row[1] if rec_row else []
                        doc_name_row = None
                        if document_id:
                            doc_name_row = conn.execute(
                                "SELECT original_name FROM documents WHERE id=%s",
                                (document_id,)
                            ).fetchone()
                        document_name = (doc_name_row[0] if doc_name_row else None) or "Document"
                        span_ids = set()
                        for item in recommendations or []:
                            for span_id in item.get("citations") or []:
                                if span_id:
                                    span_ids.add(str(span_id))
                        for cite in rec_citations or []:
                            if cite.get("span_id"):
                                span_ids.add(str(cite["span_id"]))
                        segments = []
                        label_map = {}
                        if span_ids:
                            span_rows = conn.execute(
                                "SELECT ds.id::text, ds.page, ds.text, ds.document_id, d.original_name FROM doc_spans ds JOIN documents d ON d.id = ds.document_id WHERE ds.id = ANY(%s)",
                                (list(span_ids),)
                            ).fetchall()
                            for idx, span in enumerate(span_rows, start=1):
                                label = f"W{idx:03d}"
                                segment = {
                                    "label": label,
                                    "span_id": span[0],
                                    "page": span[1],
                                    "text": (span[2] or "").strip()[:600],
                                    "document_id": span[3],
                                    "doc_name": span[4] or "Document"
                                }
                                segments.append(segment)
                                label_map[label] = segment
                        if not segments and document_id:
                            doc_segments = _select_segments(conn, document_id, "W", document_name, limit=40)
                            for seg in doc_segments:
                                label_map[seg["label"]] = seg
                            segments = doc_segments
                        if not document_id and segments:
                            document_id = segments[0].get("document_id")
                        strengths = profile_json.get("strengths") or []
                        sensory = profile_json.get("sensory_supports") or []
                        communications = profile_json.get("communication") or profile_json.get("communication_notes") or []
                        prompt_parts = [
                            f"Child: {child_name}",
                            f"Audience: {audience}",
                            f"Primary language: {language_primary}",
                            f"Secondary language: {language_secondary}",
                            "Strengths: " + ("; ".join(strengths) if isinstance(strengths, list) else str(strengths)),
                            "Sensory supports: " + ("; ".join(sensory) if isinstance(sensory, list) else str(sensory)),
                            "Communication notes: " + ("; ".join(communications) if isinstance(communications, list) else str(communications)),
                            "Recommended supports:"
                        ]
                        for item in recommendations or []:
                            prompt_parts.append(
                                f"- {item.get('recommendation') or item.get('support') or ''}"
                            )
                        if segments:
                            prompt_parts.append("Excerpts (cite labels):")
                            for seg in segments:
                                prompt_parts.append(f"[{seg['label']}] {seg['doc_name']} (p.{seg['page']})
{seg['text']}")
                        prompt = "

".join(prompt_parts)
                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": ONE_PAGER_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={"type": "json_schema", "json_schema": ONE_PAGER_SCHEMA}
                        )
                        raw = response.output[0].content[0].text if response.output and response.output[0].content else None
                        if not raw:
                            raise ValueError("empty one pager response")
                        data = json.loads(raw)
                        sections = data.get("sections") or []
                        strategies = data.get("strategies") or []
                        _resolve_labels(sections, label_map)
                        _resolve_labels(strategies, label_map)
                        used_ids = set()
                        for collection in (sections, strategies):
                            for entry in collection:
                                for span_id in entry.get("citations") or []:
                                    used_ids.add(span_id)
                        citations_json = _build_citation_entries(label_map, used_ids)
                        content = {
                            "title": data.get("title") or f"{child_name} support snapshot",
                            "intro_en": data.get("intro_en") or "",
                            "intro_es": data.get("intro_es") or "",
                            "sections": sections,
                            "strategies": strategies,
                            "closing_en": data.get("closing_en") or "",
                            "closing_es": data.get("closing_es") or "",
                            "audience": audience,
                            "document_id": document_id,
                            "language_primary": language_primary,
                            "language_secondary": language_secondary
                        }
                        status_value = "ready" if sections or strategies else "empty"
                        conn.execute(
                            """
                            UPDATE one_pagers
                               SET content_json=%s,
                                   citations_json=%s,
                                   status=%s,
                                   language_primary=%s,
                                   language_secondary=%s,
                                   updated_at=NOW()
                             WHERE id=%s
                            """,
                            (Json(content), Json(citations_json), status_value, language_primary, language_secondary, one_pager_id)
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] build_one_pager failed:", e)
                    try:
                        if db_url:
                            with psycopg.connect(db_url) as conn2:
                                _set_org_context(conn2, org_id)
                                conn2.execute(
                                    "UPDATE one_pagers SET status='error', updated_at=NOW() WHERE id=%s",
                                    (one_pager_id,)
                                )
                                conn2.commit()
                    except Exception as inner:
                        print("[WORKER] build_one_pager error mark failed:", inner)
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
                child_id = task.get("child_id")
                org_id = task.get("org_id")
                document_id = task.get("document_id")
                source_kind = (task.get("source") or "auto").lower()
                if not child_id:
                    continue
                request_hash = hashlib.sha1(f"{child_id}:{source_kind}:{document_id or ''}".encode("utf-8")).hexdigest()
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        conn.execute(
                            """
                            INSERT INTO recommendations (org_id, child_id, source_kind, recommendations_json, citations_json, request_hash, locale, status)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
                            ON CONFLICT (child_id, source_kind) DO UPDATE
                              SET status = 'pending',
                                  request_hash = EXCLUDED.request_hash,
                                  locale = EXCLUDED.locale,
                                  updated_at = NOW()
                            """,
                            (
                                org_id,
                                child_id,
                                source_kind,
                                Json([]),
                                Json([]),
                                request_hash,
                                "en"
                            )
                        )
                        conn.commit()
                except Exception as mark_err:
                    print("[WORKER] prep_recommendations pending mark failed:", mark_err)
                if not document_id:
                    continue
                try:
                    with psycopg.connect(db_url) as conn:
                        _set_org_context(conn, org_id)
                        doc_row = conn.execute(
                            "SELECT original_name, type FROM documents WHERE id=%s",
                            (document_id,)
                        ).fetchone()
                        doc_name = None
                        if doc_row:
                            doc_name = doc_row[0] or doc_row[1]
                        doc_name = doc_name or "Document"
                        segments = _select_segments(conn, document_id, "R", doc_name, limit=60)
                        if not segments:
                            conn.execute(
                                "UPDATE recommendations SET recommendations_json=%s, citations_json=%s, locale=%s, status='empty', updated_at=NOW() WHERE child_id=%s AND source_kind=%s",
                                (Json([]), Json([]), "en", child_id, source_kind)
                            )
                            conn.commit()
                            continue
                        label_map = {seg["label"]: seg for seg in segments}
                        prompt_parts = [
                            "Produce 3-5 specific accommodations or services that match the student's needs.",
                            "Use only the provided excerpts and cite each recommendation using the excerpt labels (e.g., [R001]).",
                            "Return bilingual output so families can share in English and Spanish."
                        ]
                        prompt_parts.append("Excerpts:")
                        for seg in segments:
                            prompt_parts.append(f"[{seg['label']}] (page {seg['page']}) {seg['text']}")
                        prompt = "
".join(prompt_parts)
                        client = _openai()
                        model = os.getenv("OPENAI_MODEL_MINI", "gpt-5-mini")
                        response = client.responses.create(
                            model=model,
                            input=[
                                {"role": "system", "content": RECOMMENDATIONS_SYSTEM_PROMPT},
                                {"role": "user", "content": prompt}
                            ],
                            response_format={"type": "json_schema", "json_schema": RECOMMENDATIONS_SCHEMA}
                        )
                        raw = response.output[0].content[0].text if response.output and response.output[0].content else None
                        if not raw:
                            raise ValueError("empty recommendations response")
                        data = json.loads(raw)
                        raw_items = data.get("recommendations") or []
                        _resolve_labels(raw_items, label_map)
                        used_ids = set()
                        items = []
                        for idx, rec in enumerate(raw_items):
                            citations = [str(span_id) for span_id in (rec.get("citations") or [])]
                            for span_id in citations:
                                used_ids.add(span_id)
                            items.append({
                                "id": rec.get("id") or f"{source_kind}-{idx + 1}",
                                "title": rec.get("title") or "",
                                "recommendation": rec.get("support") or rec.get("recommendation") or "",
                                "rationale": rec.get("rationale") or "",
                                "translation": {
                                    "recommendation": rec.get("support_es") or "",
                                    "rationale": rec.get("rationale_es") or ""
                                },
                                "citations": citations
                            })
                        citations_json = _build_citation_entries(label_map, used_ids)
                        status_value = "ready" if items else "empty"
                        conn.execute(
                            """
                            UPDATE recommendations
                               SET recommendations_json=%s,
                                   citations_json=%s,
                                   locale=%s,
                                   status=%s,
                                   updated_at=NOW()
                             WHERE child_id=%s AND source_kind=%s
                            """,
                            (Json(items), Json(citations_json), "en", status_value, child_id, source_kind)
                        )
                        conn.commit()
                except Exception as e:
                    print("[WORKER] prep_recommendations failed:", e)
                    try:
                        with psycopg.connect(db_url) as conn:
                            _set_org_context(conn, org_id)
                            conn.execute(
                                "UPDATE recommendations SET status='error', updated_at=NOW() WHERE child_id=%s AND source_kind=%s",
                                (child_id, source_kind)
                            )
                            conn.commit()
                    except Exception as inner:
                        print("[WORKER] prep_recommendations error mark failed:", inner)
            else:
                print("Unknown job kind:", kind)
        except Exception as e:
            print("Job failed:", e)

if __name__ == "__main__":
    run()

