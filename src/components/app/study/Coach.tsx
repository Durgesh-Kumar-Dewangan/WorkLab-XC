'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api } from '@/lib/api/client';
import { canListen, canSpeak, hush, listen, say } from '@/lib/speech';
import { useApp } from '@/lib/store';
import { apiErr } from './util';

function useTopic(cid: string) {
  const course = useApp((s) => s.courses.find((c) => c.id === cid));
  const [tid, setTid] = useState('');
  useEffect(() => setTid(''), [cid]);
  return { course, tid, setTid };
}

/** A microphone button that fills a text box with what you say. */
function Mic({ value, onText }: { value: string; onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const stop = useRef<() => void>(() => undefined);
  const base = useRef('');
  useEffect(() => () => stop.current(), []);
  if (!canListen()) return null;
  return (
    <button
      type="button"
      className={`btn xs${on ? ' solid' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Stop listening' : 'Speak your answer'}
      onClick={() => {
        if (on) return stop.current();
        base.current = value ? value + ' ' : '';
        setOn(true);
        stop.current = listen(
          (t) => onText(base.current + t),
          () => setOn(false),
        );
      }}
    >
      <Icon name="mic" size={15} /> {on ? 'Listening…' : 'Speak'}
    </button>
  );
}

const picker = (course: ReturnType<typeof useTopic>['course'], tid: string, setTid: (s: string) => void) => (
  <select className="select" aria-label="Topic" value={tid} onChange={(e) => setTid(e.target.value)}>
    <option value="">The topic I am weakest at</option>
    {course?.order.map((id) => (
      <option key={id} value={id}>
        {course.topics[id]?.title}
      </option>
    ))}
  </select>
);

/* ---------------------------------------------------------------- teach it back */
interface Turn {
  role: 'you' | 'student';
  text: string;
}
interface Verdict {
  score: number;
  covered: string[];
  missing: string[];
  wrong: string[];
}

export function Teach({ cid }: { cid: string }) {
  const { course, tid, setTid } = useTopic(cid);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [voice, setVoice] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [turns]);
  useEffect(() => hush, []);

  const call = async (history: Turn[], finish = false) => {
    setBusy(true);
    try {
      const r = await api<Verdict & { reply: string; title: string; topicId: string; done: boolean }>('/study/teachback', {
        body: { courseId: cid, topicId: tid || undefined, history, finish },
      });
      setTopic(r.title);
      if (!tid) setTid(r.topicId);
      const next = [...history, { role: 'student' as const, text: r.reply }];
      setTurns(next);
      if (voice) say(r.reply);
      if (r.done) setVerdict({ score: r.score, covered: r.covered, missing: r.missing, wrong: r.wrong });
    } catch (e) {
      apiErr(e);
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setVerdict(null);
    setTurns([]);
    await call([]);
  };
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    const h = [...turns, { role: 'you' as const, text: t }];
    setTurns(h);
    await call(h);
  };

  return (
    <section className="card st-chat">
      <h2 className="h3">Teach it back</h2>
      <p className="small">You are the teacher. An AI student asks questions about what you leave out or get wrong. At the end you get a score, and the gaps go on your weak-spot map.</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {picker(course, tid, setTid)}
        <button className="btn solid" type="button" disabled={busy} onClick={() => void start()}>
          {turns.length ? 'Start again' : 'Start'}
        </button>
        {canSpeak() ? (
          <label className="small row" style={{ gap: 6 }}>
            <input type="checkbox" checked={voice} onChange={(e) => (setVoice(e.target.checked), hush())} /> Read the student aloud
          </label>
        ) : null}
      </div>
      {turns.length ? (
        <div className="st-msgs" aria-live="polite">
          {topic ? <div className="small">Topic: {topic}</div> : null}
          {turns.map((m, i) => (
            <p key={i} className={`st-msg ${m.role}`}>
              <b>{m.role === 'you' ? 'You' : 'Student'}</b>
              {m.text}
            </p>
          ))}
          {busy ? <p className="st-msg student"><Spinner size={14} /></p> : null}
          <div ref={end} />
        </div>
      ) : null}
      {turns.length && !verdict ? (
        <div className="st-compose">
          <textarea className="textarea" rows={3} maxLength={1500} placeholder="Explain it in your own words…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <Mic value={text} onText={setText} />
            <span className="grow" />
            <button className="btn xs" type="button" disabled={busy || !turns.some((t) => t.role === 'you')} onClick={() => void call(turns, true)}>
              Finish and score
            </button>
            <button className="btn solid" type="button" disabled={busy || !text.trim()} onClick={() => void send()}>
              Send
            </button>
          </div>
        </div>
      ) : null}
      {verdict ? (
        <div className="st-verdict">
          <div className="st-score">{verdict.score}</div>
          <div>
            <b>Your explanation scored {verdict.score} out of 100</b>
            {verdict.covered.length ? <p className="small">Explained well: {verdict.covered.join('; ')}.</p> : null}
            {verdict.missing.length ? <p className="small">Still missing: {verdict.missing.join('; ')}.</p> : null}
            {verdict.wrong.length ? <p className="small">Not quite right: {verdict.wrong.join('; ')}.</p> : null}
            <p className="small">These gaps are now on your weak-spot map.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- spoken viva */
interface Round {
  q: string;
  a: string;
  score: number;
  comment: string;
  model: string;
}

export function Viva({ cid }: { cid: string }) {
  const { course, tid, setTid } = useTopic(cid);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [speak, setSpeak] = useState(canSpeak());
  useEffect(() => hush, []);

  const ask = async (question: string, answer: string) => {
    setBusy(true);
    try {
      const r = await api<{ title: string; topicId: string; next: string; feedback: { score: number; comment: string; model: string } | null }>('/study/viva', {
        body: { courseId: cid, topicId: tid || undefined, question, answer },
      });
      setTitle(r.title);
      if (!tid) setTid(r.topicId);
      if (r.feedback) setRounds((cur) => [{ q: question, a: answer, ...r.feedback! }, ...cur]);
      setQ(r.next);
      setText('');
      if (speak) say(r.next);
    } catch (e) {
      apiErr(e);
    } finally {
      setBusy(false);
    }
  };
  const avg = rounds.length ? (rounds.reduce((s, r) => s + r.score, 0) / rounds.length).toFixed(1) : null;

  return (
    <section className="card st-chat">
      <h2 className="h3">Viva practice</h2>
      <p className="small">An examiner asks short oral questions. Answer by speaking or typing. Each answer is scored out of 10, and weak answers become cards.</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {picker(course, tid, setTid)}
        <button className="btn solid" type="button" disabled={busy} onClick={() => void ask('', '')}>
          {q ? 'New question' : 'Start'}
        </button>
        {canSpeak() ? (
          <label className="small row" style={{ gap: 6 }}>
            <input type="checkbox" checked={speak} onChange={(e) => (setSpeak(e.target.checked), hush())} /> Read questions aloud
          </label>
        ) : null}
      </div>
      {q ? (
        <div className="st-q">
          <div className="small">{title}</div>
          <p className="st-front">{q}</p>
          {canSpeak() ? (
            <button className="btn xs" type="button" onClick={() => say(q)}>
              <Icon name="vol" size={14} /> Hear it again
            </button>
          ) : null}
          <textarea className="textarea" rows={3} maxLength={1500} placeholder="Your answer…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <Mic value={text} onText={setText} />
            <span className="grow" />
            <button className="btn solid" type="button" disabled={busy || text.trim().length < 3} onClick={() => void ask(q, text.trim())}>
              {busy ? <Spinner size={14} /> : null} Answer
            </button>
          </div>
        </div>
      ) : null}
      {rounds.length ? (
        <>
          <p className="small">
            <b>{rounds.length}</b> answered · average <b>{avg}</b> out of 10
          </p>
          <ul className="st-list2">
            {rounds.map((r, i) => (
              <li key={i} className="st-round">
                <span className={`st-sc s${r.score >= 7 ? 'g' : r.score >= 5 ? 'm' : 'b'}`}>{r.score}</span>
                <span className="grow">
                  <b>{r.q}</b>
                  <br />
                  <span className="small">
                    You: {r.a}
                    <br />
                    {r.comment} {r.score < 7 ? `Better: ${r.model}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
