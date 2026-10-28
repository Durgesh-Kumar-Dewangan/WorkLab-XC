import { LogoMark } from './Logo';

const TIPS = ['Finish a topic to unlock the next one.', 'Press 1, 2 or 3 in the classroom to jump the camera.', 'Your courses are saved to your account, on any device.', 'Zoom in on the board with the + button.'];

/**
 * The page-level loading state: the logo inside a turning ring, a shimmering bar, and a tip that changes. It is pure CSS, so
 * it also works before any script has loaded.
 */
export function LoadingScreen({ label = 'Loading', fill = true }: { label?: string; fill?: boolean }) {
  return (
    <div className={fill ? 'ld ld-fill' : 'ld'} role="status" aria-live="polite">
      <div className="ld-orb" aria-hidden="true">
        <i className="ld-ring" />
        <i className="ld-ring two" />
        <span className="ld-logo">
          <LogoMark size={26} />
        </span>
      </div>
      <p className="ld-label">{label}</p>
      <div className="ld-bar" aria-hidden="true">
        <i />
      </div>
      <p className="ld-tips" aria-hidden="true">
        {TIPS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </p>
    </div>
  );
}

/** Grey shapes in the layout of a typical workspace page, shown while its data arrives. */
export function PageSkeleton() {
  return (
    <div className="page sk" role="status" aria-live="polite" aria-label="Loading">
      <div className="sk-line w40 tall" />
      <div className="sk-line w70" />
      <div className="sk-row">
        <div className="sk-card" />
        <div className="sk-card" />
        <div className="sk-card" />
      </div>
      <div className="sk-card wide" />
      <div className="sk-line w55" />
      <div className="sk-line w80" />
    </div>
  );
}
