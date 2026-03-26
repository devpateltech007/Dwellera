import sys
from database import engine, Base
from models import Listing, Message, User

print("Dropping tables...")
Base.metadata.drop_all(bind=engine)

print("Re-creating tables...")
Base.metadata.create_all(bind=engine)

print("✅ Successfully updated the database schema!")
