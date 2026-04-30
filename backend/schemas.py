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

class ListingPolygonSearch(BaseModel):
    polygon: List[List[float]]  # [[lat, lng], ...]
    search: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_bedrooms: Optional[int] = None
    property_type: Optional[str] = None

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

class UserCreate(UserBase):
    pass
    
class UserUpdate(BaseModel):
    name: str

class UserOut(UserBase):
    listings: List[ListingOut] = []

    class Config:
        from_attributes = True
