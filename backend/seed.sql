-- Dwellera Seed Data: San Francisco & San Jose Focus
-- Execute this entirely in your Supabase SQL Editor.

TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE listings CASCADE;
TRUNCATE TABLE users CASCADE;

-- Insert Fake Sellers
INSERT INTO users (id, email, name, role) VALUES 
('dummy-seller-1', 'sj_realty@dwellera.com', 'San Jose Realty Group', 'seller'),
('dummy-seller-2', 'sf_estates@dwellera.com', 'SF Luxury Estates', 'seller'),
('dummy-seller-3', 'bay_area_homes@dwellera.com', 'Bay Area Homes', 'seller');

-- Insert Listings
INSERT INTO listings (title, description, price, bedrooms, bathrooms, property_type, location_lat, location_lng, image_urls, seller_id, created_at) VALUES 
('Luxury Penthouse with Golden Gate Views', 'Stunning top-floor penthouse featuring panoramic views of the bay and Golden Gate Bridge.', 4500000.0, 3, 3, 'Apartment', 37.8014, -122.4172, '["https://images.unsplash.com/photo-1512917774080-9991f1c4c750"]', 'dummy-seller-2', NOW()),
('Modern SOMA Loft', 'Industrial chic loft in the heart of SOMA.', 1250000.0, 1, 1, 'Condo', 37.7785, -122.3989, '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"]', 'dummy-seller-2', NOW()),
('Historic Pacific Heights Mansion', 'Classical 1920s architecture meets modern luxury.', 8900000.0, 5, 6, 'House', 37.7925, -122.4382, '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9"]', 'dummy-seller-2', NOW()),
('Cozy Mission District Flat', 'Bright and airy Victorian flat located near Dolores Park.', 950000.0, 2, 1, 'Apartment', 37.7599, -122.4148, '["https://images.unsplash.com/photo-1502672260266-1c1e5250ce07"]', 'dummy-seller-3', NOW()),
('Noe Valley Townhouse', 'Sun-drenched modern townhouse on a quiet, tree-lined street.', 2200000.0, 3, 2, 'Townhouse', 37.7502, -122.4337, '["https://images.unsplash.com/photo-1512915922686-57c11dde9c6b"]', 'dummy-seller-3', NOW()),
('Hayes Valley Boutique Condo', 'Brand new construction in Hayes Valley.', 1150000.0, 1, 1, 'Condo', 37.7758, -122.4243, '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"]', 'dummy-seller-3', NOW()),
('Willow Glen Family Oasis', 'Beautifully remodeled home in the highly sought-after Willow Glen.', 1950000.0, 4, 3, 'House', 37.3060, -121.8988, '["https://images.unsplash.com/photo-1600607687920-4e2a09cf159d"]', 'dummy-seller-1', NOW());
