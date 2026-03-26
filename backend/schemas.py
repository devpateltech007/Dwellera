from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ListingBase(BaseModel):
    title: str
    description: str
    price: float
    bedrooms: int
    bathrooms: int
    property_type: str
    location_lat: float
    location_lng: float
    image_urls: List[str] = []
    status: str = "Available"

class ListingCreate(ListingBase):
    seller_id: str

class ListingOut(ListingBase):
    id: int
    seller_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class MessageBase(BaseModel):
    listing_id: int
    receiver_id: str
    content: str
    
class MessageCreate(MessageBase):
    sender_id: str
    
class MessageOut(MessageCreate):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    id: str
    email: str
    name: str
    role: str

class UserOut(UserBase):
    listings: List[ListingOut] = []

    class Config:
        from_attributes = True
