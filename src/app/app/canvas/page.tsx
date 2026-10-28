import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CanvasPage } from '@/components/app/canvas/CanvasPage';

export const metadata: Metadata = { title: 'Canvas' };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CanvasPage />
    </Suspense>
  );
}
