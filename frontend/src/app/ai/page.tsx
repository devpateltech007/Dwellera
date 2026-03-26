"use client";

import { useEffect, useState, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";

export default function AIPage() {
  const [session, setSession] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [logs, setLogs] = useState<{ role: string; text: string }[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const scriptProcRef = useRef<ScriptProcessorNode | null>(null);

  const [nextPlayTime, setNextPlayTime] = useState(0);
  const nextPlayTimeRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  const addLog = (role: string, text: string) => {
    setLogs((prev) => [...prev, { role, text }]);
  };

  const connectAPI = async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Missing NEXT_PUBLIC_GEMINI_API_KEY in frontend/.env.local!");
      return;
    }

    // List supported models for debugging
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1alpha/models?key=${apiKey}`);
      const listData = await listRes.json();
      if (listData.models) {
        const liveModels = listData.models
          .filter((m: any) => m.supportedGenerationMethods?.includes("bidiGenerateContent"))
          .map((m: any) => m.name);
        console.log("🌟 Compatible Live API Models Available:", liveModels);
      }
    } catch (err) {
      console.error("Failed to list internal models:", err);
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addLog("system", "Connected to Gemini Live API.");

      // Send Setup Message
      const setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoede" // Choose a cool voice
                }
              }
            }
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "search_marketplace",
                  description: "Searches the real estate database for properties matching user criteria. Call this whenever the user asks to find, look for, or see properties.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      search: { type: "STRING", description: "General search term, e.g. 'Pool', 'Modern'" },
                      property_type: { type: "STRING", description: "Type of property: 'House', 'Apartment', 'Condo', or 'Townhouse'." },
                      min_price: { type: "NUMBER" },
                      max_price: { type: "NUMBER" },
                      min_bedrooms: { type: "NUMBER" }
                    }
                  }
                },
                {
                  name: "create_listing",
                  description: "Creates a new barebones property listing in the database. Call this when the user says they want to list or sell a property.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING" },
                      description: { type: "STRING" },
                      price: { type: "NUMBER" },
                      property_type: { type: "STRING", description: "'House', 'Apartment', 'Condo', or 'Townhouse'" },
                      bedrooms: { type: "INTEGER" },
                      bathrooms: { type: "INTEGER" }
                    },
                    required: ["title", "description", "price", "property_type"]
                  }
                }
              ]
            }
          ]
        }
      };

      ws.send(JSON.stringify(setupMsg));
    };

    ws.onclose = (event) => {
      setConnected(false);
      stopMic();
      addLog("system", `Disconnected from API. (Code: ${event.code}, Reason: ${event.reason || "None given"})`);
    };

    ws.onerror = (err) => {
      console.error("WS Error:", err);
      addLog("system", "WebSocket error occurred.");
    };

    ws.onmessage = async (event) => {
      let data;
      // Depending on API version, it might be Blob or text
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        data = JSON.parse(text);
      } else {
        data = JSON.parse(event.data);
      }

      // Handle Server Content (Audio/Text)
      if (data.serverContent?.modelTurn?.parts) {
        data.serverContent.modelTurn.parts.forEach((part: any) => {
          if (part.text) {
            addLog("gemini", part.text);
          }
          if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
            playAudio(part.inlineData.data);
          }
        });
      }

      // Handle Tool Calls
      if (data.toolCall?.functionCalls) {
        const responses: any[] = [];

        for (const call of data.toolCall.functionCalls) {
          addLog("system", `Executing Tool: ${call.name}(${JSON.stringify(call.args)})`);

          if (call.name === "search_marketplace") {
            try {
              const query = new URLSearchParams();
              if (call.args.search) query.append('search', call.args.search);
              if (call.args.property_type) query.append('property_type', call.args.property_type);
              if (call.args.min_price) query.append('min_price', call.args.min_price.toString());
              if (call.args.max_price) query.append('max_price', call.args.max_price.toString());
              if (call.args.min_bedrooms) query.append('min_bedrooms', call.args.min_bedrooms.toString());

              const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings?${query.toString()}`);
              const dbData = await res.json();
              const slimData = dbData.slice(0, 5).map((x: any) => ({ id: x.id, title: x.title, price: x.price, desc: x.description, type: x.property_type }));

              responses.push({
                id: call.id,
                response: { result: slimData.length > 0 ? slimData : "No properties found matching those tools." }
              });
              addLog("system", `Tool returned ${slimData.length} properties.`);
            } catch (err) {
              responses.push({ id: call.id, response: { error: "Failed to fetch." } });
            }
          }
          else if (call.name === "create_listing") {
            if (!session) {
              responses.push({ id: call.id, response: { error: "User is not logged in." } });
            } else {
              try {
                const payload = {
                  ...call.args,
                  seller_id: session.user.id,
                  location_lat: 37.7749, // Default backup
                  location_lng: -122.4194
                };
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                if (res.ok) {
                  const lData = await res.json();
                  responses.push({ id: call.id, response: { result: `Successfully created listing with ID ${lData.id}` } });
                  addLog("system", `Created missing property: ${payload.title}`);
                } else {
                  responses.push({ id: call.id, response: { error: "Failed to create listing in DB." } });
                }
              } catch (e) {
                responses.push({ id: call.id, response: { error: "Network error creating listing." } });
              }
            }
          }
        }

        // Reply with ToolResponse
        if (responses.length > 0) {
          ws.send(JSON.stringify({
            toolResponse: { functionResponses: responses }
          }));
        }
      }
    };
  };

  const disconnectAPI = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const startMic = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("API not connected yet.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const pcmFloat = e.inputBuffer.getChannelData(0);
        const pcmInt16 = new Int16Array(pcmFloat.length);
        for (let i = 0; i < pcmFloat.length; i++) {
          let s = Math.max(-1, Math.min(1, pcmFloat[i]));
          pcmInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Encode to Base64
        let binary = '';
        const bytes = new Uint8Array(pcmInt16.buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = window.btoa(binary);

        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: b64
              }
            ]
          }
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      scriptProcRef.current = processor;

      setMicActive(true);
      addLog("system", "Microphone actively streaming to Gemini...");

    } catch (err) {
      console.error("Mic error:", err);
      alert("Microphone permission denied or failed.");
    }
  };

  const stopMic = () => {
    if (scriptProcRef.current && audioCtxRef.current) {
      scriptProcRef.current.disconnect();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
    }
    setMicActive(false);
    addLog("system", "Microphone stopped.");
  };

  const playAudio = (base64String: string) => {
    if (!audioCtxRef.current) {
      // Create an output context if we didn't start the mic yet
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioCtxRef.current;

    const binaryStr = window.atob(base64String);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 0x8000;
    }

    const buffer = ctx.createBuffer(1, float32Array.length, 24000);
    buffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Gapless playback queueing
    const currentTime = ctx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime + 0.05; // small buffer
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  };

  // cleanup
  useEffect(() => {
    return () => {
      stopMic();
      disconnectAPI();
    };
  }, []);

  return (
    <ProtectedRoute>
      <div className="relative flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden">

        {/* Animated Background Gradients */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="relative z-10 flex flex-col h-full w-full max-w-5xl mx-auto p-4 md:p-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
                <span className="bg-clip-text">Dwellera AI</span>
                {connected && <div className="flex gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span><span className="w-2.5 h-2.5 rounded-full bg-green-500 absolute"></span></div>}
              </h1>
              <p className="text-gray-500 font-semibold tracking-wide uppercase text-xs mt-1">Next-Gen Real Estate Intelligence</p>
            </div>

            <div className="flex gap-3">
              {!connected ? (
                <button
                  onClick={connectAPI}
                  className="group relative px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all duration-300 shadow-xl hover:shadow-2xl overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Initialize AI Instance
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
              ) : (
                <button onClick={disconnectAPI} className="px-8 py-3 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-all border border-red-100">
                  Terminate Session
                </button>
              )}
            </div>
          </div>

          {/* Main Interface */}
          <div className="flex-1 bg-white/40 backdrop-blur-xl border border-white/40 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.1)] rounded-[2.5rem] overflow-hidden flex flex-col relative z-0">

            {/* Logs View */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  <p>Connect and click the microphone to start talking.</p>
                  <p className="text-sm mt-2 opacity-70">Example: "Find me houses under a million dollars in the database."</p>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className={`flex ${log.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`
                  max-w-[85%] rounded-[1.5rem] px-5 py-3.5 shadow-sm text-sm font-medium leading-relaxed
                  ${log.role === 'system' ? 'bg-gray-100/80 text-gray-500 mx-auto w-full text-center text-xs' : 
                    log.role === 'user' ? 'bg-blue-600 text-white rounded-br-none ml-auto' : 'bg-white border text-gray-800 rounded-bl-none'}
                `}>
                  {log.role === 'gemini' ? (
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-blue prose-strong:text-blue-700">
                      <ReactMarkdown>{log.text}</ReactMarkdown>
                    </div>
                  ) : (
                    log.text
                  )}
                </div>
                </div>
              ))}
            </div>

            {/* Voice Controls */}
            <div className="p-6 bg-white border-t flex justify-center items-center shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] relative z-10">
              {connected ? (
                <button
                  onClick={micActive ? stopMic : startMic}
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl
                    ${micActive ? 'bg-red-500 scale-110 shadow-red-500/40' : 'bg-primary hover:scale-105 shadow-primary/40'}
                 `}
                >
                  {micActive ? (
                    <div className="w-6 h-6 bg-white rounded-sm animate-pulse"></div>
                  ) : (
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  )}
                </button>
              ) : (
                <p className="text-gray-400 font-medium">Connect to API to enable voice.</p>
              )}
            </div>

          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
