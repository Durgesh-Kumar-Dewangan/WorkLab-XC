import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Draft } from '@/lib/learn';
import { DeepSections } from './DeepSections';
import { LessonDiagram } from './LessonDiagram';
import { Md } from './Md';

const draft: Draft = {
  depth: 'deep',
  summary: 'Force makes things accelerate.',
  objectives: ['a', 'b'],
  notes: '## Worked example\n\nTake a 2 kg mass.\n\n- Step **one**: write F = m a\n- Step two\n\n## Common mistakes\n\n- Forgetting units\n\nTip: always draw the forces.',
  slides: [],
  questions: [],
  scratch: [{ heading: 'What is a force?', body: 'A force is a push or a pull.\n\nIt can change how something moves.' }],
  glossary: [{ term: 'Newton', meaning: 'The unit of force.' }],
  mistakes: ['Thinking heavier things always fall faster.'],
  diagrams: [
    { kind: 'flow', title: 'From force to motion', steps: [{ label: 'Force' }, { label: 'Acceleration', note: 'a = F / m' }] },
    { kind: 'plot', title: 'F against a', xLabel: 'a', yLabel: 'F', points: [[0, 0], [1, 2], [2, 4]] },
  ],
};

describe('in-depth lesson parts', () => {
  it('renders every part of a deep lesson', () => {
    const html = renderToStaticMarkup(<DeepSections d={draft} />);
    for (const t of ['From scratch', 'What is a force?', 'It can change how something moves.', 'Words to know', 'Newton', 'Common mistakes', 'See it', 'Study notes']) expect(html).toContain(t);
  });
  it('draws a plot as an accessible svg with its data', () => {
    const html = renderToStaticMarkup(<LessonDiagram d={draft.diagrams![1]} />);
    expect(html).toContain('<svg');
    expect(html).toContain('F against a');
    expect(html.match(/<circle/g)?.length).toBe(3);
  });
  it('lays notes out with headings, bold, lists and callouts', () => {
    const html = renderToStaticMarkup(<Md md={draft.notes} />);
    expect(html).toContain('<strong>one</strong>');
    expect(html).toContain('md-h worked');
    expect(html).toContain('md-mistakes');
    expect(html).toContain('md-callout');
  });
  it('shows nothing extra for a lesson that has none', () => {
    expect(renderToStaticMarkup(<DeepSections d={{ ...draft, scratch: undefined, glossary: undefined, mistakes: undefined, diagrams: undefined, notes: '' }} />)).toBe('');
  });
});
