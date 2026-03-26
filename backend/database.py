from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
from dotenv import load_dotenv

# Try to load .env.local first (since you named it that!), then fallback to .env
load_dotenv(".env.local")
load_dotenv(".env")

# We expect DATABASE_URL from Supabase (e.g. postgresql://...)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sql_app.db")

# For Supabase Postgres
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
