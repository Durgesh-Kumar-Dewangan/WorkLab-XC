import Link from 'next/link';
import { PageShell } from '@/components/site/PageShell';

const FEATURES: [string, string][] = [
  ['Syllabus to topics', 'Upload a file, review the units and topics we found, fix anything, then learn.'],
  ['Live screen and boards', 'Every slide has a spoken script. The boards explain it and show the question. Works on any device, with or without 3D.'],
  ['Topic game', 'True or false, put-in-order and matching rounds, checked on the server.'],
  [
    'Worked and practice problems',
    'Numerical answers are checked with sensible tolerance; hints first, full solution when you ask.',
  ],
  ['Knowledge map and mastery', 'See how topics depend on each other, and what to study next.'],
  [
    'Full answers for a unit',
    'One click writes model exam answers for the whole unit. Each version is saved and downloadable.',
  ],
  [
    'Notes by marks (add-on)',
    'Tell us how many marks each topic carries; get notes sized to match. Per unit or monthly.',
  ],
  ['Ask the class (add-on)', 'A chat that answers from your lesson and points to the slide it used.'],
  ['Saved lessons', 'Every lesson you study is saved to your account by topic, so it opens instantly next time and on any device.'],
  ['Learner profile', 'Optional public profile, follows and leaderboard, all off until you switch them on.'],
];
export function FeaturesPage() {
  return (
    <PageShell
      label="Features"
      title="Everything for one topic, in one place."
      lead="From syllabus to spoken lesson, game, practice and revision."
    >
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li aria-current="page">Features</li>
        </ol>
      </nav>
      <ul className="feat-grid" style={{ listStyle: 'none', padding: 0 }}>
        {FEATURES.map(([t, d]) => (
          <li key={t} className="card">
            <h2 className="h3">{t}</h2>
            <p className="body">{d}</p>
          </li>
        ))}
      </ul>
      <div className="row wrap-r" style={{ gap: 8, marginTop: 24 }}>
        <Link className="btn solid lg" href="/register">
          Start free
        </Link>
        <Link className="btn lg" href="/pricing">
          Plans and prices
        </Link>
      </div>
    </PageShell>
  );
}
