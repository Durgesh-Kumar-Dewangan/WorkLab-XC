import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LearnSession } from '@/components/app/pages/LearnSession';

export const metadata: Metadata = { title: 'Learning session', robots: { index: false } };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LearnSession />
    </Suspense>
  );
}
