import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StudyPage } from '@/components/app/study/StudyPage';

export const metadata: Metadata = { title: 'Study coach' };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudyPage />
    </Suspense>
  );
}
