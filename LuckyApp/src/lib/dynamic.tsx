'use client';

import dynamic from 'next/dynamic';
import { type ReactNode } from 'react';

const DynamicProviderInner = dynamic(
  () => import('./dynamic-inner').then(mod => ({ default: mod.DynamicProviderInner })),
  { ssr: false }
);

export function DynamicProvider({ children }: { children: ReactNode }) {
  return <DynamicProviderInner>{children}</DynamicProviderInner>;
}
