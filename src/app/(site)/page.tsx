import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/site/JsonLd';
import { HomeRedirect } from '@/components/site/HomeRedirect';

export const metadata: Metadata = {
  title: { absolute: 'WorkLab XC: turn your syllabus into lessons in a 3D classroom' },
  description:
    'Upload your syllabus. WorkLab XC writes a lesson for every topic and teaches it in a 3D classroom with a screen, boards and quizzes. Free to start.',
  alternates: { canonical: '/' },
};

const STEPS: [string, string, string][] = [
  ['1', 'Upload your syllabus', 'A PDF, a photo or pasted text. Headings become topics.'],
  ['2', 'Get a lesson for every topic', 'Slides, notes and questions written from your own syllabus.'],
  [
    '3',
    'Learn it in a 3D classroom',
    'A screen and boards teach it. Then practise with timed quizzes.',
  ],
];

const FACTS = ['Free to start', 'Works on phone and laptop', 'Made from your syllabus, not a generic course'];

/** The short front page: what the product does, in one screen, with one way in and one way to see everything else. */
export default function HomePage() {
  return (
    <div className="mini">
      <JsonLd />
      <HomeRedirect />
      <section className="mini-hero" aria-labelledby="mini-h">
        <p className="mini-kicker">WorkLab XC</p>
        <h1 id="mini-h" className="mini-title">
          Upload your syllabus.
          <br />
          Learn it in a 3D classroom.
        </h1>
        <p className="mini-sub">
          WorkLab XC reads your syllabus, writes a lesson for every topic, and teaches it on a screen and
          boards in a 3D classroom, with quizzes to remember it.
        </p>
        <div className="mini-cta">
          <Link href="/register" className="btn solid lg">
            Start free
          </Link>
          <Link href="/demo" className="btn lg">
            Try a lesson first
          </Link>
        </div>
        <ul className="mini-facts" aria-label="Highlights">
          {FACTS.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section className="mini-steps" aria-label="How it works">
        <ol>
          {STEPS.map(([n, h, p]) => (
            <li key={n}>
              <span className="mini-n" aria-hidden="true">
                {n}
              </span>
              <h2>{h}</h2>
              <p>{p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mini-more" aria-label="See more">
        <Link href="/explore" className="mini-explore">
          <span>
            <b>See everything it does</b>
            <small>The 3D classroom, practice rounds, exams, plans and answers to common questions</small>
          </span>
          <i aria-hidden="true">→</i>
        </Link>
        <p className="mini-links">
          <Link href="/pricing">Pricing</Link> · <Link href="/features">Features</Link> ·{' '}
          <Link href="/help">Help</Link>
        </p>
      </section>
    </div>
  );
}
