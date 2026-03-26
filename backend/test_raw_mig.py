import os
import sys

print("Loading Database URL...")
DATABASE_URL = "postgresql://postgres.ljjtwbqwcbboadpsmpzx:CMPE280dwellera@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

from sqlalchemy import create_engine, text

try:
    print("Creating Engine...")
    engine = create_engine(DATABASE_URL)
    with engine.begin() as conn:
        print("Executing ALTER TABLE directly...")
        conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Available';"))
        print("Successfully added column!")
        
        res = conn.execute(text("SELECT status FROM listings LIMIT 1;"))
        print("Test output:", res.fetchone())
except Exception as e:
    print(f"FATAL EXCEPTION: {e}")

print("Pinging Supabase schema completed.")
