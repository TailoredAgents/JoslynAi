import os, smtplib, time
import psycopg
from email.message import EmailMessage

DB_URL = os.getenv("DATABASE_URL")
MAIL_HOST = os.getenv("MAIL_HOST", "mailhog")
MAIL_PORT = int(os.getenv("MAIL_PORT", "1025"))
MAIL_FROM = os.getenv("MAIL_FROM", "no-reply@iep-ally.local")

def tick():
  if not DB_URL:
    return
  try:
    with psycopg.connect(DB_URL) as conn:
      rows = conn.execute("SELECT id, payload_json FROM notifications WHERE sent_at IS NULL AND send_at <= NOW() LIMIT 10").fetchall()
      for r in rows:
        nid = r[0]
        payload = r[1]
        try:
          msg = EmailMessage()
          msg["From"] = MAIL_FROM
          msg["To"] = "demo@example.com"
          msg["Subject"] = "Reminder"
          msg.set_content(f"Deadline reminder: {payload}")
          with smtplib.SMTP(MAIL_HOST, MAIL_PORT) as s:
            s.send_message(msg)
          conn.execute("UPDATE notifications SET sent_at = NOW() WHERE id = %s", (nid,))
          conn.commit()
        except Exception as e:
          print("[NOTIFY] send failed:", e)
  except Exception as e:
    print("[NOTIFY] tick error:", e)

