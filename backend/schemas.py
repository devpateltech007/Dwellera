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
    verification_token: Optional[str] = None

class UserCreate(UserBase):
    pass
    
class UserUpdate(BaseModel):
    name: str

class UserOut(UserBase):
    listings: List[ListingOut] = []

    class Config:
        from_attributes = True


class NegotiatorStartRequest(BaseModel):
    buyer_id: str
    budget: Optional[float] = None
    min_budget: Optional[float] = None
    max_budget: Optional[float] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    city: Optional[str] = None
    area: Optional[str] = None
    min_bedrooms: Optional[int] = None
    min_bathrooms: Optional[int] = None
    property_type: Optional[str] = None
    radius_km: float = 20
    max_candidates: int = 5
    auto_mode: bool = True


class NegotiatorSessionOut(BaseModel):
    session_id: int
    listing_id: int
    seller_id: str
    listing_title: str
    listing_price: float
    distance_km: float
    opening_message: str


class NegotiatorStartResponse(BaseModel):
    sessions: List[NegotiatorSessionOut]


class NegotiatorSellerReplyRequest(BaseModel):
    seller_reply: str


class NegotiatorTurnOut(BaseModel):
    id: int
    role: str
    content: str
    offer_price: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NegotiatorReplyOut(BaseModel):
    session_id: int
    listing_id: int
    suggested_offer: Optional[float]
    reply: str
    turns: List[NegotiatorTurnOut]


class NegotiatorAutopilotUpdateRequest(BaseModel):
    enabled: bool = True


class NegotiatorBuyerAutopilotUpdateRequest(BaseModel):
    buyer_id: str
    enabled: bool = True


class BuyerPreferenceBase(BaseModel):
    budget: float
    city: Optional[str] = None
    area: Optional[str] = None
    min_bedrooms: int = 1
    min_bathrooms: int = 1
    max_budget: Optional[float] = None
    property_type: Optional[str] = None
    notes: Optional[str] = ""
    ai_mode_enabled: bool = False


class BuyerPreferenceUpsert(BuyerPreferenceBase):
    pass


class BuyerPreferenceOut(BuyerPreferenceBase):
    buyer_id: str
    updated_at: datetime

    class Config:
        from_attributes = True


class BuyerAIModeUpdateRequest(BaseModel):
    enabled: bool = True


class IDVerificationOut(BaseModel):
    verification_token: str
    verification_status: str
    confidence_score: float
    extracted_name: Optional[str] = None
    id_last4: Optional[str] = None
    doc_type: Optional[str] = None
    message: str
