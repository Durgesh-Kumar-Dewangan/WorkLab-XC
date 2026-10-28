'use client';

import type { ReactNode } from 'react';
import { PrefsSync } from './PrefsSync';
import { ModalHost, ToastHost } from '@/components/ui/Hosts';
import { RouteBar } from './RouteBar';
import { CookieNotice } from './CookieNotice';
import { OfflineBanner } from './OfflineBanner';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <PrefsSync />
      <RouteBar />
      <OfflineBanner />
      {children}
      <CookieNotice />
      <ToastHost />
      <ModalHost />
    </>
  );
}
