"use client";

import { useEffect, useState, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import dynamic from 'next/dynamic';
import PropertyDetailsModal from "@/components/PropertyDetailsModal";

// Dynamically import Map to avoid SSR issues
const MapComponent = dynamic(() => import('@/components/Map'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center font-bold text-gray-400">Initializing Map Visualization...</div>
});

type BuyerPrefs = {
  budget: string;
  city: string;
  area: string;
  min_bedrooms: string;
  min_bathrooms: string;
  max_budget: string;
  property_type: string;
  notes: string;
};

const emptyPrefs = (): BuyerPrefs => ({
  budget: "",
  city: "",
  area: "",
  min_bedrooms: "2",
  min_bathrooms: "2",
  max_budget: "",
  property_type: "House",
  notes: ""
});

async function fetchBuyerPreferences(userId: string, apiBase: string): Promise<BuyerPrefs | null> {
  try {
    const res = await fetch(`${apiBase}/api/buyer-preferences/${userId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      budget: String(data.budget ?? ""),
      city: data.city || "",
      area: data.area || "",
      min_bedrooms: String(data.min_bedrooms ?? 2),
      min_bathrooms: String(data.min_bathrooms ?? 2),
      max_budget: data.max_budget ? String(data.max_budget) : "",
      property_type: data.property_type || "House",
      notes: data.notes || ""
    };
  } catch {
    return null;
  }
}

function buildLiveSystemInstruction(loggedIn: boolean, prefs: BuyerPrefs): string {
  const lines = [
    "You are Dwellera's voice and text assistant for property search, listings, and buyer negotiation.",
    "",
    "SAVED BUYER PROFILE (from this user's Dwellera account—use these values in tool calls unless the user clearly overrides them in this conversation):"
  ];
  if (!loggedIn) {
    lines.push("- User is not signed in. Ask for budget and location before starting a negotiator campaign.");
  } else {
    lines.push(`- Min budget USD: ${prefs.budget?.trim() ? prefs.budget : "not saved yet"}`);
    lines.push(`- Max budget USD: ${prefs.max_budget?.trim() ? prefs.max_budget : "not set"}`);
    lines.push(`- City: ${prefs.city?.trim() ? prefs.city : "not saved yet"}`);
    lines.push(`- Area / neighborhood: ${prefs.area?.trim() ? prefs.area : "not set"}`);
    lines.push(`- Min bedrooms: ${prefs.min_bedrooms}`);
    lines.push(`- Min bathrooms: ${prefs.min_bathrooms}`);
    lines.push(`- Property type: ${prefs.property_type}`);
    if (prefs.notes?.trim()) lines.push(`- Extra notes: ${prefs.notes}`);
    lines.push("");
    lines.push(
      "When the user wants to start a negotiation campaign or seller outreach, call start_negotiator_campaign using the SAVED BUYER PROFILE for every parameter you can fill from it (especially min_budget and max_budget). Do not tell the user you lack access to their preferences—they are listed above. Only ask the user for fields that are genuinely missing from the profile (for example if min budget shows \"not saved yet\")."
    );
    lines.push(
      "If the user confirms they want outreach with saved prefs (for example chosen max_candidates), say one brief line like you're starting—and call the tool once. Do not repeat the full parameter list in multiple paragraphs or stall with meta commentary before calling tools."
    );
    lines.push(
      "When a tool response includes error text, summarize it calmly in one short message for the user. Include the suggested next steps from that error rather than blaming a vague unnamed failure."
    );
  }
  lines.push("");
  lines.push("Negotiation messaging should sound natural and human, not robotic.");
  return lines.join("\n");
}

function resolveBudgetUSD(toolArg: unknown, prefStr: string): number | undefined {
  if (toolArg != null && toolArg !== "") {
    const n = Number(toolArg);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (prefStr && String(prefStr).trim() !== "") {
    const n = Number(prefStr);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function resolveBudgetRange(args: any, prefs: BuyerPrefs): {
  budget?: number;
  minBudget?: number;
  maxBudget?: number;
} {
  const argBudgetRaw = args?.budget != null ? Number(args.budget) : undefined;
  const argBudget = Number.isFinite(argBudgetRaw) && argBudgetRaw > 0 ? argBudgetRaw : undefined;
  const prefBudgetRaw = prefs.budget?.trim() ? Number(prefs.budget) : undefined;
  const prefBudget = Number.isFinite(prefBudgetRaw) && prefBudgetRaw > 0 ? prefBudgetRaw : undefined;

  const argMinRaw = args?.min_budget != null ? Number(args.min_budget) : undefined;
  const argMaxRaw = args?.max_budget != null ? Number(args.max_budget) : undefined;
  const argMin = Number.isFinite(argMinRaw) && argMinRaw > 0 ? argMinRaw : undefined;
  const argMax = Number.isFinite(argMaxRaw) && argMaxRaw > 0 ? argMaxRaw : undefined;

  const prefMaxRaw = prefs.max_budget?.trim() ? Number(prefs.max_budget) : undefined;
  const prefMax = Number.isFinite(prefMaxRaw) && prefMaxRaw > 0 ? prefMaxRaw : undefined;

  const useRangeFromArgs = argMin != null || argMax != null;
  const useRangeFromPrefs = prefMax != null;

  // Only treat saved "budget" as a minimum when user also saved max_budget.
  const minBudget =
    argMin ??
    (useRangeFromArgs && argBudget != null ? argBudget : undefined) ??
    (useRangeFromPrefs ? prefBudget : undefined);
  const maxBudget = argMax ?? (useRangeFromPrefs ? prefMax : undefined);

  // In non-range mode, keep legacy behavior: saved budget is the target budget.
  let budget = argBudget ?? (!useRangeFromArgs ? prefBudget : undefined);
  if (!budget && minBudget != null && maxBudget != null) budget = (minBudget + maxBudget) / 2;
  if (!budget && maxBudget != null) budget = maxBudget;
  if (!budget && minBudget != null) budget = minBudget;

  return { budget, minBudget, maxBudget };
}

/** Turn FastAPI `detail` (string | validation array | object) into one line for logs. */
function formatFastApiDetail(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: { msg?: string }) => (typeof e?.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    const m = (detail as { message?: string }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/**
 * Friendly copy for the chat log plus a richer string for Gemini (tool error), so replies stay helpful rather than vague.
 */
function negotiatorStartFailureGuide(
  httpStatus: number,
  detail: unknown,
  networkError: boolean
): { chat: string; tool: string } {
  const apiLine = formatFastApiDetail(detail).trim();
  const nextSteps =
    "Suggested next steps: wait a moment and retry; open AI Negotiation and adjust budget, city, property type, or minimum beds/baths; or search the marketplace to confirm listings exist. If errors keep repeating, the API may be temporarily unavailable—try again later.";

  if (networkError) {
    const chat =
      "Could not reach the Dwellera API. Check your internet connection and that the backend server is running, then retry.";
    return { chat, tool: `${chat} ${nextSteps}` };
  }

  if (httpStatus === 422) {
    const chat = apiLine
      ? `Cannot start campaign: ${apiLine}`
      : "Cannot start campaign: some fields look invalid. Check AI Negotiation preferences (budget, beds, baths) and retry.";
    return { chat, tool: `${chat} ${nextSteps}` };
  }

  if (httpStatus >= 500) {
    const chat =
      "The server had a problem starting the campaign. This is usually temporary—wait a few seconds and retry.";
    const extra = apiLine ? ` Server message: ${apiLine}` : "";
    return { chat, tool: `${chat}${extra} ${nextSteps}` };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    const chat =
      "This action could not be authorized. Sign out, sign back in, and try again.";
    return { chat, tool: `${chat} ${nextSteps}` };
  }

  if (httpStatus === 404) {
    const chat =
      "The negotiator endpoint was not found. Confirm the backend is deployed and NEXT_PUBLIC_API_URL points to it.";
    return { chat, tool: `${chat} ${nextSteps}` };
  }

  const chat =
    apiLine || `Campaign could not start (request failed${httpStatus ? `, HTTP ${httpStatus}` : ""}).`;
  return { chat, tool: `${chat} ${nextSteps}` };
}

export default function AIPage() {
  const [session, setSession] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [autoNegotiatorEnabled, setAutoNegotiatorEnabled] = useState(true);
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefs, setPrefs] = useState<BuyerPrefs>(() => emptyPrefs());
  const prefsRef = useRef<BuyerPrefs>(emptyPrefs());
  const [logs, setLogs] = useState<{ role: string; text: string; properties?: any[] }[]>([]);
  const [chatText, setChatText] = useState("");
  const [foundProperties, setFoundProperties] = useState<any[]>([]);
  const [selectedListing, setSelectedListing] = useState<any>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const scriptProcRef = useRef<ScriptProcessorNode | null>(null);

  const [nextPlayTime, setNextPlayTime] = useState(0);
  const nextPlayTimeRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    const loadPrefsAndAIMode = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.user?.id) return;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      try {
        const res = await fetch(`${apiBase}/api/buyer-preferences/${s.user.id}`);
        if (res.ok) {
          const data = await res.json();
          setAutoNegotiatorEnabled(Boolean(data.ai_mode_enabled));
          const next: BuyerPrefs = {
            budget: String(data.budget ?? ""),
            city: data.city || "",
            area: data.area || "",
            min_bedrooms: String(data.min_bedrooms ?? 2),
            min_bathrooms: String(data.min_bathrooms ?? 2),
            max_budget: data.max_budget ? String(data.max_budget) : "",
            property_type: data.property_type || "House",
            notes: data.notes || ""
          };
          setPrefs(next);
          prefsRef.current = next;
        }
      } catch {}
    };
    loadPrefsAndAIMode();
  }, []);

  const addLog = (role: string, text: string, properties?: any[]) => {
    setLogs((prev) => [...prev, { role, text, properties }]);
  };

  const openPreferenceModal = async () => {
    if (!session) {
      addLog("system", "Please sign in before changing AI negotiation mode.");
      return;
    }

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const loaded = await fetchBuyerPreferences(session.user.id, apiBase);
      if (loaded) {
        setPrefs(loaded);
        prefsRef.current = loaded;
      }
    } catch {}
    setShowPrefModal(true);
  };

  const toggleAutoNegotiator = async () => {
    if (!session) {
      addLog("system", "Please sign in before changing AI negotiation mode.");
      return;
    }
    if (!autoNegotiatorEnabled) {
      await openPreferenceModal();
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/buyer-preferences/${session.user.id}/ai-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Unable to update autopilot.");
      setAutoNegotiatorEnabled(false);
      addLog("system", `AI negotiation autopilot is paused. Updated ${data.updated_sessions} active session(s).`);
    } catch {
      addLog("system", "Could not update autopilot right now. Please try again.");
    }
  };

  const savePreferencesAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setPrefSaving(true);
    try {
      const prefPayload = {
        budget: Number(prefs.budget),
        city: prefs.city || null,
        area: prefs.area || null,
        min_bedrooms: Number(prefs.min_bedrooms || 1),
        min_bathrooms: Number(prefs.min_bathrooms || 1),
        max_budget: prefs.max_budget ? Number(prefs.max_budget) : null,
        property_type: prefs.property_type || null,
        notes: prefs.notes || "",
        ai_mode_enabled: true
      };
      const prefRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/buyer-preferences/${session.user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefPayload)
      });
      const prefData = await prefRes.json();
      if (!prefRes.ok) throw new Error(prefData?.detail || "Could not save preferences.");

      const autoRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/buyer-preferences/${session.user.id}/ai-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true })
      });
      const autoData = await autoRes.json();
      if (!autoRes.ok) throw new Error(autoData?.detail || "Unable to enable autopilot.");

      setAutoNegotiatorEnabled(true);
      setShowPrefModal(false);
      addLog("system", `AI negotiation autopilot is on. Updated ${autoData.updated_sessions} active session(s).`);
    } catch {
      addLog("system", "Could not save preferences or enable autopilot. Please try again.");
    } finally {
      setPrefSaving(false);
    }
  };

  const connectAPI = async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Missing NEXT_PUBLIC_GEMINI_API_KEY in frontend/.env.local!");
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (authSession?.user) setSession(authSession);

    let prefsForLive = prefsRef.current;
    if (authSession?.user?.id) {
      const loaded = await fetchBuyerPreferences(authSession.user.id, apiBase);
      if (loaded) {
        prefsForLive = loaded;
        setPrefs(loaded);
        prefsRef.current = loaded;
      }
    }
    const systemInstructionText = buildLiveSystemInstruction(Boolean(authSession?.user), prefsForLive);
    const toolUserId = authSession?.user?.id ?? null;

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
      if (authSession?.user?.id && prefsForLive.budget) {
        addLog("system", "Using your saved buyer preferences for tools (budget and location are available to the AI).");
      } else if (authSession?.user?.id) {
        addLog("system", "Sign in OK. Save budget and city under AI Negotiation if you want the AI to start campaigns without asking.");
      }

      // Send Setup Message
      const setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
          systemInstruction: {
            parts: [{ text: systemInstructionText }]
          },
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
                },
                {
                  name: "start_negotiator_campaign",
                  description:
                    "Starts an AI negotiator campaign: finds listings near the buyer budget and opens outreach to sellers. The user's saved profile is in your system instructions—pass those values for budget, city, beds, baths, and type whenever they are set there. Omit a parameter only when you need the user to supply it and it is missing from the profile.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      budget: {
                        type: "NUMBER",
                        description:
                          "Target budget in USD for ranking. If min_budget and max_budget are present, this can be omitted."
                      },
                      min_budget: { type: "NUMBER", description: "Minimum price in USD for candidate listings." },
                      max_budget: { type: "NUMBER", description: "Maximum price in USD for candidate listings." },
                      city: { type: "STRING", description: "Preferred city from profile or conversation" },
                      area: { type: "STRING", description: "Preferred area or neighborhood" },
                      min_bedrooms: { type: "INTEGER", description: "Minimum bedrooms needed" },
                      min_bathrooms: { type: "INTEGER", description: "Minimum bathrooms needed" },
                      property_type: { type: "STRING", description: "House, Apartment, Condo, or Townhouse" },
                      radius_km: { type: "NUMBER", description: "Search radius in km, default 20" },
                      max_candidates: { type: "INTEGER", description: "Number of seller negotiations to open" }
                    }
                  }
                },
                {
                  name: "continue_negotiation",
                  description: "Saves seller response into negotiation memory and generates the next human style negotiation response with a suggested offer.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      session_id: { type: "INTEGER", description: "Negotiation session id" },
                      seller_reply: { type: "STRING", description: "Latest seller response text" }
                    },
                    required: ["session_id", "seller_reply"]
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
              
              // Extract data for both AI and Map
              const mapData = dbData.slice(0, 10); // Show up to 10 on map
              setFoundProperties(mapData);

              const slimData = mapData.map((x: any) => ({ 
                id: x.id, 
                title: x.title, 
                price: x.price, 
                desc: x.description, 
                type: x.property_type,
                beds: x.bedrooms,
                baths: x.bathrooms,
                image: x.image_urls?.[0] || 'https://via.placeholder.com/400x300?text=No+Image'
              }));

              responses.push({
                id: call.id,
                response: { result: slimData.length > 0 ? slimData : "No properties found matching those tools." }
              });
              
              if (slimData.length > 0) {
                addLog("system", `I've highlighted ${slimData.length} properties on the map for you.`, mapData);
              } else {
                addLog("system", "No properties found matching those criteria.");
              }
            } catch (err) {
              responses.push({ id: call.id, response: { error: "Failed to fetch." } });
            }
          }
          else if (call.name === "create_listing") {
            if (!toolUserId) {
              responses.push({ id: call.id, response: { error: "User is not logged in." } });
            } else {
              try {
                const payload = {
                  ...call.args,
                  seller_id: toolUserId,
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
          else if (call.name === "start_negotiator_campaign") {
            if (!toolUserId) {
              const chat = "Sign in is required before starting an outreach campaign. Please sign in and try again.";
              addLog("system", chat);
              responses.push({ id: call.id, response: { error: chat } });
            } else {
              try {
                const p = prefsRef.current;
                const a = call.args || {};
                const { budget, minBudget, maxBudget } = resolveBudgetRange(a, p);
                if (budget == null) {
                  const chat =
                    "No budget range saved or provided. Open AI Negotiation, set min and max budget, save—then try again—or tell the assistant your budget range.";
                  addLog("system", chat);
                  responses.push({
                    id: call.id,
                    response: {
                      error: `${chat} Do not insist the backend failed; prompt the user clearly to add a budget.`,
                    },
                  });
                } else {
                const city = (a.city ?? p.city)?.trim() || null;
                const area = (a.area ?? p.area)?.trim() || null;
                const minBed =
                  a.min_bedrooms != null ? Number(a.min_bedrooms) : Number(p.min_bedrooms || 1);
                const minBath =
                  a.min_bathrooms != null ? Number(a.min_bathrooms) : Number(p.min_bathrooms || 1);
                const propType = (a.property_type ?? p.property_type)?.trim() || null;

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/negotiator/start`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    buyer_id: toolUserId,
                    radius_km: a.radius_km ?? 20,
                    max_candidates: a.max_candidates ?? 5,
                    auto_mode: autoNegotiatorEnabled,
                    budget,
                    min_budget: minBudget ?? null,
                    max_budget: maxBudget ?? null,
                    city,
                    area,
                    min_bedrooms: Number.isFinite(minBed) ? minBed : null,
                    min_bathrooms: Number.isFinite(minBath) ? minBath : null,
                    property_type: propType
                  })
                });

                let campaignData: Record<string, unknown> = {};
                try {
                  campaignData = (await res.json()) as Record<string, unknown>;
                } catch {
                  campaignData = {};
                }

                if (!res.ok) {
                  const { chat, tool } = negotiatorStartFailureGuide(res.status, campaignData?.detail, false);
                  addLog("system", chat);
                  responses.push({ id: call.id, response: { error: tool } });
                } else {
                  const sessions = (campaignData.sessions as unknown[]) || [];
                  responses.push({
                    id: call.id,
                    response: {
                      result: sessions.length > 0
                        ? sessions.map((s: any) => ({
                            session_id: s.session_id,
                            listing_id: s.listing_id,
                            title: s.listing_title,
                            price: s.listing_price,
                            distance_km: s.distance_km,
                            seller_id: s.seller_id
                          }))
                        : "No qualifying listings found within budget and radius."
                    }
                  });

                  if (sessions.length > 0) {
                    addLog("system", `Negotiator launched across ${sessions.length} seller conversations with memory enabled.`);
                  } else {
                    addLog(
                      "system",
                      "The campaign ran, but no listings matched your filters (price under ~115% of budget, bed/bath minimums, property type, and city text on the listing). Try widening budget or property type in AI Negotiation, or search the marketplace to see what is available."
                    );
                  }
                }
                }
              } catch (err) {
                const { chat, tool } = negotiatorStartFailureGuide(0, null, true);
                addLog("system", chat);
                responses.push({ id: call.id, response: { error: tool } });
              }
            }
          }
          else if (call.name === "continue_negotiation") {
            try {
              const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/negotiator/${call.args.session_id}/seller-reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seller_reply: call.args.seller_reply })
              });
              const replyData = await res.json();
              if (!res.ok) {
                responses.push({ id: call.id, response: { error: replyData?.detail || "Failed to continue negotiation." } });
              } else {
                responses.push({
                  id: call.id,
                  response: {
                    result: {
                      session_id: replyData.session_id,
                      listing_id: replyData.listing_id,
                      suggested_offer: replyData.suggested_offer,
                      reply: replyData.reply
                    }
                  }
                });
                addLog("system", `Negotiator memory updated for session ${replyData.session_id}.`);
              }
            } catch (err) {
              responses.push({ id: call.id, response: { error: "Failed to continue negotiation." } });
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

  const sendTextPrompt = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Initialize the AI session first, then send a message.");
      return;
    }
    addLog("user", trimmed);
    wsRef.current.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: trimmed }]
            }
          ],
          turnComplete: true
        }
      })
    );
    setChatText("");
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

        <div className="relative z-10 flex flex-col h-full w-full max-w-[1400px] mx-auto p-4 md:p-6">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
                <span className="bg-clip-text">Dwellera AI</span>
                {connected && <div className="flex gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span><span className="w-2.5 h-2.5 rounded-full bg-green-500 absolute"></span></div>}
              </h1>
              <p className="text-gray-500 font-semibold tracking-wide uppercase text-xs mt-1">Next-Gen Real Estate Intelligence</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={toggleAutoNegotiator}
                className={`px-4 py-3 rounded-2xl border font-bold text-sm transition-all ${
                  autoNegotiatorEnabled
                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                }`}
                title="Toggle AI negotiator autopilot"
              >
                AI Negotiation {autoNegotiatorEnabled ? "On" : "Off"}
              </button>
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

          <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
            
            {/* Left Column: Chat Interface */}
            <div className="flex-[4] flex flex-col bg-white/40 backdrop-blur-xl border border-white/40 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.1)] rounded-[2.5rem] overflow-hidden relative z-0">
              {/* Logs View */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
                {logs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 px-4">
                    <div className="w-20 h-20 mb-6 bg-white/50 rounded-full flex items-center justify-center shadow-inner">
                       <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                    <p className="font-bold text-gray-900 mb-1">Dwellera AI Voice is Ready</p>
                    <p className="max-w-xs text-sm">Connect and click the microphone to describe what you're looking for.</p>
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
                      <div className="space-y-3">
                        <p>{log.text}</p>
                        {log.properties && log.properties.length > 0 && (
                          <div className="grid grid-cols-1 gap-3 mt-4">
                            {log.properties.map((prop, idx) => (
                              <div key={idx} className="bg-white border rounded-2xl overflow-hidden flex shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
                                <div className="w-24 h-24 flex-shrink-0 relative overflow-hidden">
                                   <img 
                                     src={prop.image_urls?.[0] || 'https://via.placeholder.com/100'} 
                                     alt={prop.title}
                                     className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                   />
                                </div>
                                <div className="flex-1 p-3 flex flex-col justify-center">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{prop.title}</h4>
                                    <p className="text-blue-600 font-black text-xs shrink-0">${prop.price.toLocaleString()}</p>
                                  </div>
                                  <div className="flex gap-2 mt-1 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                                    <span>{prop.bedrooms} Bed</span>
                                    <span>•</span>
                                    <span>{prop.property_type}</span>
                                  </div>
                                  
                                  <div className="flex gap-2 mt-3">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setSelectedListing(prop); }}
                                      className="flex-1 py-1.5 bg-gray-50 text-gray-700 text-[10px] font-bold rounded-lg border hover:bg-white transition-colors"
                                    >
                                      View Details
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); window.location.href = `/messages?listing_id=${prop.id || prop.listing_id}&receiver_id=${prop.seller_id}`; }}
                                      className="flex-1 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                                    >
                                      Contact Agent
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                ))}
              </div>

              {/* Text + voice controls */}
              <div className="p-6 bg-white border-t flex flex-col gap-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] relative z-10">
                {connected ? (
                  <>
                    <form
                      onSubmit={sendTextPrompt}
                      className="flex w-full max-w-2xl mx-auto gap-2 items-stretch"
                    >
                      <input
                        type="text"
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        placeholder="Type a message for the AI (search, negotiate, questions)..."
                        aria-label="Message to AI"
                        className="flex-1 min-w-0 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!chatText.trim()}
                        className="px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Send
                      </button>
                    </form>
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={micActive ? stopMic : startMic}
                        className={`
                          w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl
                          ${micActive ? 'bg-red-500 scale-110 shadow-red-500/40' : 'bg-primary hover:scale-105 shadow-primary/40'}
                       `}
                        aria-label={micActive ? "Stop microphone" : "Start microphone"}
                      >
                        {micActive ? (
                          <div className="w-5 h-5 bg-white rounded-sm animate-pulse"></div>
                        ) : (
                          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 text-gray-400 font-bold bg-gray-50 px-6 py-3 rounded-full border border-dashed border-gray-200 w-full max-w-md justify-center">
                      <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                      Initialize Interface to use text and voice
                    </div>
                    <input
                      type="text"
                      disabled
                      placeholder="Connect first to type messages..."
                      className="w-full max-w-2xl px-4 py-3 border border-gray-100 rounded-xl text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Map Visualization */}
            <div className={`flex-[5] bg-white rounded-[2.5rem] border overflow-hidden shadow-2xl relative transition-all duration-500 ${foundProperties.length > 0 ? 'opacity-100 scale-100' : 'opacity-60 scale-[0.98]'}`}>
              <div className="absolute top-6 left-6 z-10 flex gap-2">
                <div className="bg-white/90 backdrop-blur-md border px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 transition-all">
                  <div className={`w-3 h-3 rounded-full ${foundProperties.length > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                  <span className="text-xs font-black uppercase text-gray-700 tracking-tighter">
                    {foundProperties.length} Properties Located
                  </span>
                </div>
              </div>
              
              <MapComponent listings={foundProperties} />

              {foundProperties.length === 0 && (
                <div className="absolute inset-0 bg-gray-900/5 backdrop-blur-[2px] pointer-events-none flex items-center justify-center p-12 text-center">
                  <div className="max-w-xs space-y-2">
                    <p className="font-black text-gray-900 text-lg">Waiting for Queries</p>
                    <p className="text-sm text-gray-500 font-medium">Ask Gemini to search for listings to populate the geographic visualization.</p>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Global Property Details Modal */}
        {selectedListing && (
          <PropertyDetailsModal 
            listing={selectedListing} 
            onClose={() => setSelectedListing(null)} 
          />
        )}

        {showPrefModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <form onSubmit={savePreferencesAndEnable} className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900">AI Negotiation Preferences</h3>
                  <p className="text-sm text-gray-500">We show this every time you turn on autopilot so you can confirm before it runs.</p>
                </div>
                <button type="button" onClick={() => setShowPrefModal(false)} className="text-gray-500 font-bold">Close</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input required type="number" placeholder="Budget" value={prefs.budget} onChange={(e) => setPrefs((p) => ({ ...p, budget: e.target.value }))} className="px-4 py-3 border rounded-xl" />
                <input type="number" placeholder="Max Budget (optional)" value={prefs.max_budget} onChange={(e) => setPrefs((p) => ({ ...p, max_budget: e.target.value }))} className="px-4 py-3 border rounded-xl" />
                <input required type="text" placeholder="Preferred City" value={prefs.city} onChange={(e) => setPrefs((p) => ({ ...p, city: e.target.value }))} className="px-4 py-3 border rounded-xl" />
                <input type="text" placeholder="Preferred Area (optional)" value={prefs.area} onChange={(e) => setPrefs((p) => ({ ...p, area: e.target.value }))} className="px-4 py-3 border rounded-xl" />
                <input required type="number" min="1" placeholder="Min Bedrooms" value={prefs.min_bedrooms} onChange={(e) => setPrefs((p) => ({ ...p, min_bedrooms: e.target.value }))} className="px-4 py-3 border rounded-xl" />
                <input required type="number" min="1" placeholder="Min Bathrooms" value={prefs.min_bathrooms} onChange={(e) => setPrefs((p) => ({ ...p, min_bathrooms: e.target.value }))} className="px-4 py-3 border rounded-xl" />
                <select value={prefs.property_type} onChange={(e) => setPrefs((p) => ({ ...p, property_type: e.target.value }))} className="px-4 py-3 border rounded-xl">
                  <option>House</option>
                  <option>Apartment</option>
                  <option>Condo</option>
                  <option>Townhouse</option>
                </select>
              </div>
              <textarea value={prefs.notes} onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value }))} placeholder="Anything else AI should consider" className="w-full px-4 py-3 border rounded-xl min-h-[90px]" />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowPrefModal(false)} className="px-5 py-2.5 rounded-xl border font-bold text-gray-600">Cancel</button>
                <button disabled={prefSaving} type="submit" className="px-5 py-2.5 rounded-xl bg-primary text-white font-bold disabled:opacity-60">
                  {prefSaving ? "Saving..." : "Save and Turn On"}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
