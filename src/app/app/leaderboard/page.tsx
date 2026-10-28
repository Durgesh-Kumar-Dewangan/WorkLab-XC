import type { Metadata } from 'next';
import { PlayPage } from '@/components/app/pages/PlayPage';

export const metadata: Metadata = { title: 'Leaderboard', robots: { index: false } };
export default function Page() {
  return <PlayPage />;
}
