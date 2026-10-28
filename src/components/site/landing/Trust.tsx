import { Icon } from '@/components/ui/Icon';

const ITEMS: [string, string][] = [
  ['file-text', 'Text, Markdown, PDF and Word syllabi'],
  ['graph', 'Topic map'],
  ['cube', '3D lesson room'],
  ['flask', 'Practice questions'],
  ['target', 'Progress with reasons'],
  ['msg', 'Tutor chat'],
];

const Row = ({ hidden }: { hidden?: boolean }) => (
  <ul className="trust-row" aria-hidden={hidden || undefined}>
    {ITEMS.map(([ic, t]) => (
      <li key={t}>
        <Icon name={ic} size={15} />
        <span>{t}</span>
      </li>
    ))}
  </ul>
);

export function Trust() {
  return (
    <section className="trust" aria-label="What WorkLab XC works with">
      <div className="wrap">
        <span className="label">Works with what you already have</span>
      </div>
      <div className="trust-marq">
        <div className="trust-track">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
