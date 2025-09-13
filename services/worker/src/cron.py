import os, time
import psycopg

RETENTION_DAYS = int(os.getenv("RETENTION_DAYS","365"))
DB_URL = os.getenv("DATABASE_URL")

def purge():
  if not DB_URL:
    return
  with psycopg.connect(DB_URL) as conn:
    conn.execute("DELETE FROM events WHERE created_at < now() - INTERVAL '%s days'", (RETENTION_DAYS,))
    conn.execute("DELETE FROM notifications WHERE created_at < now() - INTERVAL '%s days'", (RETENTION_DAYS,))
    conn.commit()

if __name__ == "__main__":
  while True:
    try:
      purge()
    except Exception as e:
      print("[CRON] purge error", e, flush=True)
    time.sleep(24*3600)

