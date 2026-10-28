'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { EmptyWorkspace } from '@/components/app/EmptyWorkspace';
import { LimitNotice } from '@/components/app/LimitNotice';
import { useAddons, buyTutor } from '@/hooks/useAddons';
import { ApiFail, api } from '@/lib/api/client';
import { getCourse, topicTitle } from '@/lib/domain/courses';
import type { Course } from '@/lib/domain/types';
import { useApp } from '@/lib/store';
import { useCourses, useLearner } from '@/lib/store/hooks';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

export function TutorPage() {
  const cs = useCourses();
  const sp = useSearchParams();
  if (!cs.length)
    return (
      <div className="page">
        <div className="ph">
          <h1>AI tutor</h1>
        </div>
        <EmptyWorkspace />
      </div>
    );
  return <Tutor cs={cs} initialCourse={sp.get('course')} initialTopic={sp.get('topic')} />;
}

function Tutor({
  cs,
  initialCourse,
  initialTopic,
}: {
  cs: Course[];
  initialCourse: string | null;
  initialTopic: string | null;
}) {
  const d = useLearner();
  const addons = useAddons();
  const [cid, setCid] = useState(() => (cs.find((x) => x.id === initialCourse) ?? cs[0]).id);
  const c = cs.find((x) => x.id === cid) ?? cs[0];
  const lastTopic = useApp((s) => s.lastTopic);
  const setLastTopic = useApp((s) => s.setLastTopic);
  const pickTopic = (course: Course, preferred?: string | null) =>
    preferred && course.topics[preferred]
      ? preferred
      : lastTopic[course.id] && course.topics[lastTopic[course.id]]
        ? lastTopic[course.id]
        : course.order[0];
  const [tid, setTid] = useState(() => pickTopic(c, initialTopic));
  const title = c.topics[tid]?.title ?? '';
  const [hist, setHist] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiFail | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  // the conversation lives on the server, per topic
  useEffect(() => {
    let alive = true;
    setHist([]);
    setErr(null);
    if (title) {
      api<{ messages: Msg[] }>(`/learn/chat?title=${encodeURIComponent(title)}`)
        .then((r) => alive && setHist(r.messages))
        .catch((e) => alive && setErr(e as ApiFail));
    }
    return () => {
      alive = false;
    };
  }, [title]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hist.length, busy]);

  const ask = useCallback(
    async (raw: string) => {
      const t = raw.trim();
      if (!t || busy || !title) return;
      setText('');
      setErr(null);
      setBusy(true);
      setHist((h) => [...h, { role: 'user', text: t }]);
      try {
        const r = await api<{ answer: string }>('/learn/chat', { body: { title, question: t } });
        setHist((h) => [...h, { role: 'assistant', text: r.answer }]);
      } catch (e) {
        setHist((h) => h.slice(0, -1));
        setText(t);
        setErr(e as ApiFail);
      } finally {
        setBusy(false);
        ta.current?.focus();
      }
    },
    [busy, title],
  );

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Study helper</div>
          <h1 style={{ marginTop: 8 }}>
            AI tutor {addons.loaded && !addons.chatbot && addons.freeChatLeft === 0 ? <em className="navtag lg">Add-on</em> : null}
          </h1>
          <p className="sub">Ask about a topic and get an answer based on its lesson.</p>
        </div>
      </div>
      {addons.loaded && !addons.chatbot && addons.freeChatLeft > 0 ? (
        <p className="small">{`${addons.freeChatLeft} free ${addons.freeChatLeft === 1 ? 'question' : 'questions'} left this month. The AI tutor add-on removes the limit.`}</p>
      ) : null}
      {addons.loaded && !addons.chatbot && addons.freeChatLeft === 0 ? (
        <div className="callout">
          <Icon name="sparkles" size={18} />
          <div>
            <b>You have used this month’s free questions.</b>
            <p className="body" style={{ margin: '4px 0 8px' }}>
              Free accounts get two tutor questions a month, and they renew next month. The add-on lets you ask in any lesson, here or in the classroom, whenever you like.
            </p>
            <button className="btn solid sm" type="button" onClick={() => void buyTutor().catch(() => undefined)}>
              Get the add-on
            </button>
          </div>
        </div>
      ) : null}
      <div className="lesson-grid">
        <div className="card chat">
          <div className="chatlog" role="log" aria-live="polite" aria-label="Conversation with the tutor" ref={log}>
            {hist.map((m, mi) =>
              m.role === 'user' ? (
                <div className="msg me" key={mi}>
                  <div className="bub">{m.text}</div>
                </div>
              ) : (
                <div className="msg bot" key={mi}>
                  <div className="bub">
                    <div className="who">Tutor</div>
                    {m.text.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              ),
            )}
            {busy ? (
              <div className="msg bot">
                <div className="bub">
                  <span className="typing" aria-label="Tutor is typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            ) : null}
            {!hist.length && !busy ? (
              <div className="empty" style={{ border: 0, margin: 'auto' }}>
                <Icon name="msg" size={26} />
                <p className="body">{`Ask about “${topicTitle(d, c, tid)}”. The tutor answers from that topic’s lesson.`}</p>
              </div>
            ) : null}
          </div>
          {err ? (
            err.code === 'lesson_missing' ? (
              <div className="callout warn" role="alert">
                <Icon name="info" size={18} />
                <span>
                  Open the lesson for this topic first, so the tutor has something to answer from.{' '}
                  <Link href={`/app/courses/${c.id}/topics/${tid}`} style={{ textDecoration: 'underline' }}>
                    Open the lesson
                  </Link>
                </span>
              </div>
            ) : (
              <LimitNotice error={err} />
            )
          ) : null}
          <div className="composer">
            <textarea
              ref={ta}
              className="textarea"
              rows={2}
              placeholder="Ask about the selected topic…"
              aria-label="Message to the tutor"
              maxLength={500}
              style={{ minHeight: 52 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(text);
                }
              }}
            />
            <button className="btn solid" type="button" disabled={busy} onClick={() => void ask(text)}>
              <Icon name="send" size={15} />
              Send
            </button>
          </div>
        </div>

        <aside className="lesson-side">
          <div className="card">
            <h3>Context</h3>
            {cs.length > 1 ? (
              <div className="field">
                <label htmlFor="tcourse">Course</label>
                <select
                  id="tcourse"
                  className="select"
                  value={c.id}
                  onChange={(e) => {
                    const nc = getCourse(d, e.target.value);
                    if (!nc) return;
                    setCid(nc.id);
                    setTid(pickTopic(nc));
                  }}
                >
                  {cs.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="ttopic">Topic</label>
              <select
                id="ttopic"
                className="select"
                value={tid}
                onChange={(e) => {
                  setTid(e.target.value);
                  setLastTopic(c.id, e.target.value);
                }}
              >
                {c.order.map((id) => (
                  <option key={id} value={id}>
                    {topicTitle(d, c, id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="card">
            <h3>How it answers</h3>
            <p className="small">
              Answers come from the lesson written for the selected topic. AI can make mistakes, so check anything
              important against your textbook.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
