"use client";

import { useEffect, useState } from "react";

const DEMO_WALKTHROUGH_URL = "https://my.matterport.com/show/?m=FfPX2og55xy";

const getWalkthroughUrl = (rawUrl?: string) => {
  const candidate = (rawUrl || "").trim() || DEMO_WALKTHROUGH_URL;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
};

const getEmbeddableWalkthroughUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
    if (host.includes("youtu.be")) {
      const videoId = parsed.pathname.replace("/", "").trim();
      if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    if (host.includes("matterport.com")) {
      const spaceMatch = parsed.pathname.match(/\/space\/([^/?#]+)/i);
      const modelId = parsed.searchParams.get("m") || spaceMatch?.[1];
      if (modelId) return `https://my.matterport.com/show/?m=${modelId}&play=1`;
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

const WalkthroughViewerOverlay = ({ url, onClose }: { url: string, onClose: () => void }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const embedUrl = getEmbeddableWalkthroughUrl(url);

  return (
    <div className="fixed inset-0 bg-black/90 z-[10000] flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-6 py-4 text-white">
        <div className="flex items-center gap-2 font-semibold">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 2h3a2 2 0 002-2V10a2 2 0 00-2-2H9m-4 0h.01M5 16h.01" />
          </svg>
          3D Walkthrough
        </div>
        <button
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition backdrop-blur-sm"
          aria-label="Close walkthrough"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="flex-1 px-4 pb-6">
        <iframe
          src={embedUrl}
          title="Property 3D walkthrough"
          className="w-full h-full rounded-xl border border-white/10 shadow-2xl bg-black"
          allow="xr-spatial-tracking; fullscreen; accelerometer; gyroscope; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
};

const ImageCarousel = ({ urls, title, className, walkthroughUrl, onOpenWalkthrough }: { urls: string[], title: string, className?: string, walkthroughUrl?: string | null, onOpenWalkthrough: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isDemoTour = !walkthroughUrl;

  if (!urls || urls.length === 0) {
    return <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>No Image</div>;
  }

  const next = (e: React.MouseEvent) => { e.stopPropagation(); setCurrentIndex(i => (i + 1) % urls.length); };
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrentIndex(i => (i - 1 + urls.length) % urls.length); };

  return (
    <div className={`relative group overflow-hidden ${className}`}>
      <img src={urls[currentIndex]} alt={`${title} - image ${currentIndex + 1}`} className="w-full h-full object-cover transition-all duration-300" />
      
      {urls.length > 1 && (
        <>
          <button 
            onClick={prev} 
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-gray-800 shadow opacity-0 group-hover:opacity-100 transition z-10"
          >
            <svg className="w-5 h-5 pr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          
          <button 
            onClick={next} 
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-gray-800 shadow opacity-0 group-hover:opacity-100 transition z-10"
          >
            <svg className="w-5 h-5 pl-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onOpenWalkthrough(); }}
        className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/70 hover:bg-black/80 text-white px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-sm transition z-20"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-6 2h3a2 2 0 002-2V10a2 2 0 00-2-2H9m-4 0h.01M5 16h.01" />
        </svg>
        {isDemoTour ? "3D Demo" : "3D Tour"}
      </button>
    </div>
  );
};

export default function PropertyDetailsModal({ listing, onClose }: { listing: any, onClose: () => void }) {
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  if (!listing) return null;

  const walkthroughUrl = getWalkthroughUrl(listing.walkthrough_url);

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in zoom-in-95 duration-300">
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-xl hover:scale-110 transition z-50 backdrop-blur-sm border"
        >
          <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <ImageCarousel
          urls={listing.image_urls}
          title={listing.title}
          walkthroughUrl={listing.walkthrough_url}
          onOpenWalkthrough={() => setWalkthroughOpen(true)}
          className="w-full h-[400px] bg-gray-100"
        />

        <div className="p-8 md:p-12">
          <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
            <div>
              <h2 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">{listing.title}</h2>
              <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                <span className="bg-gray-100 px-4 py-1.5 rounded-full border">{listing.property_type || 'Property'}</span>
                <span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full border border-blue-100">{listing.bedrooms} Beds</span>
                <span className="bg-purple-50 text-purple-600 px-4 py-1.5 rounded-full border border-purple-100">{listing.bathrooms} Baths</span>
              </div>
            </div>
            <div className="text-right">
               <p className="text-4xl font-black text-blue-600 tracking-tighter">${listing.price.toLocaleString()}</p>
               <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Market Price</p>
            </div>
          </div>

          <div className="mt-8 mb-12">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
               <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
               Property Description
            </h3>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-lg font-medium opacity-90">{listing.description}</p>
          </div>

          <div className="border-t pt-8 flex flex-col md:flex-row justify-end gap-4">
            <button 
              onClick={onClose}
              className="px-8 py-4 border border-gray-200 font-bold rounded-2xl hover:bg-gray-50 transition-all text-gray-600 shadow-sm"
            >
              Return Home
            </button>
            <button 
              onClick={() => window.location.href = `/messages?listing_id=${listing.id || listing.listing_id}&receiver_id=${listing.seller_id}`}
              className="px-10 py-4 bg-gray-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Contact Agent
            </button>
          </div>
        </div>
      </div>

      {walkthroughOpen && walkthroughUrl && (
        <WalkthroughViewerOverlay url={walkthroughUrl} onClose={() => setWalkthroughOpen(false)} />
      )}
    </div>
  );
}
