'use client';

import React from 'react';
import FlythroughStudio from '@/components/FlythroughStudio';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';

export default function FlythroughPage() {
  useActiveProjectGuard();

  return (
    <main className="w-full h-screen max-h-screen flex flex-col overflow-hidden bg-[#08070b]">
      <FlythroughStudio />
    </main>
  );
}
