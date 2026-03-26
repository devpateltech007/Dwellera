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
      <body>
        <Navbar />
        <main className="min-h-screen bg-gray-50">
          {children}
        </main>
      </body>
    </html>
  );
}
