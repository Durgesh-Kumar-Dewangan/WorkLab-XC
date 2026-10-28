import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmailView } from '@/components/auth/AccountLinkForms';

export const metadata: Metadata = { title: 'Confirm email', robots: { index: false } };
export default function Page() {
  return (
    <Suspense>
      <VerifyEmailView />
    </Suspense>
  );
}
