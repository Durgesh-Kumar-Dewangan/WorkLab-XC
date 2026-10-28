import type { Metadata } from 'next';
import { Hero } from '@/components/site/landing/Hero';
import { QuickSteps } from '@/components/site/landing/QuickSteps';
import { Trust } from '@/components/site/landing/Trust';
import { Problem } from '@/components/site/landing/Problem';
import { Statement } from '@/components/site/landing/Statement';
import { How } from '@/components/site/landing/How';
import { Sheet } from '@/components/site/landing/Sheet';
import { Journey } from '@/components/site/landing/Journey';
import { UseCases } from '@/components/site/landing/UseCases';
import { Bento, Cta, ContactSection, Faq, PricingTeaser } from '@/components/site/landing/Sections';
export const metadata: Metadata = {
  title: 'Everything WorkLab XC does',
  description: 'The full tour: syllabus upload, AI lessons, the 3D classroom, practice rounds, exams, plans and answers to common questions.',
  alternates: { canonical: '/explore' },
};

export default function ExplorePage() {
  return (
    <div className="landing">
      <Hero />
      <QuickSteps />
      <Trust />
      <Problem />
      <Statement />
      <How />
      <Sheet />
      <Journey />
      <UseCases />
      <Bento />
      <PricingTeaser />
      <ContactSection />
      <Faq />
      <Cta />
    </div>
  );
}
