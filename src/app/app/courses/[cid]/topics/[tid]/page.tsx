import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LessonPage } from '@/components/app/pages/LessonPage';

export const metadata: Metadata = { title: 'Lesson' };
export default async function Page({ params }: { params: Promise<{ cid: string; tid: string }> }) {
  const { cid, tid } = await params;
  return (
    <Suspense fallback={null}>
      <LessonPage key={`${cid}/${tid}`} cid={cid} tid={tid} />
    </Suspense>
  );
}
