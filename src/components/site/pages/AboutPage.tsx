import Link from 'next/link';
import { PageShell } from '@/components/site/PageShell';

const STEPS: [string, string][] = [
  [
    'Upload a syllabus',
    'Add a PDF, Word file or text. We split it into units and topics and you review the result before anything is written.',
  ],
  [
    'Learn a topic',
    'Each slide runs on the classroom screen with a script and voice, and the boards explain it in words and show the question. You can read along, change speed, or use slides only.',
  ],
  ['Play and practise', 'A short game and worked problems with answer checking help the topic stick.'],
  [
    'See your progress',
    'Mastery grows as you answer. We suggest what to study next, and revisit topics you may be forgetting.',
  ],
  [
    'Keep everything',
    'Lessons, games, notes and pictures are saved by topic, so you never pay twice for the same thing.',
  ],
];
export function AboutPage() {
  return (
    <PageShell
      label="About"
      title="A study partner that works from your syllabus."
      lead="WorkLab XC turns the syllabus you actually have into lessons you can read, play with and practise, one topic at a time."
    >
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li aria-current="page">About</li>
        </ol>
      </nav>
      <section aria-labelledby="ab-how">
        <h2 className="h2" id="ab-how">
          How it works
        </h2>
        <ol className="feat-grid" style={{ listStyle: 'none', padding: 0 }}>
          {STEPS.map(([t, d], i) => (
            <li key={t} className="card">
              <span className="label">Step {i + 1}</span>
              <h3 className="h3">{t}</h3>
              <p className="body">{d}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="ab-who" style={{ marginTop: 32 }}>
        <h2 className="h2" id="ab-who">
          Who it is for
        </h2>
        <p className="body" style={{ maxWidth: '65ch' }}>
          School students on NCERT, CBSE, ICSE or a state board; college students; and people preparing for
          JEE, NEET, UPSC or GATE. It is free to try, with unlimited learning sessions for one subject, and paid plans
          give you ten topics a day.
        </p>
        <div className="row wrap-r" style={{ gap: 8, marginTop: 12 }}>
          <Link className="btn solid lg" href="/register">
            Create a free account
          </Link>
          <Link className="btn lg" href="/pricing">
            See plans
          </Link>
          <Link className="btn lg" href="/contact">
            Contact us
          </Link>
        </div>
      </section>
      <section aria-labelledby="ab-honest" style={{ marginTop: 32 }}>
        <h2 className="h2" id="ab-honest">
          Honest about AI
        </h2>
        <p className="body" style={{ maxWidth: '65ch' }}>
          Lessons are written by AI and can contain mistakes. We label what is new, saved or reused, and we
          explain the limits in the <Link href="/ai-use">AI use notice</Link>. Mastery figures are study
          estimates, not grades.
        </p>
      </section>
    </PageShell>
  );
}
