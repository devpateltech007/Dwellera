import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dwellera - Real Estate',
  description: 'Find your dream home with Dwellera.',
};

import Navbar from '@/components/Navbar';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 overflow-y-auto w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
