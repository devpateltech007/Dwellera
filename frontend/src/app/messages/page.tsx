"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing_id");
  const receiverId = searchParams.get("receiver_id");

  const [messages, setMessages] = useState<any[]>([]);
  const [inboxThreads, setInboxThreads] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState<any>(null);
  const [propertyTitle, setPropertyTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let channel: any;

    const initChat = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);

      if (listingId) {
        // Fetch historical messages from FastAPI
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/messages?listing_id=${listingId}&user_id=${session.user.id}`);
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : []);
          
          // Fetch property details for header
          const listingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings/${listingId}`);
          if (listingRes.ok) {
            const listingData = await listingRes.json();
            setPropertyTitle(listingData.title);
          }
        } catch (err) {
          console.error("Failed to load message history", err);
        }
      } else {
        // Fetch Inbox Threads
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/inbox?user_id=${session.user.id}`);
          const data = await res.json();
          setInboxThreads(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error("Failed to load inbox", err);
        }
      }

      // Subscribe to live Realtime updates via Supabase WebSockets
      if (listingId) {
        channel = supabase.channel('realtime:public:messages')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `listing_id=eq.${listingId}` },
            (payload) => {
              // Add the newly received message to the chat instantly (deduplicate just in case)
              setMessages(prev => {
                if (prev.find(m => m.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
            }
          )
          .subscribe();
      }
      setLoading(false);
    };

    initChat();

    // Cleanup subscription on unmount
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [listingId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !listingId || !receiverId) return;

    const messagePayload = {
      listing_id: parseInt(listingId),
      sender_id: user.id,
      receiver_id: receiverId,
      content: newMessage.trim()
    };

    setNewMessage(""); // optimistic clear

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload)
      });

      const savedMessage = await res.json();

      // Update local UI immediately so it doesn't break if WebSockets fail!
      setMessages(prev => {
        if (prev.find(m => m.id === savedMessage.id)) return prev;
        return [...prev, savedMessage];
      });

    } catch (err) {
      console.error("Failed to send message", err);
      alert("Error sending message.");
    }
  };

  if (!listingId && !loading) {
    return (
      <ProtectedRoute>
        <div className="max-w-3xl mx-auto h-[calc(100vh-64px)] p-4 md:p-8">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-8">My Inbox</h1>

          {inboxThreads.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm border text-gray-500">
              <h2 className="text-xl font-bold mb-2">No messages yet</h2>
              <p>When buyers contact you about your property, they will appear here!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {inboxThreads.map((thread, idx) => (
                <div
                  key={idx}
                  onClick={() => window.location.href = `/messages?listing_id=${thread.listing_id}&receiver_id=${thread.other_user_id}`}
                  className="bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{thread.listing_title}</h3>
                    <p className="text-gray-500 text-sm mt-1 line-clamp-1">{thread.last_message}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <span className="text-xs font-semibold text-primary bg-gray-100 px-3 py-1 rounded-full">Open Chat</span>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="max-w-4xl mx-auto h-[calc(100vh-64px)] flex flex-col p-4 md:p-8">
        <div className="bg-white rounded-2xl shadow-sm border flex flex-col h-full overflow-hidden">

          {/* Header */}
          <div className="bg-primary px-6 py-4 flex items-center justify-between text-white shadow-md z-10">
            <div>
              <h2 className="text-lg font-bold">Chat</h2>
              <p className="text-gray-300 text-sm opacity-90">{propertyTitle || `Property #${listingId}`}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-400 border border-green-200 animate-pulse"></span>
              <span className="text-sm font-medium">Realtime Active</span>
            </div>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 bg-gray-50 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center text-gray-400 mt-10">
                <p>No messages yet. Say hello!</p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${isMine
                      ? 'bg-primary text-white rounded-br-none'
                      : 'bg-white border text-gray-800 rounded-bl-none'
                    }`}>
                    <p className="leading-relaxed">{msg.content}</p>
                    <p className={`text-[10px] mt-1 text-right ${isMine ? 'text-gray-300' : 'text-gray-400'}`}>
                      {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="p-4 bg-white border-t">
            <div className="flex gap-2">
              <input
                aria-label="Type your message"
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!newMessage.trim()}
                className="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-gray-800 transition disabled:opacity-50 shadow-sm"
              >
                Send
              </button>
            </div>
          </form>

        </div>
      </div>
    </ProtectedRoute>
  );
}
