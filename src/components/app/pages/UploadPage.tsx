'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { ApiFail } from '@/lib/api/client';
import { createCourse } from '@/lib/api/courses';
import { useServerMe } from '@/hooks/useServerMe';
import { useApp } from '@/lib/store';
import { useCourses } from '@/lib/store/hooks';
import { toast } from '@/lib/ui/toast';
import { ago } from '@/lib/util';

const MAX_UPLOAD = 5 * 1024 * 1024;
const ACCEPT = '.txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf';
const STEPS = ['Add source', 'Build the course', 'Open it'];

interface Source {
  name: string;
  input: { text: string } | { file: File };
}

function Stepper({ n }: { n: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((s, k) => (
        <li key={s} aria-current={k === n ? 'step' : undefined} className={k < n ? 'done' : ''}>
          <span>{k < n ? <Icon name="check" size={12} /> : String(k + 1)}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

export function UploadPage() {
  const router = useRouter();
  const { me } = useServerMe();
  const [src, setSrc] = useState<Source | null>(null);
  const [err, setErr] = useState('');
  const [up, setUp] = useState<{ sent: number; total: number } | null>(null);
  const [done, setDone] = useState(false);

  async function run(s: Source) {
    setErr('');
    setSrc(s);
    setUp(null);
    setDone(false);
    try {
      const course = await createCourse(s.input, (sent, total) => setUp({ sent, total }));
      setDone(true);
      const a = useApp.getState();
      a.addCourse(course, { name: s.name || course.title });
      a.logActivity('upload', `Added the course “${course.title}”`, `/app/courses/${course.id}`, course.id);
      a.notify(
        'system',
        `“${course.title}” is ready`,
        `${course.order.length} topics found. Open a topic to get its lesson. Prerequisite links are marked so you can confirm or remove them.`,
        `/app/courses/${course.id}/graph`,
      );
      toast(`Course created: ${course.title}`, 'ok');
      await new Promise((r) => setTimeout(r, 700)); // let the full bar be seen
      router.push(`/app/courses/${course.id}/graph`);
    } catch (e) {
      setSrc(null);
      setErr(e instanceof ApiFail ? e.message : 'The syllabus could not be read. Try again.');
    }
  }

  function takeFile(f: File) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['txt', 'md', 'markdown', 'pdf', 'docx'].includes(ext))
      return setErr(
        `“${f.name}” is a ${ext ? `.${ext}` : 'file without an extension'}. Use .txt, .md, .pdf or .docx.`,
      );
    if (f.size > MAX_UPLOAD) return setErr(`That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 5 MB.`);
    if (f.size === 0) return setErr('That file is empty.');
    void run({ name: f.name, input: { file: f } });
  }

  const head = (sub: string) => (
    <div className="ph">
      <div>
        <div className="label">Syllabus</div>
        <h1 style={{ marginTop: 8 }}>Upload a syllabus</h1>
        <p className="sub">{sub}</p>
      </div>
    </div>
  );

  if (src)
    return (
      <div className="page">
        {head(`Working on ${src.name || 'your pasted text'}.`)}
        <Stepper n={1} />
        <UploadProgress src={src} up={up} done={done} />
      </div>
    );

  return (
    <SourceStage
      head={head(
        'Add a text, Markdown, PDF or Word outline. It is read on the server and turned into a course you can study.',
      )}
      err={err}
      pdfDocx={me ? me.limits.pdfDocx : true}
      onFile={takeFile}
      onText={(text) => void run({ name: '', input: { text } })}
    />
  );
}

const PHASES = ['Uploading', 'Reading the syllabus', 'Building the course map', 'Ready'];

/** Moves toward `target` a little every moment, so the bar keeps creeping while the server works instead of sitting still. */
function useCreep(target: number, ceiling: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setV((x) => (x < target ? Math.min(target, x + Math.max(1, (target - x) / 6)) : Math.min(ceiling, x + 0.25))), 120);
    return () => clearInterval(t);
  }, [target, ceiling]);
  return v;
}

/**
 * The progress card shown while a syllabus is added: a file chip, a bar with a moving highlight, the percentage, and four
 * steps that tick off. For a file the first step is the real upload (bytes sent); the rest creep forward while the server
 * reads and builds the course, and the bar fills the moment the course arrives.
 */
function UploadProgress({ src, up, done }: { src: Source; up: { sent: number; total: number } | null; done: boolean }) {
  const isFile = 'file' in src.input;
  const size = isFile ? (src.input as { file: File }).file.size : new Blob([(src.input as { text: string }).text]).size;
  const uploadPct = !isFile ? 100 : up ? (up.sent / up.total) * 100 : 0;
  const uploaded = uploadPct >= 100;
  // 0-40% is the upload, 40-92% is the server working, then 100% when the course arrives
  const target = done ? 100 : uploaded ? 88 : 4 + uploadPct * 0.36;
  const creep = useCreep(target, uploaded ? 94 : 40);
  const pct = done ? 100 : Math.round(creep); // the bar fills the moment the course arrives
  const phase = done ? 3 : !uploaded ? 0 : pct < 62 ? 1 : 2;
  const kb = size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  return (
    <div className="card up" role="status" aria-live="polite">
      <div className="up-file">
        <span className="up-ic">
          <Icon name={isFile ? 'file-text' : 'edit'} size={20} />
        </span>
        <div className="up-meta">
          <b>{src.name || 'Pasted syllabus'}</b>
          <span>{kb}</span>
        </div>
        <span className="up-pct num">{pct}%</span>
      </div>
      <div className="up-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Adding your syllabus">
        <i style={{ width: `${pct}%` }} className={done ? 'done' : ''} />
      </div>
      <ol className="up-steps">
        {PHASES.map((p, k) => (
          <li key={p} className={k < phase || done ? 'ok' : k === phase ? 'now' : ''}>
            <span>{k < phase || done ? <Icon name="check" size={11} /> : k === phase ? <Spinner size={11} /> : ''}</span>
            {p}
          </li>
        ))}
      </ol>
      <p className="small">This usually takes a few seconds. Keep this page open.</p>
    </div>
  );
}

function SourceStage({
  head,
  err,
  pdfDocx,
  onFile,
  onText,
}: {
  head: React.ReactNode;
  err: string;
  pdfDocx: boolean;
  onFile: (f: File) => void;
  onText: (t: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [text, setText] = useState('');
  const [pasteErr, setPasteErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const courses = useCourses();

  const drag = (on: boolean) => (e: DragEvent) => {
    e.preventDefault();
    setOver(on);
  };

  return (
    <div className="page">
      {head}
      <Stepper n={0} />
      {err ? (
        <div className="callout warn" role="alert">
          <Icon name="alert" size={18} />
          <span>{err}</span>
        </div>
      ) : null}
      <div className="g21">
        <div
          className={clsx('drop', over && 'over')}
          tabIndex={0}
          role="button"
          aria-label="Choose a syllabus file or drop it here"
          onDragEnter={drag(true)}
          onDragOver={drag(true)}
          onDragLeave={drag(false)}
          onDrop={(e) => {
            drag(false)(e);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              file.current?.click();
            }
          }}
        >
          <Icon name="upload" size={28} />
          <div className="h3">Drop a syllabus here</div>
          <p className="small">
            or choose a file. Accepted: .txt, .md{pdfDocx ? ', .pdf and .docx' : ' (PDF and Word are part of the Learner plan)'}. Up to 5 MB.
          </p>
          <button className="btn solid" type="button" onClick={() => file.current?.click()}>
            Choose file
          </button>
          <input
            ref={file}
            type="file"
            accept={ACCEPT}
            className="sr"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="card">
          <h3>Or paste an outline</h3>
          <p className="small">
            Headings (#, Unit 1, Week 2) become units. Bullets or numbered lines become topics. “(p. 12)” becomes a
            page reference.
          </p>
          <textarea
            ref={ta}
            className="textarea"
            rows={9}
            placeholder={
              '# Course title\n\n## Unit 1: Foundations\n- First topic (p. 3)\n- Second topic\n\n## Unit 2: ...'
            }
            aria-label="Pasted syllabus text"
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row wrap-r">
            <button
              className="btn solid"
              type="button"
              onClick={() => {
                const v = text.trim();
                if (v.length < 20) {
                  setPasteErr('Paste a little more text. An outline needs at least a heading and a few topics.');
                  ta.current?.focus();
                  return;
                }
                setPasteErr('');
                onText(v);
              }}
            >
              Build course
            </button>
          </div>
          <div className="small bad" role="alert" hidden={!pasteErr}>
            {pasteErr}
          </div>
        </div>
      </div>

      {courses.length ? (
        <div className="card">
          <h3>Your courses</h3>
          <div className="list">
            {courses.slice(0, 6).map((c) => (
              <div className="li" key={c.id}>
                <div className="ico">
                  <Icon name="file-text" size={16} />
                </div>
                <div className="grow">
                  <div className="t">{c.title}</div>
                  <div className="s">{`${c.sourceName} · ${c.order.length} topics · ${ago(c.created)}`}</div>
                </div>
                <Link href={`/app/courses/${c.id}`} className="btn xs">
                  Open
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
