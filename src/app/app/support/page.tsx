import type { Metadata } from 'next';
import { SupportPage } from '@/components/app/pages/SupportPage';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };
export default function Page() {
  return <SupportPage />;
}
