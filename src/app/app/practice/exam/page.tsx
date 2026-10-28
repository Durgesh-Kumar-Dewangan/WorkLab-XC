import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExamSetupPage } from '@/components/app/pages/ExamSetupPage';

export const metadata: Metadata = { title: 'Exam practice' };
export default function Page() {
  return (
    <Suspense>
      <ExamSetupPage />
    </Suspense>
  );
}
