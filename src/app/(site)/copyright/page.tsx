import type { Metadata } from 'next';
import { Legal, LEGAL_META } from '@/components/site/pages/Legal';

export const metadata: Metadata = { ...LEGAL_META.copyright, alternates: { canonical: '/copyright' } };
export default function Page() {
  return <Legal kind="copyright" />;
}
