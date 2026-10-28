import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContactPage } from '@/components/site/pages/ContactPage';

export const metadata: Metadata = {
  title: 'Talk to us',
  description: 'Ask a question, report a problem or book a support session with the WorkLab XC team.',
  alternates: { canonical: '/contact' },
};
export default function Page() {
  return (
    <Suspense>
      <ContactPage />
    </Suspense>
  );
}
