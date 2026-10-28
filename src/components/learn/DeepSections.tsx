'use client';

import type { Draft } from '@/lib/learn';
import { LessonDiagram } from './LessonDiagram';
import { Md } from './Md';

/** The in-depth parts of a lesson: built from zero, the words it uses, the usual mistakes, the diagrams and the notes. Nothing renders for a lesson that has none. */
export function DeepSections({ d, notes = true }: { d: Draft; notes?: boolean }) {
  const has = d.scratch?.length || d.glossary?.length || d.mistakes?.length || d.diagrams?.length;
  if (!has && !(notes && d.notes)) return null;
  return (
    <div className="ds">
      {d.scratch?.length ? (
        <section className="card ds-scratch" aria-label="Built from scratch">
          <h3>From scratch, step by step</h3>
          <ol>
            {d.scratch.map((s, i) => (
              <li key={i}>
                <span className="ds-n" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h4>{s.heading}</h4>
                  {s.body.split(/\n\n+/).map((p, k) => (
                    <p key={k}>{p}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {d.diagrams?.length ? (
        <section className="card" aria-label="Diagrams">
          <h3>See it</h3>
          <div className="ds-diagrams">
            {d.diagrams.map((g, i) => (
              <LessonDiagram key={i} d={g} />
            ))}
          </div>
        </section>
      ) : null}
      {d.glossary?.length ? (
        <section className="card" aria-label="Words to know">
          <h3>Words to know</h3>
          <dl className="ds-gloss">
            {d.glossary.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {d.mistakes?.length ? (
        <section className="card ds-mistakes" aria-label="Common mistakes">
          <h3>Common mistakes</h3>
          <ul>
            {d.mistakes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {notes && d.notes ? (
        <section className="card" aria-label="Study notes">
          <h3>Study notes</h3>
          <Md md={d.notes} />
        </section>
      ) : null}
    </div>
  );
}
