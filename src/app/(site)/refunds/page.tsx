import type { Metadata } from 'next';
import { Legal, LEGAL_META } from '@/components/site/pages/Legal';

export const metadata: Metadata = { ...LEGAL_META.refunds, alternates: { canonical: '/refunds' } };
export default function Page() {
  return <Legal kind="refunds" />;
}
