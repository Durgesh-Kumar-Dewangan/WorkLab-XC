import type { Metadata } from 'next';
import { LiveMap } from '@/components/app/LiveMap';

export const metadata: Metadata = { title: 'Live map', robots: { index: false } };
export default function Page() {
  return <LiveMap />;
}
