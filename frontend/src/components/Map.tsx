"use client";

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet marker icon issue in Next.js
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function AutoCenter({ listings }: { listings: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (listings.length > 0) {
      const bounds = L.latLngBounds(listings.map(l => [l.location_lat, l.location_lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [listings, map]);
  return null;
}

export default function MapComponent({ listings = [] }: { listings: any[] }) {
  return (
    <div style={{ height: '100%', width: '100%', minHeight: '600px' }}>
      <MapContainer center={[37.7749, -122.4194]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <AutoCenter listings={listings} />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {listings.map((l: any, i: number) => (
          <Marker key={i} position={[l.location_lat, l.location_lng]} icon={icon}>
            <Popup>
              <strong>{l.title}</strong><br/>
              ${l.price.toLocaleString()}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
