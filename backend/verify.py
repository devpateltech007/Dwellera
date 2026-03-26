import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(".env")
load_dotenv("../.env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("FATAL: No DATABASE_URL found")
    sys.exit(1)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

try:
    engine = create_engine(DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Available';"))
        res = conn.execute(text("SELECT status FROM listings LIMIT 1;"))
        print("Verification OK. The column 'status' exists:", res.fetchone())
except Exception as e:
    print("Verification Failed:", str(e))
