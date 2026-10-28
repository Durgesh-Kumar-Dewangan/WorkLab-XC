import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { PageShell } from '@/components/site/PageShell';
import { DEMO_TOPIC_ID, demoCourse, demoSyllabusText } from '@/lib/demo/course';

/** A public walk-through on a hand-written sample course. It needs no account, no server and no AI key. */
export function DemoPage() {
  const c = demoCourse();
  return (
    <PageShell
      label="See how it works"
      title="From a syllabus to a lesson, in three steps."
      lead="This walk-through uses a sample Physics 101 syllabus with hand-written lessons, so you can try it without an account."
    >
      <div className="callout">
        <Icon name="info" size={18} />
        <span>
          The course below is a sample. With an account you add your own syllabus and WorkLab XC writes a lesson for each of
          your topics.
        </span>
      </div>

      <h2 className="h2" style={{ margin: '40px 0 14px' }}>
        1. A syllabus goes in
      </h2>
      <p className="body">Paste an outline or upload a file. Headings become units, and bullets become topics.</p>
      <pre className="code" style={{ maxHeight: 280, overflow: 'auto', marginTop: 14 }}>
        {demoSyllabusText()}
      </pre>

      <h2 className="h2" style={{ margin: '40px 0 14px' }}>
        2. It becomes a course map
      </h2>
      <p className="body">{`${c.order.length} topics in ${c.units.length} units, each with the topics it builds on.`}</p>
      <div className="g3" style={{ marginTop: 14 }}>
        {c.units.map((u) => (
          <div className="card" key={u.id}>
            <h3>{u.title}</h3>
            <ul className="bul sm">
              {u.topics.map((id) => (
                <li key={id}>{c.topics[id].title}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="h2" style={{ margin: '40px 0 14px' }}>
        3. Each topic gets a classroom
      </h2>
      <p className="body">
        A presentation screen runs the slides while two boards explain the idea in words and put the question to you. A live
        model lets you change the numbers and see what happens.
      </p>
      <div className="row wrap-r" style={{ marginTop: 18 }}>
        <Link href={`/demo/classroom/${DEMO_TOPIC_ID}`} className="btn solid lg">
          <Icon name="cube" size={16} />
          Open the sample classroom
        </Link>
        <Link href="/register" className="btn lg">
          Start with your own syllabus
        </Link>
      </div>
    </PageShell>
  );
}
