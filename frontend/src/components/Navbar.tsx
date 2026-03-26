"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Navbar() {
    const [session, setSession] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
        return () => authListener.subscription.unsubscribe();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
        router.refresh();
    };

    return (
        <nav className="px-6 py-4 bg-primary text-white flex justify-between items-center shadow-md relative z-50">
            <Link href="/" className="text-xl font-extrabold tracking-tight">Dwellera</Link>

            <div className="flex items-center gap-6 text-sm font-medium">
                {!session && <Link href="/" className="hover:text-gray-300 transition">Home</Link>}
                {session && <Link href="/search" className="hover:text-gray-300 transition">Map</Link>}

                {session ? (
                    <div className="flex items-center gap-4">
                        <button onClick={handleSignOut} className="text-gray-300 hover:text-white transition font-medium mr-2">
                            Sign Out
                        </button>
                        <Link href="/dashboard" className="bg-white text-primary px-5 py-2 rounded-full hover:bg-gray-100 transition shadow-sm font-bold">
                            Dashboard
                        </Link>
                    </div>
                ) : (
                    <Link href="/auth" className="bg-white text-primary px-5 py-2 rounded-full hover:bg-gray-100 transition shadow-sm font-bold">
                        Sign In
                    </Link>
                )}
            </div>
        </nav>
    );
}
