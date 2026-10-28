import type { Metadata } from 'next';
import { GraphPage } from '@/components/app/pages/GraphPage';

export const metadata: Metadata = { title: 'Knowledge graph' };
export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return <GraphPage cid={cid} />;
}
