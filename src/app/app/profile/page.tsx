import type { Metadata } from 'next';
import { ProfilePage } from '@/components/app/pages/ProfilePage';

export const metadata: Metadata = { title: 'Profile' };
export default function Page() {
  return <ProfilePage />;
}
