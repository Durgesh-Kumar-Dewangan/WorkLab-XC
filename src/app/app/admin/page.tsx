import type { Metadata } from 'next';
import { AdminHub } from '@/components/app/admin/AdminHub';

export const metadata: Metadata = { title: 'Admin', robots: { index: false } };
export default function Page() {
  return <AdminHub />;
}
