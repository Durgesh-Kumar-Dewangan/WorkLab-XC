import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LearnHub } from '@/components/app/pages/LearnHub';

export const metadata: Metadata = { title: 'Learn', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <LearnHub />
    </Suspense>
  );
}
