import type { Metadata } from 'next';
import { GraphIndexPage } from '@/components/app/pages/GraphPage';

export const metadata: Metadata = { title: 'Knowledge graph' };
export default function Page() {
  return <GraphIndexPage />;
}
