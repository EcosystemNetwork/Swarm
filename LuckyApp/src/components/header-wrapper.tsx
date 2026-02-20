'use client';

import dynamic from 'next/dynamic';

const Header = dynamic(
  () => import('./header').then(mod => ({ default: mod.Header })),
  {
    ssr: false,
    loading: () => (
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur h-16 flex items-center px-6">
        <span className="text-xl font-bold text-green-500">🍀 LuckySt</span>
      </header>
    ),
  }
);

export function HeaderWrapper() {
  return <Header />;
}
