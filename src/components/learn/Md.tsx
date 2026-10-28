'use client';

import { Fragment } from 'react';

/** **bold**, `code` and *italic* inside one line of text. */
function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={m.index}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={m.index}>{t.slice(1, -1)}</code>);
    else out.push(<em key={m.index}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

const CALLOUT = /^(tip|note|remember|warning|careful)\s*:\s*/i;

/** Study notes, laid out to be read: clear headings, tidy lists, worked examples set apart and warnings called out. */
export function Md({ md }: { md: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let mistakes = false;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    const items = list.items;
    blocks.push(
      <Tag key={`l${blocks.length}`} className={mistakes ? 'md-mistakes' : 'md-list'}>
        {items.map((x, i) => (
          <li key={i}>{inline(x)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  md.split('\n').forEach((raw) => {
    const l = raw.trim();
    if (!l) return flush();
    const bullet = l.match(/^[-*•]\s+(.*)/);
    const num = l.match(/^\d+[.)]\s+(.*)/);
    if (bullet || num) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      list = list ?? { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
      return;
    }
    flush();
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const text = h[2].replace(/\*\*/g, '');
      mistakes = /mistake|misconception|pitfall|watch out/i.test(text);
      const worked = /example|worked/i.test(text);
      const Tag = h[1].length <= 2 ? 'h3' : 'h4';
      blocks.push(
        <Tag key={blocks.length} className={worked ? 'md-h worked' : mistakes ? 'md-h warn' : 'md-h'}>
          {text}
        </Tag>,
      );
      return;
    }
    if (l.startsWith('>')) {
      blocks.push(
        <blockquote key={blocks.length} className="md-quote">
          {inline(l.replace(/^>\s?/, ''))}
        </blockquote>,
      );
      return;
    }
    const c = l.match(CALLOUT);
    if (c) {
      blocks.push(
        <p key={blocks.length} className="md-callout">
          <b>{c[1][0].toUpperCase() + c[1].slice(1).toLowerCase()}</b> {inline(l.replace(CALLOUT, ''))}
        </p>,
      );
      return;
    }
    if (/^[A-Za-z ]*[=≈<>≤≥][^.]{2,}$/.test(l) && l.length < 80 && /[=≈]/.test(l)) {
      blocks.push(
        <p key={blocks.length} className="md-formula">
          {l}
        </p>,
      );
      return;
    }
    blocks.push(
      <p key={blocks.length} className="md-p">
        {inline(l)}
      </p>,
    );
  });
  flush();
  return (
    <div className="md">
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
