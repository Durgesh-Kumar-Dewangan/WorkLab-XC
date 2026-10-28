import type { Metadata } from 'next';
import { AboutPage } from '@/components/site/pages/AboutPage';

export const metadata: Metadata = {
  title: 'About',
  description: 'WorkLab XC turns your syllabus into spoken lessons, games and practice, one topic at a time.',
  alternates: { canonical: '/about' },
};
export default function Page() {
  return <AboutPage />;
}
