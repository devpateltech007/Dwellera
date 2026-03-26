"use client";

import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState } from 'react';

// Fix leaflet marker icon issue in Next.js
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function MapUpdater({ lat, lng }: { lat: number, lng: number }) {
  const map = useMap();
  map.setView([lat, lng], map.getZoom());
  return null;
}

function LocationMarker({ position, setPosition }: { position: [number, number], setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position === null ? null : (
    <Marker position={position} icon={icon}></Marker>
  );
}

export default function LocationPickerMap({ 
  lat, 
  lng, 
  onChange 
}: { 
  lat: number, 
  lng: number, 
  onChange: (lat: number, lng: number) => void 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        onChange(parseFloat(data[0].lat), parseFloat(data[0].lon));
      } else {
        alert("Address not found.");
      }
    } catch (err) {
      alert("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex gap-2">
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(e as any)}
          placeholder="Search address (e.g. Times Square, NY)"
          className="flex-1 px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary text-sm"
        />
        <button 
          type="button" 
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2 bg-primary text-white font-medium rounded-lg text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search Map"}
        </button>
      </div>

      <div className="h-64 w-full rounded-lg overflow-hidden border">
        <MapContainer 
          center={[lat || 37.7749, lng || -122.4194]} 
          zoom={12} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <MapUpdater lat={lat} lng={lng} />
          <LocationMarker 
            position={[lat, lng]} 
            setPosition={(p) => onChange(p[0], p[1])} 
          />
        </MapContainer>
      </div>
    </div>
  );
}
