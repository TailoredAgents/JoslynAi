import os, smtplib
import psycopg
from email.message import EmailMessage

DB_URL = os.getenv("DATABASE_URL")
MAIL_HOST = os.getenv("MAIL_HOST", "mailhog")
MAIL_PORT = int(os.getenv("MAIL_PORT", "1025"))
MAIL_FROM = os.getenv("MAIL_FROM", "no-reply@joslyn-ai.local")


def _set_org_context(conn, org_id):
  try:
    if org_id:
      conn.execute("SELECT set_config('request.jwt.org_id', %s, true)", (org_id,))
    else:
      conn.execute("RESET request.jwt.org_id")
  except Exception:
    pass


def tick():
  if not DB_URL:
    return
  try:
    with psycopg.connect(DB_URL) as conn:
      rows = conn.execute("SELECT id, org_id, payload_json, send_at FROM joslyn_notifications_due(%s)", (10,)).fetchall()
      orgs_processed = set()
      for nid, org_id, payload, _send_at in rows:
        try:
          _set_org_context(conn, org_id)
          msg = EmailMessage()
          msg["From"] = MAIL_FROM
          msg["To"] = "demo@example.com"
          msg["Subject"] = "Reminder"
          msg.set_content(f"Deadline reminder: {payload}")
          with smtplib.SMTP(MAIL_HOST, MAIL_PORT) as s:
            s.send_message(msg)
          conn.execute("UPDATE notifications SET sent_at = NOW() WHERE id = %s", (nid,))
          conn.commit()
          if org_id:
            orgs_processed.add(org_id)
        except Exception as e:
          print("[NOTIFY] send failed:", e)
        finally:
          _set_org_context(conn, None)
      # retention purge per org that had activity
      for org_id in orgs_processed:
        try:
          _set_org_context(conn, org_id)
          days = int(os.getenv("RETENTION_DAYS", "365"))
          conn.execute("DELETE FROM events WHERE created_at < NOW() - INTERVAL '%s days'", (days,))
          conn.execute("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '%s days'", (days,))
          conn.commit()
        except Exception as purge_err:
          print("[NOTIFY] purge failed:", purge_err)
        finally:
          _set_org_context(conn, None)
  except Exception as e:
    print("[NOTIFY] tick error:", e)

