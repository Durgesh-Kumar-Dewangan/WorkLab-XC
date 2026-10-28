'use client';

import { useState } from 'react';
import clsx from 'clsx';

const W = 116;
const H = 34;
type N = [x: number, y: number, label: string, cls: string];
const NODES: Record<string, N> = {
  vel: [8, 16, 'Velocity', 'ok'],
  acc: [172, 16, 'Acceleration', 'ok'],
  frc: [8, 160, 'Force', 'weak'],
  n2: [172, 88, 'Newton’s 2nd law', ''],
  fri: [336, 16, 'Friction', ''],
  wrk: [336, 160, 'Work', 'inf'],
};
const EDGES: [string, string, string][] = [
  ['vel', 'acc', 'requires'],
  ['acc', 'n2', 'requires'],
  ['frc', 'n2', 'requires'],
  ['n2', 'fri', 'applies to'],
  ['n2', 'wrk', 'inferred'],
];
const INFO: Record<string, string> = {
  vel: 'Velocity · part of Unit 1 · stated on page 2 · mastery strong',
  acc: 'Acceleration · requires Velocity · stated on page 2 · mastery strong',
  frc: 'Force · part of Unit 2 · stated on page 4 · mastery weak, revise first',
  n2: 'Newton’s second law · requires Acceleration and Force · stated on page 4',
  fri: 'Friction · applies Newton’s second law · stated on page 5',
  wrk: 'Work · linked to Newton’s second law · inferred, awaiting your review',
};

const ctr = (k: string): [number, number] => [NODES[k][0] + W / 2, NODES[k][1] + H / 2];

export function MiniGraph() {
  const [cur, setCur] = useState('n2');
  return (
    <>
      <div>
        <h3>How topics connect</h3>
        <p>Tap a topic. Dashed lines are our guesses.</p>
        <div style={{ marginTop: 14 }}>
          <p className="mg-cap" aria-live="polite">
            {INFO[cur]}
          </p>
        </div>
        <ul className="mg-leg">
          <li>
            <i className="ok" />
            Strong
          </li>
          <li>
            <i className="weak" />
            Revise first
          </li>
          <li>
            <i className="inf" />
            Inferred link
          </li>
        </ul>
      </div>
      <div className="mg-box">
        <svg
          className="minigraph"
          viewBox="0 0 460 212"
          role="group"
          aria-label="Knowledge graph of six physics topics"
        >
          <defs>
            <marker
              id="mg-a"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="mg-ah" />
            </marker>
            <marker
              id="mg-ai"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="mg-ah inf" />
            </marker>
          </defs>
          {EDGES.map(([a, b, l]) => {
            const [x1, y1] = ctr(a);
            const [x2, y2] = ctr(b);
            const dx = x2 - x1,
              dy = y2 - y1;
            const d = Math.hypot(dx, dy),
              ux = dx / d,
              uy = dy / d;
            const s = Math.min(
              Math.abs(ux) > 1e-3 ? (W / 2 + 3) / Math.abs(ux) : 1e9,
              Math.abs(uy) > 1e-3 ? (H / 2 + 3) / Math.abs(uy) : 1e9,
            );
            const inf = l === 'inferred';
            return (
              <g key={a + b}>
                <line
                  className={clsx('e', inf && 'inf')}
                  x1={x1 + ux * s}
                  y1={y1 + uy * s}
                  x2={x2 - ux * s}
                  y2={y2 - uy * s}
                  markerEnd={inf ? 'url(#mg-ai)' : 'url(#mg-a)'}
                />
                <title>{l}</title>
              </g>
            );
          })}
          {Object.entries(NODES).map(([k, n]) => (
            <g
              key={k}
              className={clsx('vn', n[3], cur === k && 'sel')}
              tabIndex={0}
              role="button"
              aria-label={n[2] + (cur === k ? ', selected' : '')}
              transform={`translate(${n[0]},${n[1]})`}
              onClick={() => setCur(k)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCur(k);
                }
              }}
            >
              <rect width={W} height={H} rx={17} />
              <text x={W / 2} y={H / 2 + 4.5} textAnchor="middle">
                {n[2]}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}
