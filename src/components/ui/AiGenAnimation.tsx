'use client';

import { useEffect, useState } from 'react';

const STAGES = ['Reading your request', 'Planning the answer', 'Writing', 'Checking the details'];

/**
 * The waiting state while the AI writes: a thin ring that turns, a few lines that fill in as if text were arriving, and one
 * plain sentence that says what stage it is at. No characters, no colour beyond the page's own.
 */
export function AiGenAnimation({ title = 'Writing your lesson' }: { title?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % STAGES.length), 2600);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="aig" role="status" aria-live="polite" aria-label={title}>
      <svg className="aig-ring" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" className="aig-track" />
        <circle cx="24" cy="24" r="20" className="aig-arc" />
      </svg>
      <p className="aig-title">{title}</p>
      <div className="aig-lines" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="aig-stage" key={i}>
        {STAGES[i]}
      </p>
    </div>
  );
}
