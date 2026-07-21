import type { Metadata } from 'next';
import './globals.css';

import SupabaseSyncProvider from '@/components/SupabaseSyncProvider';
import AuthGuard from '@/components/AuthGuard';
import HUDModalProvider from '@/components/HUDModalProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
        <ErrorBoundary section="App">
          <SupabaseSyncProvider>
            <AuthGuard>
              {children}
              <HUDModalProvider />
            </AuthGuard>
          </SupabaseSyncProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
