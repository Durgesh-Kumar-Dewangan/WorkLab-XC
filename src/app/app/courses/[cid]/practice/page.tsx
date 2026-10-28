import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PracticePage } from '@/components/app/pages/PracticePage';

export const metadata: Metadata = { title: 'Practice' };
export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return (
    <Suspense fallback={null}>
      <PracticePage cid={cid} />
    </Suspense>
  );
}
