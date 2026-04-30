from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, get_db, Base, SessionLocal
import models, schemas
import math
import asyncio
import datetime
import os
import re
import uuid
import cv2
import numpy as np
import pytesseract

from sqlalchemy import text, or_

app = FastAPI(title="Real Estate API")
autopilot_task = None
NEGOTIATOR_BOT_ID = "negotiator-bot"


def ensure_negotiation_schema(target_conn):
    statements = [
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS budget DOUBLE PRECISION DEFAULT 0;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS target_lat DOUBLE PRECISION DEFAULT 0;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS target_lng DOUBLE PRECISION DEFAULT 0;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS seller_id VARCHAR DEFAULT '';",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS auto_mode BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS last_processed_message_id INTEGER;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS final_offer DOUBLE PRECISION;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS final_note VARCHAR DEFAULT '';",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS strategy_notes VARCHAR DEFAULT '';",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';",
        "ALTER TABLE negotiation_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();"
    ]
    for stmt in statements:
        try:
            target_conn.execute(text(stmt))
        except Exception as migration_error:
            print("Negotiation schema patch note:", migration_error)


def ensure_buyer_preferences_schema(target_conn):
    statements = [
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS preferred_lat DOUBLE PRECISION DEFAULT 0;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS preferred_lng DOUBLE PRECISION DEFAULT 0;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS city VARCHAR;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS area VARCHAR;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS min_bathrooms INTEGER DEFAULT 1;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS min_bedrooms INTEGER DEFAULT 1;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS property_type VARCHAR;",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS notes VARCHAR DEFAULT '';",
        "ALTER TABLE buyer_preferences ADD COLUMN IF NOT EXISTS ai_mode_enabled BOOLEAN DEFAULT FALSE;"
    ]
    for stmt in statements:
        try:
            target_conn.execute(text(stmt))
        except Exception as migration_error:
            print("Buyer preferences schema patch note:", migration_error)
    # If legacy columns exist with NOT NULL constraints, defaults prevent insert failures.
    try:
        target_conn.execute(text("ALTER TABLE buyer_preferences ALTER COLUMN preferred_lat SET DEFAULT 0;"))
        target_conn.execute(text("ALTER TABLE buyer_preferences ALTER COLUMN preferred_lng SET DEFAULT 0;"))
    except Exception as migration_error:
        print("Buyer preferences default patch note:", migration_error)

# Create tables and auto-migrate
@app.on_event("startup")
def startup_db_migration():
    global autopilot_task
    Base.metadata.create_all(bind=engine)
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE listings ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Available';"))
            ensure_negotiation_schema(conn)
            ensure_buyer_preferences_schema(conn)
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR;"))
            print("Successfully migrated 'status' column on startup!")
            
            try:
                conn.execute(text("ALTER PUBLICATION supabase_realtime ADD TABLE messages;"))
                print("Enabled Live websockets. Added messages to supabase_realtime!")
            except Exception as e:
                print("Publication Add Note (might already exist):", e)
                
    except Exception as e:
        print("Startup migration error:", e)

    # Keep negotiating in background even when user is away.
    if autopilot_task is None or autopilot_task.done():
        autopilot_task = asyncio.create_task(negotiation_autopilot_loop())

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
            # Fetch listing and user context
            listing = db.query(models.Listing).filter(models.Listing.id == m.listing_id).first()
            other_user_obj = db.query(models.User).filter(models.User.id == other_user).first()
            
            threads[thread_key] = {
                "listing_id": m.listing_id,
                "listing_title": listing.title if listing else "Deleted Property",
                "listing_image": listing.image_urls[0] if listing and listing.image_urls else None,
                "other_user_id": other_user,
                "other_user_name": other_user_obj.name if other_user_obj else "User",
                "last_message": m.content,
                "last_message_at": m.created_at
            }
            
    return list(threads.values())

@app.get("/api/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": db_user.id, "name": db_user.name, "role": db_user.role}

@app.post("/api/users")
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    require_verification = os.getenv("REQUIRE_ID_VERIFICATION", "true").lower() == "true"
    if require_verification:
        if not user.verification_token:
            raise HTTPException(status_code=400, detail="Government ID verification required")
        verify = db.query(models.UserVerification).filter(
            models.UserVerification.verification_token == user.verification_token,
            models.UserVerification.email == user.email
        ).first()
        if not verify or verify.verification_status != "verified":
            raise HTTPException(status_code=400, detail="ID verification failed or expired")

    db_user = db.query(models.User).filter(models.User.id == user.id).first()
    if db_user:
        return db_user
    new_user = models.User(id=user.id, email=user.email, name=user.name, role=user.role)
    db.add(new_user)
    if require_verification:
        verify.user_id = user.id
    db.commit()
    db.refresh(new_user)
    return new_user

@app.put("/api/users/{user_id}")
def update_user(user_id: str, update: schemas.UserUpdate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.name = update.name
    db.commit()
    db.refresh(db_user)
    return {"message": "User updated successfully"}

@app.post("/api/messages", response_model=schemas.MessageOut)
def create_message(message: schemas.MessageCreate, db: Session = Depends(get_db)):
    db_message = models.Message(**message.model_dump())
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message


def normalize_human_text(text: str) -> str:
    clean = (text or "").replace("-", " ").strip()
    return " ".join(clean.split())


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    lat1_rad = math.radians(lat1)
    lng1_rad = math.radians(lng1)
    lat2_rad = math.radians(lat2)
    lng2_rad = math.radians(lng2)
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad
    a = (math.sin(dlat / 2) ** 2) + math.cos(lat1_rad) * math.cos(lat2_rad) * (math.sin(dlng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def negotiator_city_search_variants(city: str) -> list[str]:
    """Tokens for ILIKE on listing title/description (handles 'San Jose, CA' vs copy that only says 'San Jose')."""
    raw = (city or "").strip()
    if not raw:
        return []
    variants = [raw]
    if "," in raw:
        variants.append(raw.split(",")[0].strip())
    stripped = re.sub(r",?\s*(CA|TX|NY|FL|WA|OR|AZ|NV|CO|UT|NM|IL|MI|GA|NC|VA|MD|DC|MA|CT|NJ|PA|OH|IN|WI|MN|IA|MO|LA|TN|KY|AL|SC|MS|AR|OK|KS|NE|SD|ND|MT|ID|WY|HI|AK|DE|RI|NH|VT|ME|WV|USA)\s*$", "", raw, flags=re.I).strip()
    if stripped:
        variants.append(stripped)
    seen: set[str] = set()
    out: list[str] = []
    for v in variants:
        v = v.strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


def negotiator_location_sql_filter(city: Optional[str], area: Optional[str]):
    """
    Text filter for negotiator listing search.

    We no longer AND city with area in SQL. That rejected good rows (e.g. copy says
    'San Jose' but not 'San Jose, CA', or never mentions 'Downtown'). When city is set,
    match any city variant; optional area is only used for ranking, not as a hard filter.
    """
    city = (city or "").strip() or None
    area = (area or "").strip() or None
    if not city and not area:
        return None
    parts = []
    if city:
        for fragment in negotiator_city_search_variants(city):
            pat = f"%{fragment}%"
            parts.append(
                (models.Listing.title.ilike(pat)) | (models.Listing.description.ilike(pat))
            )
    elif area:
        pat = f"%{area}%"
        parts.append((models.Listing.title.ilike(pat)) | (models.Listing.description.ilike(pat)))
    if not parts:
        return None
    return or_(*parts)


def listing_area_rank_score(listing: models.Listing, area: Optional[str]) -> int:
    """0 if listing text mentions preferred area (or buyer did not specify area), else 1."""
    if not area or not str(area).strip():
        return 0
    a = str(area).strip().lower()
    blob = f"{listing.title or ''} {listing.description or ''}".lower()
    return 0 if a in blob else 1


def build_opening_message(listing_title: str, budget: float) -> str:
    return normalize_human_text(
        f"Hi, I am very interested in {listing_title}. My buying budget is around ${budget:,.0f}. "
        "Could you share the current property condition and whether any repairs are needed? "
        "Also, how quickly are you hoping to close this sale?"
    )


def build_next_negotiation_reply(listing_price: float, seller_reply: str):
    reply_text = (seller_reply or "").lower()
    urgency_signals = ["urgent", "quick", "asap", "moving", "relocate", "relocating", "need to sell", "fast"]
    condition_signals = ["repair", "fix", "as is", "old", "dated", "renovation", "work needed"]

    urgency_score = 1 if any(x in reply_text for x in urgency_signals) else 0
    condition_score = 1 if any(x in reply_text for x in condition_signals) else 0

    base_discount = 0.05
    urgency_discount = 0.05 if urgency_score else 0.0
    condition_discount = 0.06 if condition_score else 0.0
    total_discount = min(0.18, base_discount + urgency_discount + condition_discount)
    suggested_offer = round(listing_price * (1 - total_discount), 2)

    message = (
        f"Thanks for sharing that detail. Based on what you told me, I can move quickly and make this easy for you. "
        f"I would like to offer ${suggested_offer:,.0f} and stay flexible on closing timeline. "
        "If this is close for you, I can move to next steps right away."
    )
    return suggested_offer, normalize_human_text(message)


def seller_accepts_offer(text: str) -> bool:
    lowered = (text or "").lower()
    accept_terms = [
        "deal",
        "accepted",
        "i accept",
        "works for me",
        "let us do it",
        "agreed",
        "sounds good",
        "okay we can close"
    ]
    return any(term in lowered for term in accept_terms)


def process_autopilot_sessions(db: Session):
    ensure_negotiation_schema(db)
    sessions = (
        db.query(models.NegotiationSession)
        .filter(
            models.NegotiationSession.status == "active",
            models.NegotiationSession.auto_mode == True
        )
        .all()
    )

    for session in sessions:
        latest_seller_msg = (
            db.query(models.Message)
            .filter(
                models.Message.listing_id == session.listing_id,
                models.Message.sender_id == session.seller_id,
                models.Message.receiver_id == session.buyer_id
            )
            .order_by(models.Message.created_at.desc())
            .first()
        )
        if not latest_seller_msg:
            continue

        if session.last_processed_message_id and latest_seller_msg.id <= session.last_processed_message_id:
            continue

        seller_text = normalize_human_text(latest_seller_msg.content)
        db.add(models.NegotiationTurn(session_id=session.id, role="seller", content=seller_text))

        if seller_accepts_offer(seller_text):
            listing = db.query(models.Listing).filter(models.Listing.id == session.listing_id).first()
            final_offer = session.final_offer or (listing.price if listing else session.budget)
            session.status = "finalized"
            session.finalized_at = datetime.datetime.utcnow()
            session.final_note = "Seller accepted. Buyer should move forward."
            session.last_processed_message_id = latest_seller_msg.id

            final_msg = normalize_human_text(
                f"Great news. Your deal is finalized at ${final_offer:,.0f}. "
                "Seller accepted the terms. Please move forward with contract and due diligence steps."
            )
            db.add(
                models.NegotiationTurn(
                    session_id=session.id,
                    role="system",
                    content=final_msg,
                    offer_price=final_offer
                )
            )
            db.add(
                models.Message(
                    listing_id=session.listing_id,
                    sender_id=NEGOTIATOR_BOT_ID,
                    receiver_id=session.buyer_id,
                    content=final_msg
                )
            )
            continue

        listing = db.query(models.Listing).filter(models.Listing.id == session.listing_id).first()
        if not listing:
            continue

        suggested_offer, agent_reply = build_next_negotiation_reply(listing.price, seller_text)
        suggested_offer = min(suggested_offer, session.budget)
        session.final_offer = suggested_offer
        session.last_processed_message_id = latest_seller_msg.id

        db.add(
            models.NegotiationTurn(
                session_id=session.id,
                role="agent",
                content=agent_reply,
                offer_price=suggested_offer
            )
        )
        db.add(
            models.Message(
                listing_id=session.listing_id,
                sender_id=session.buyer_id,
                receiver_id=session.seller_id,
                content=agent_reply
            )
        )

    db.commit()


async def negotiation_autopilot_loop():
    while True:
        db = SessionLocal()
        try:
            process_autopilot_sessions(db)
        except Exception as exc:
            db.rollback()
            print("Negotiator autopilot loop error:", exc)
        finally:
            db.close()
        await asyncio.sleep(20)


@app.post("/api/negotiator/start", response_model=schemas.NegotiatorStartResponse)
def start_negotiator_campaign(payload: schemas.NegotiatorStartRequest, db: Session = Depends(get_db)):
    ensure_negotiation_schema(db)
    target_budget = payload.budget
    min_budget = payload.min_budget
    max_budget = payload.max_budget

    if target_budget is None and min_budget is None and max_budget is None:
        raise HTTPException(
            status_code=422,
            detail="Provide budget, or provide at least one of min_budget / max_budget."
        )

    if min_budget is None and target_budget is not None:
        min_budget = max(target_budget * 0.85, 0)
    if max_budget is None and target_budget is not None:
        max_budget = target_budget * 1.15

    if min_budget is not None and max_budget is not None and min_budget > max_budget:
        raise HTTPException(status_code=422, detail="min_budget cannot be greater than max_budget.")

    if target_budget is None:
        if min_budget is not None and max_budget is not None:
            target_budget = (min_budget + max_budget) / 2
        else:
            target_budget = max_budget if max_budget is not None else min_budget

    listings_query = db.query(models.Listing)
    if min_budget is not None:
        listings_query = listings_query.filter(models.Listing.price >= min_budget)
    if max_budget is not None:
        listings_query = listings_query.filter(models.Listing.price <= max_budget)
    listings_query = listings_query.filter(
        or_(models.Listing.status == "Available", models.Listing.status.is_(None))
    )

    if payload.min_bedrooms is not None:
        listings_query = listings_query.filter(models.Listing.bedrooms >= payload.min_bedrooms)
    if payload.min_bathrooms is not None:
        listings_query = listings_query.filter(models.Listing.bathrooms >= payload.min_bathrooms)
    if payload.property_type:
        listings_query = listings_query.filter(models.Listing.property_type.ilike(payload.property_type))

    loc_filter = negotiator_location_sql_filter(payload.city, payload.area)
    if loc_filter is not None:
        listings_query = listings_query.filter(loc_filter)

    listings = listings_query.all()

    ranked = []
    for listing in listings:
        if payload.location_lat is not None and payload.location_lng is not None:
            distance_km = haversine_km(payload.location_lat, payload.location_lng, listing.location_lat, listing.location_lng)
            if distance_km > payload.radius_km:
                continue
        else:
            distance_km = 0.0
        budget_delta = abs(listing.price - target_budget) / max(target_budget, 1)
        area_rank = listing_area_rank_score(listing, payload.area)
        ranked.append((listing, distance_km, budget_delta, area_rank))

    if payload.area and str(payload.area).strip():
        ranked.sort(key=lambda item: (item[3], item[2], item[1]))
    else:
        ranked.sort(key=lambda item: (item[2], item[1]))
    shortlisted = ranked[:payload.max_candidates]

    sessions_out = []
    for listing, distance_km, _, _ in shortlisted:
        opening_message = build_opening_message(listing.title, target_budget)
        session = models.NegotiationSession(
            buyer_id=payload.buyer_id,
            listing_id=listing.id,
            seller_id=listing.seller_id,
            budget=target_budget,
            target_lat=payload.location_lat or 0,
            target_lng=payload.location_lng or 0,
            auto_mode=payload.auto_mode,
            strategy_notes="Natural human tone. Ask condition, urgency, and close with fair offer."
        )
        db.add(session)
        db.flush()

        db.add(models.NegotiationTurn(session_id=session.id, role="agent", content=opening_message))
        db.add(
            models.Message(
                listing_id=listing.id,
                sender_id=payload.buyer_id,
                receiver_id=listing.seller_id,
                content=opening_message
            )
        )

        sessions_out.append(
            schemas.NegotiatorSessionOut(
                session_id=session.id,
                listing_id=listing.id,
                seller_id=listing.seller_id,
                listing_title=listing.title,
                listing_price=listing.price,
                distance_km=round(distance_km, 2),
                opening_message=opening_message
            )
        )

    db.commit()
    return schemas.NegotiatorStartResponse(sessions=sessions_out)


@app.post("/api/negotiator/{session_id}/seller-reply", response_model=schemas.NegotiatorReplyOut)
def continue_negotiation(session_id: int, payload: schemas.NegotiatorSellerReplyRequest, db: Session = Depends(get_db)):
    ensure_negotiation_schema(db)
    session = db.query(models.NegotiationSession).filter(models.NegotiationSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Negotiation session not found")

    listing = db.query(models.Listing).filter(models.Listing.id == session.listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    seller_message = normalize_human_text(payload.seller_reply)
    db.add(models.NegotiationTurn(session_id=session_id, role="seller", content=seller_message))
    db.add(
        models.Message(
            listing_id=session.listing_id,
            sender_id=session.seller_id,
            receiver_id=session.buyer_id,
            content=seller_message
        )
    )

    suggested_offer, agent_reply = build_next_negotiation_reply(listing.price, seller_message)
    db.add(
        models.NegotiationTurn(
            session_id=session_id,
            role="agent",
            content=agent_reply,
            offer_price=suggested_offer
        )
    )
    db.add(
        models.Message(
            listing_id=session.listing_id,
            sender_id=session.buyer_id,
            receiver_id=session.seller_id,
            content=agent_reply
        )
    )
    db.commit()

    turns = (
        db.query(models.NegotiationTurn)
        .filter(models.NegotiationTurn.session_id == session_id)
        .order_by(models.NegotiationTurn.created_at.asc())
        .all()
    )

    return schemas.NegotiatorReplyOut(
        session_id=session_id,
        listing_id=session.listing_id,
        suggested_offer=suggested_offer,
        reply=agent_reply,
        turns=turns
    )


@app.get("/api/negotiator/{session_id}/memory", response_model=list[schemas.NegotiatorTurnOut])
def get_negotiation_memory(session_id: int, db: Session = Depends(get_db)):
    ensure_negotiation_schema(db)
    session = db.query(models.NegotiationSession).filter(models.NegotiationSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Negotiation session not found")
    turns = (
        db.query(models.NegotiationTurn)
        .filter(models.NegotiationTurn.session_id == session_id)
        .order_by(models.NegotiationTurn.created_at.asc())
        .all()
    )
    return turns


@app.patch("/api/negotiator/{session_id}/autopilot")
def update_negotiator_autopilot(
    session_id: int,
    payload: schemas.NegotiatorAutopilotUpdateRequest,
    db: Session = Depends(get_db)
):
    ensure_negotiation_schema(db)
    session = db.query(models.NegotiationSession).filter(models.NegotiationSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Negotiation session not found")
    session.auto_mode = payload.enabled
    db.commit()
    db.refresh(session)
    return {"session_id": session.id, "auto_mode": session.auto_mode, "status": session.status}


@app.patch("/api/negotiator/autopilot/buyer")
def update_buyer_negotiator_autopilot(
    payload: schemas.NegotiatorBuyerAutopilotUpdateRequest,
    db: Session = Depends(get_db)
):
    ensure_negotiation_schema(db)
    sessions = (
        db.query(models.NegotiationSession)
        .filter(
            models.NegotiationSession.buyer_id == payload.buyer_id,
            models.NegotiationSession.status == "active"
        )
        .all()
    )
    for session in sessions:
        session.auto_mode = payload.enabled
    db.commit()
    return {
        "buyer_id": payload.buyer_id,
        "auto_mode": payload.enabled,
        "updated_sessions": len(sessions)
    }


@app.get("/api/buyer-preferences/{buyer_id}", response_model=schemas.BuyerPreferenceOut)
def get_buyer_preferences(buyer_id: str, db: Session = Depends(get_db)):
    ensure_buyer_preferences_schema(db)
    pref = db.query(models.BuyerPreference).filter(models.BuyerPreference.buyer_id == buyer_id).first()
    if not pref:
        raise HTTPException(status_code=404, detail="Buyer preferences not found")
    return pref


@app.put("/api/buyer-preferences/{buyer_id}", response_model=schemas.BuyerPreferenceOut)
def upsert_buyer_preferences(
    buyer_id: str,
    payload: schemas.BuyerPreferenceUpsert,
    db: Session = Depends(get_db)
):
    ensure_buyer_preferences_schema(db)
    pref = db.query(models.BuyerPreference).filter(models.BuyerPreference.buyer_id == buyer_id).first()
    if not pref:
        data = payload.model_dump()
        pref = models.BuyerPreference(
            buyer_id=buyer_id,
            preferred_lat=0,
            preferred_lng=0,
            **data
        )
        db.add(pref)
    else:
        data = payload.model_dump()
        pref.budget = data["budget"]
        pref.preferred_lat = 0
        pref.preferred_lng = 0
        pref.city = data["city"]
        pref.area = data["area"]
        pref.min_bedrooms = data["min_bedrooms"]
        pref.min_bathrooms = data["min_bathrooms"]
        pref.max_budget = data["max_budget"]
        pref.property_type = data["property_type"]
        pref.notes = data["notes"] or ""
        pref.ai_mode_enabled = data["ai_mode_enabled"]
    db.commit()
    db.refresh(pref)
    return pref


@app.patch("/api/buyer-preferences/{buyer_id}/ai-mode")
def update_buyer_ai_mode(
    buyer_id: str,
    payload: schemas.BuyerAIModeUpdateRequest,
    db: Session = Depends(get_db)
):
    ensure_buyer_preferences_schema(db)
    pref = db.query(models.BuyerPreference).filter(models.BuyerPreference.buyer_id == buyer_id).first()
    if not pref:
        raise HTTPException(status_code=404, detail="Buyer preferences not found")
    pref.ai_mode_enabled = payload.enabled

    active_sessions = (
        db.query(models.NegotiationSession)
        .filter(
            models.NegotiationSession.buyer_id == buyer_id,
            models.NegotiationSession.status == "active"
        )
        .all()
    )
    for session in active_sessions:
        session.auto_mode = payload.enabled

    db.commit()
    return {
        "buyer_id": buyer_id,
        "ai_mode_enabled": payload.enabled,
        "updated_sessions": len(active_sessions)
    }


def extract_id_fields(ocr_text: str, full_name: str):
    clean = " ".join((ocr_text or "").split())
    upper_text = clean.upper()
    target_name = (full_name or "").strip().upper()
    name_match = 1.0 if target_name and target_name in upper_text else 0.0
    id_match = re.search(r"\b\d{4,}\b", clean)
    id_last4 = id_match.group(0)[-4:] if id_match else None
    if "DRIVER" in upper_text or "DL" in upper_text:
        doc_type = "drivers_license"
    elif "PASSPORT" in upper_text:
        doc_type = "passport"
    elif "IDENTITY" in upper_text or "ID" in upper_text:
        doc_type = "government_id"
    else:
        doc_type = "unknown_id"
    confidence = 0.6 + (0.25 * name_match) + (0.15 if id_last4 else 0)
    return min(confidence, 0.99), name_match, id_last4, doc_type, clean


@app.post("/api/id-verification/verify", response_model=schemas.IDVerificationOut)
async def verify_government_id(
    full_name: str = Form(...),
    email: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    content = await file.read()
    np_arr = np.frombuffer(content, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image upload")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ocr_text = pytesseract.image_to_string(thresh)

    confidence, name_match, id_last4, doc_type, clean_text = extract_id_fields(ocr_text, full_name)
    status = "verified" if name_match >= 1 and id_last4 else "pending_review"
    token = str(uuid.uuid4())

    store_ocr_text = os.getenv("STORE_ID_OCR_TEXT", "false").lower() == "true"
    verification = models.UserVerification(
        verification_token=token,
        email=email,
        full_name=full_name,
        verification_status=status,
        confidence_score=confidence,
        extracted_name=full_name if name_match else None,
        id_last4=id_last4,
        doc_type=doc_type,
        ocr_text=clean_text if store_ocr_text else None,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    )
    db.add(verification)
    db.commit()

    return schemas.IDVerificationOut(
        verification_token=token,
        verification_status=status,
        confidence_score=round(confidence, 2),
        extracted_name=verification.extracted_name,
        id_last4=id_last4,
        doc_type=doc_type,
        message="ID verified successfully" if status == "verified" else "ID captured, pending manual review"
    )
