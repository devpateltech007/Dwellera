import psycopg2
import traceback

with open("out.txt", "w") as f:
    try:
        f.write("Connecting to PostgreSQL...\n")
        conn = psycopg2.connect("postgresql://postgres.ljjtwbqwcbboadpsmpzx:CMPE280dwellera@aws-1-us-east-1.pooler.supabase.com:5432/postgres")
        conn.autocommit = True
        cur = conn.cursor()
        f.write("Executing ALTER TABLE...\n")
        cur.execute("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Available';")
        f.write("Executing Check...\n")
        cur.execute("SELECT status FROM listings LIMIT 1;")
        res = cur.fetchone()
        f.write(f"Success! Column check: {res}\n")
    except Exception as e:
        f.write(f"FATAL ERR: {e}\n{traceback.format_exc()}\n")
