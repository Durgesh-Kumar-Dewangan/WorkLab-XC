import type { Metadata } from 'next';
import { PracticeIndexPage } from '@/components/app/pages/CoursesPage';

export const metadata: Metadata = { title: 'Practice' };
export default function Page() {
  return <PracticeIndexPage />;
}
