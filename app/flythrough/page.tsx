'use client';

import React from 'react';
import FlythroughStudio from '@/components/FlythroughStudio';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';

export default function FlythroughPage() {
  useActiveProjectGuard();

  return (
    <div className="flex flex-col min-h-screen bg-[#08070b]">
      <FlythroughStudio />
    </div>
  );
}
