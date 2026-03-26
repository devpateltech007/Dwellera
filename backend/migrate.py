import os
from dotenv import load_dotenv

# Force load the .env in the backend folder
load_dotenv(".env")
load_dotenv("../.env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("FATAL: No DATABASE_URL found. Check your .env file in the backend directory.")
    exit(1)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

print(f"Detected connection string: {DATABASE_URL[:15]}...")

from sqlalchemy import create_engine, text

engine = create_engine(DATABASE_URL)

def run_migration():
    try:
        with engine.begin() as conn:
            print("Running Supabase SQL migration...")
            # Make sure we use PostgreSQL compatible syntax
            conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Available';"))
            print("Migration complete. Production DB successfully updated!")
    except Exception as e:
        print(f"Error during migration: {e}")

if __name__ == "__main__":
    run_migration()
