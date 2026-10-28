import type { Metadata } from 'next';
import { PricingPage } from '@/components/site/pages/PricingPage';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Start free with unlimited learning sessions. Upgrade for the full 3D classroom, practice exams and no ads. Prices in rupees, monthly or yearly.',
  alternates: { canonical: '/pricing' },
};
export default function Page() {
  return <PricingPage />;
}
