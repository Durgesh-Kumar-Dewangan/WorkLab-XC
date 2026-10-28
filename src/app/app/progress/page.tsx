import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProgressPage } from '@/components/app/pages/ProgressPage';

export const metadata: Metadata = { title: 'Progress' };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProgressPage />
    </Suspense>
  );
}
