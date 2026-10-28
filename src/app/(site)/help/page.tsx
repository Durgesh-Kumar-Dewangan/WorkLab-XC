import type { Metadata } from 'next';
import { HelpPage } from '@/components/site/pages/HelpPage';
import { FAQ } from '@/lib/faq';

export const metadata: Metadata = {
  title: 'Help centre',
  description: 'Answers about uploading a syllabus, lessons, the 3D classroom, plans and payments, support and privacy.',
  alternates: { canonical: '/help' },
};
/** The questions are also published as FAQ structured data, so search engines can show them as answers. */
const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.flatMap((g) => g.items).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <HelpPage />
    </>
  );
}
