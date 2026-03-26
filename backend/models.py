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
