import type { Metadata } from 'next';
import { DevConsole } from '@/components/app/pages/DevConsole';

export const metadata: Metadata = { title: 'Developer console', robots: { index: false } };
export default function Page() {
  return <DevConsole />;
}
