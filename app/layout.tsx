import type { Metadata } from 'next';
import './globals.css';

import SupabaseSyncProvider from '@/components/SupabaseSyncProvider';

export const metadata: Metadata = {
  title: 'AI Architect Assistant',
  description: 'Your AI-powered residential architect assistant.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col bg-navy text-white overflow-hidden">
        <SupabaseSyncProvider>
          {children}
        </SupabaseSyncProvider>
      </body>

    </html>
  );
}
