'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { LimitNotice } from '@/components/app/LimitNotice';
import { ApiFail, api } from '@/lib/api/client';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

/** A compact tutor chat for the topic being studied, answered from that topic's lesson. */
export function AskTab({ title, courseId, topicId }: { title: string; courseId: string; topicId: string }) {
  const [hist, setHist] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiFail | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api<{ messages: Msg[] }>(`/learn/chat?title=${encodeURIComponent(title)}`)
      .then((r) => alive && setHist(r.messages))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [title]);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hist.length, busy]);

  const ask = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    setErr(null);
    setBusy(true);
    setHist((h) => [...h, { role: 'user', text: q }]);
    try {
      const r = await api<{ answer: string }>('/learn/chat', { body: { title, question: q } });
      setHist((h) => [...h, { role: 'assistant', text: r.answer }]);
    } catch (e) {
      setHist((h) => h.slice(0, -1));
      setText(q);
      setErr(e as ApiFail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cr-ask">
      <div className="cr-asklog" ref={log} role="log" aria-live="polite" aria-label="Conversation with the tutor">
        {hist.length ? (
          hist.map((m, i) => (
            <div key={i} className={`cr-msg ${m.role === 'user' ? 'me' : 'bot'}`}>
              {m.text}
            </div>
          ))
        ) : (
          <p className="small">{`Ask anything about “${title}”. The tutor answers from this topic’s lesson.`}</p>
        )}
        {busy ? <div className="cr-msg bot">…</div> : null}
      </div>
      {err ? (
        err.code === 'lesson_missing' ? (
          <p className="small bad">Open the lesson view for this topic once so the tutor has something to answer from.</p>
        ) : (
          <LimitNotice error={err} />
        )
      ) : null}
      <div className="cr-askbox">
        <textarea
          className="textarea"
          rows={2}
          maxLength={500}
          placeholder="Ask about this topic…"
          aria-label="Question for the tutor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <button className="btn solid sm" type="button" disabled={busy} onClick={() => void ask()}>
          <Icon name="send" size={14} />
          Ask
        </button>
      </div>
      <Link href={`/app/tutor?course=${courseId}&topic=${topicId}`} className="small" style={{ textDecoration: 'underline' }}>
        Open the full tutor
      </Link>
    </div>
  );
}
