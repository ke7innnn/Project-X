'use client';

import React, { useEffect, useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import LoginPortal from './LoginPortal';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useArchitectStore((state) => state.isAuthenticated);
  const setIsAuthenticated = useArchitectStore((state) => state.setIsAuthenticated);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if the user is already authenticated in localStorage
    const savedAuth = localStorage.getItem('user_authenticated');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, [setIsAuthenticated]);

  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full bg-[#020204] flex items-center justify-center font-mono z-[9999] text-white">
        <div className="text-zinc-500 uppercase tracking-[3px] text-xs">Authenticating secure link...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPortal />;
  }

  return <>{children}</>;
}
