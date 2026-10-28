import type { Metadata } from 'next';
import { SavedPage } from '@/components/app/pages/SavedPage';

export const metadata: Metadata = { title: 'Saved' };
export default function Page() {
  return <SavedPage />;
}
