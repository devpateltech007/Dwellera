from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True) # UUID from Supabase auth
    email = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String) # 'buyer' or 'seller'

from sqlalchemy import Column, Integer, String, Float, DateTime, JSON


class Listing(Base):
    __tablename__ = "listings"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    price = Column(Float)
    bedrooms = Column(Integer)
    bathrooms = Column(Integer)
    property_type = Column(String) # House, Apartment, Condo, etc
    location_lat = Column(Float)
    location_lng = Column(Float)
    image_urls = Column(JSON) # Array of Cloudinary URLs
    status = Column(String, default="Available") # Available, Sold
    seller_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"))
    sender_id = Column(String, index=True)
    receiver_id = Column(String, index=True)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class NegotiationSession(Base):
    __tablename__ = "negotiation_sessions"
    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(String, index=True, nullable=False)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False)
    seller_id = Column(String, index=True, nullable=False)
    budget = Column(Float, nullable=False)
    target_lat = Column(Float, nullable=False)
    target_lng = Column(Float, nullable=False)
    auto_mode = Column(Boolean, default=True)
    last_processed_message_id = Column(Integer, nullable=True)
    final_offer = Column(Float, nullable=True)
    final_note = Column(String, default="")
    status = Column(String, default="active")
    strategy_notes = Column(String, default="")
    finalized_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow
    )


class NegotiationTurn(Base):
    __tablename__ = "negotiation_turns"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("negotiation_sessions.id"), index=True, nullable=False)
    role = Column(String, nullable=False)  # agent, seller, system
    content = Column(String, nullable=False)
    offer_price = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class BuyerPreference(Base):
    __tablename__ = "buyer_preferences"
    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(String, unique=True, index=True, nullable=False)
    budget = Column(Float, nullable=False, default=0)
    # Backward compatibility with older DB schema that still enforces these.
    preferred_lat = Column(Float, nullable=False, default=0)
    preferred_lng = Column(Float, nullable=False, default=0)
    city = Column(String, nullable=True)
    area = Column(String, nullable=True)
    min_bedrooms = Column(Integer, nullable=False, default=1)
    min_bathrooms = Column(Integer, nullable=False, default=1)
    max_budget = Column(Float, nullable=True)
    property_type = Column(String, nullable=True)
    notes = Column(String, default="")
    ai_mode_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow
    )


class UserVerification(Base):
    __tablename__ = "user_verifications"
    id = Column(Integer, primary_key=True, index=True)
    verification_token = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    verification_status = Column(String, default="pending_review")  # verified, pending_review, rejected
    confidence_score = Column(Float, default=0)
    extracted_name = Column(String, nullable=True)
    id_last4 = Column(String, nullable=True)
    doc_type = Column(String, nullable=True)
    ocr_text = Column(String, nullable=True)
    user_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
