'use client';

import React, { useEffect, useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import LoginPortal from './LoginPortal';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setIsAuthenticated } = useArchitectStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isAuth = sessionStorage.getItem('user_authenticated') === 'true';
    if (isAuth && !isAuthenticated) {
      setIsAuthenticated(true);
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, setIsAuthenticated]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-[#020204] font-mono text-white">
         <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPortal />;
  }

  return <>{children}</>;
}
