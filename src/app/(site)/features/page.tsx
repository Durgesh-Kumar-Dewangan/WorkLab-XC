import type { Metadata } from 'next';
import { FeaturesPage } from '@/components/site/pages/FeaturesPage';

export const metadata: Metadata = {
  title: 'Features and how it works',
  description:
    'Spoken lessons, games, practice problems, mastery tracking, saved library and add-ons for your syllabus.',
  alternates: { canonical: '/features' },
};
export default function Page() {
  return <FeaturesPage />;
}
