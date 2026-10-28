'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, uploadForm } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { apiErr } from './util';

/* ---------------------------------------------------------------- past papers */
interface Summary {
  papers: { id: string; name: string; count: number }[];
  topics: { id: string; title: string; count: number; marks: number; likelihood: number; example: string }[];
  verbs: { word: string; n: number }[];
}

export function Papers({ cid }: { cid: string }) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => api<Summary>(`/study/papers?courseId=${cid}`).then(setSum).catch(apiErr);
  useEffect(() => {
    api<Summary>(`/study/papers?courseId=${cid}`)
      .then(setSum)
      .catch(apiErr);
  }, [cid]);
  const analyse = async (f?: File) => {
    setBusy(true);
    try {
      if (f) {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('courseId', cid);
        fd.append('name', name || f.name);
        await uploadForm('/study/papers', fd, () => undefined);
      } else await api('/study/papers', { body: { courseId: cid, name: name || 'Pasted paper', text } });
      setText('');
      setName('');
      if (file.current) file.current.value = '';
      toast('Paper read. Your topics are ranked by exam likelihood.', 'ok');
      await refresh();
    } catch (e) {
      apiErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="card">
        <h2 className="h3">Past-paper intelligence</h2>
        <p className="small">Add old papers. The coach finds which topics repeat, how the marks are spread and the words examiners use, then ranks your weak spots by how likely they are to be asked.</p>
        <div className="st-form">
          <label className="field">
            <span className="label">Name (for example, 2024 final)</span>
            <input className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="label">Paste the questions</span>
            <textarea className="textarea" rows={5} maxLength={60000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button className="btn solid" type="button" disabled={busy || text.trim().length < 80} onClick={() => void analyse()}>
            {busy ? <Spinner size={14} /> : null} Read this paper
          </button>
          <label className="btn">
            <Icon name="upload" size={15} /> Upload a PDF, Word or text file
            <input ref={file} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={(e) => e.target.files?.[0] && void analyse(e.target.files[0])} />
          </label>
        </div>
      </section>
      {sum && sum.papers.length ? (
        <section className="card">
          <h2 className="h3">What the papers say</h2>
          <ul className="st-map">
            {sum.topics.map((t) => (
              <li key={t.id} style={{ ['--w' as string]: t.likelihood }}>
                <div className="st-mh">
                  <b>{t.title}</b>
                  <span className="small">
                    asked {t.count}×{t.marks ? ` · ${t.marks} marks` : ''}
                  </span>
                </div>
                <div className="st-bar">
                  <i style={{ width: `${Math.round(t.likelihood * 100)}%` }} />
                </div>
                {t.example ? <div className="small">“{t.example}”</div> : null}
              </li>
            ))}
          </ul>
          {sum.verbs.length ? (
            <p className="small">
              <b>Examiner’s words:</b> {sum.verbs.map((v) => `${v.word} (${v.n})`).join(', ')}
            </p>
          ) : null}
          <ul className="st-list2">
            {sum.papers.map((p) => (
              <li key={p.id}>
                <span className="grow">
                  <b>{p.name}</b> <em className="small">{p.count} questions</em>
                </span>
                <button
                  className="btn xs"
                  type="button"
                  onClick={async () => {
                    await api(`/study/papers/${p.id}`, { method: 'DELETE' }).catch(apiErr);
                    await refresh();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- photo to lesson or canvas */
interface Scanned {
  title: string;
  summary: string;
  sections: { heading: string; text: string }[];
  questions: { q: string; options: string[]; answer: number; why: string }[];
  cards: number;
  canvasId?: string;
}

export function Scan({ cid }: { cid: string }) {
  const [mode, setMode] = useState<'lesson' | 'canvas'>('lesson');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Scanned | null>(null);
  const [pct, setPct] = useState(0);
  const send = async (f: File) => {
    setBusy(true);
    setOut(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('mode', mode);
      fd.append('courseId', cid);
      setOut(await uploadForm<Scanned>('/study/scan', fd, (a, b) => setPct(Math.round((a / b) * 100))));
    } catch (e) {
      apiErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="card">
        <h2 className="h3">Photo to lesson</h2>
        <p className="small">Photograph a textbook page, a whiteboard or your handwritten notes. You get a summary, notes and five questions, or connected cards on a canvas.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Make">
            <button type="button" aria-pressed={mode === 'lesson'} onClick={() => setMode('lesson')}>
              Lesson card
            </button>
            <button type="button" aria-pressed={mode === 'canvas'} onClick={() => setMode('canvas')}>
              Canvas cards
            </button>
          </div>
          <label className="btn solid">
            {busy ? <Spinner size={14} /> : <Icon name="upload" size={15} />} {busy ? `Reading… ${pct < 100 ? pct + '%' : ''}` : 'Take or choose a photo'}
            <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])} />
          </label>
        </div>
      </section>
      {out ? (
        <section className="card">
          <h2 className="h3">{out.title}</h2>
          <p>{out.summary}</p>
          {out.sections.map((s) => (
            <p key={s.heading} className="small">
              <b>{s.heading}.</b> {s.text}
            </p>
          ))}
          {out.canvasId ? (
            <Link className="btn solid" href={`/app/canvas?c=${out.canvasId}`}>
              Open the canvas
            </Link>
          ) : null}
          {out.questions.length ? (
            <>
              <h3 className="h3" style={{ marginTop: 14 }}>
                Check yourself
              </h3>
              {out.questions.map((q, i) => (
                <details key={i} className="st-det">
                  <summary>
                    {i + 1}. {q.q}
                  </summary>
                  <ol type="A">
                    {q.options.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ol>
                  <p>
                    <b>Answer {'ABCD'[q.answer]}.</b> {q.why}
                  </p>
                </details>
              ))}
              <p className="small">{out.cards} cards were added to your review.</p>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
