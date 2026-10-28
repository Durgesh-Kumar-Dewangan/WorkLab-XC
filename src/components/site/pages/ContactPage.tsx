'use client';

import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/site/PageShell';
import { ContactForm } from '@/components/site/landing/ContactForm';

export function ContactPage() {
  const topic = useSearchParams().get('topic') ?? '';
  return (
    <PageShell
      label="Talk to us"
      title="Tell us the course you would try first."
      lead="A short note is enough. In a live product this would reach a person within a day."
    >
      <div className="ct-card pp-ct">
        <ContactForm key={topic} prefill={['learner', 'classroom'].includes(topic) ? topic : topic === 'beta' ? 'learner' : 'student'} />
      </div>
    </PageShell>
  );
}
