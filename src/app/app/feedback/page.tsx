import type { Metadata } from 'next';
import { FeedbackPage } from '@/components/app/pages/FeedbackPage';

export const metadata: Metadata = { title: 'Feedback', robots: { index: false } };
export default function Page() {
  return <FeedbackPage />;
}
