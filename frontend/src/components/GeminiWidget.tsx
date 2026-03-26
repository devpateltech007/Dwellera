"use client";

import Link from "next/link";

export default function GeminiWidget() {
  return (
    <Link
      href="/ai"
      aria-label="Talk to Dwellera AI!"
      className="fixed bottom-6 right-6 z-[90] hover:scale-110 transition-transform duration-300 group"
    >
      <div className="gemini-loader">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <defs>
            <mask id="clipping-gemini">
              <polygon points="0,0 100,0 100,100 0,100" fill="black"></polygon>
              <polygon points="25,25 75,25 50,75" fill="white"></polygon>
              <polygon points="50,25 75,75 25,75" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
              <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            </mask>
          </defs>
        </svg>
        <div className="box"></div>
        <span className="absolute inset-0 flex items-center justify-center text-white font-black text-2xl tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-20">
          AI
        </span>
      </div>

      {/* Tooltip */}
      <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity font-bold shadow-lg pointer-events-none hidden md:block">
        Talk to Gemini Voice AI
      </span>
    </Link>
  );
}
