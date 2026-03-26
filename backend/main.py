from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, get_db, Base
import models, schemas

from sqlalchemy import text

app = FastAPI(title="Real Estate API")

# Create tables and auto-migrate
@app.on_event("startup")
def startup_db_migration():
    Base.metadata.create_all(bind=engine)
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Available';"))
            print("Successfully migrated 'status' column on startup!")
    except Exception as e:
        print("Startup migration error:", e)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Real Estate API"}

from typing import Optional

@app.get("/api/listings", response_model=list[schemas.ListingOut])
def get_listings(
    search: str = None, 
    seller_id: str = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_bedrooms: Optional[int] = None,
    property_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Listing)
    if search:
        query = query.filter(models.Listing.title.ilike(f"%{search}%") | models.Listing.description.ilike(f"%{search}%"))
    if seller_id:
        query = query.filter(models.Listing.seller_id == seller_id)
    if min_price is not None:
        query = query.filter(models.Listing.price >= min_price)
    if max_price is not None:
        query = query.filter(models.Listing.price <= max_price)
    if min_bedrooms is not None:
        query = query.filter(models.Listing.bedrooms >= min_bedrooms)
    if property_type and property_type.lower() != 'all':
        query = query.filter(models.Listing.property_type.ilike(property_type))
        
    return query.all()

@app.post("/api/listings", response_model=schemas.ListingOut)
def create_listing(listing: schemas.ListingCreate, db: Session = Depends(get_db)):
    db_listing = models.Listing(**listing.model_dump())
    db.add(db_listing)
    db.commit()
    db.refresh(db_listing)
    return db_listing

from pydantic import BaseModel
class StatusUpdate(BaseModel):
    status: str

@app.patch("/api/listings/{listing_id}/status")
def update_listing_status(listing_id: int, update: StatusUpdate, db: Session = Depends(get_db)):
    listing = db.query(models.Listing).filter(models.Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    listing.status = update.status
    db.commit()
    db.refresh(listing)
    return listing

@app.get("/api/listings/{listing_id}", response_model=schemas.ListingOut)
def get_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.query(models.Listing).filter(models.Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing

@app.get("/api/messages", response_model=list[schemas.MessageOut])
def get_messages(user_id: str, listing_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.Message).filter(
        (models.Message.sender_id == user_id) | (models.Message.receiver_id == user_id)
    )
    if listing_id:
        query = query.filter(models.Message.listing_id == listing_id)
        
    return query.order_by(models.Message.created_at.asc()).all()

@app.get("/api/inbox")
def get_inbox(user_id: str, db: Session = Depends(get_db)):
    # Find all messages where user is sender or receiver
    messages = db.query(models.Message).filter(
        (models.Message.sender_id == user_id) | (models.Message.receiver_id == user_id)
    ).order_by(models.Message.created_at.desc()).all()
    
    # Group by listing_id and the *other* user ID to form unique threads
    threads = {}
    for m in messages:
        other_user = m.receiver_id if m.sender_id == user_id else m.sender_id
        thread_key = f"{m.listing_id}_{other_user}"
        
        if thread_key not in threads:
            # Fetch listing title for context
            listing = db.query(models.Listing).filter(models.Listing.id == m.listing_id).first()
            threads[thread_key] = {
                "listing_id": m.listing_id,
                "listing_title": listing.title if listing else "Deleted Property",
                "other_user_id": other_user,
                "last_message": m.content,
                "last_message_at": m.created_at
            }
            
    return list(threads.values())

@app.post("/api/messages", response_model=schemas.MessageOut)
def create_message(message: schemas.MessageCreate, db: Session = Depends(get_db)):
    db_message = models.Message(**message.model_dump())
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message
