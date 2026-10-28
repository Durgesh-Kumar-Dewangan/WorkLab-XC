import type { Metadata } from 'next';
import { DemoPage } from '@/components/site/pages/DemoPage';

export const metadata: Metadata = {
  title: 'See how it works',
  description: 'Walk through a sample syllabus, its topic map and a 3D classroom lesson. No account needed.',
};
export default function Page() {
  return <DemoPage />;
}
