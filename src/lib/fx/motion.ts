import { clamp, prefersReducedMotion } from '../util';

export const motionOK = () => !prefersReducedMotion();

export function countUp(el: HTMLElement, ms: number) {
  const n = el.firstChild;
  if (!n || n.nodeType !== 3) return;
  const m = /^(\d+(?:\.\d+)?)(%?)(\s*)$/.exec(n.nodeValue ?? '');
  if (!m) return;
  const end = parseFloat(m[1]);
  const dec = (m[1].split('.')[1] || '').length;
  const suf = m[2] + m[3];
  if (end === 0) return;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = clamp((now - t0) / ms, 0, 1);
    const e = 1 - Math.pow(1 - k, 4);
    n.nodeValue = (end * e).toFixed(dec) + suf;
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
    else n.nodeValue = m[1] + suf;
  };
  n.nodeValue = (0).toFixed(dec) + suf;
  requestAnimationFrame(step);
}

/** Staggered entrance, count-ups and bar growth for the direct children of a `.page` element. */
export function enhanceMotion(root: ParentNode) {
  if (!motionOK()) return;
  const page = root.querySelector<HTMLElement>('.page');
  if (!page) return;
  const grids = '.g2,.g3,.g4,.g21';
  const items: HTMLElement[] = [];
  Array.from(page.children).forEach((c) => {
    if (c.matches(grids)) items.push(...(Array.from(c.children) as HTMLElement[]));
    else items.push(c as HTMLElement);
  });
  items.slice(0, 16).forEach((el, i) => {
    el.style.setProperty('--i', String(i));
    el.classList.add('rv');
  });
  page
    .querySelectorAll<HTMLElement>('.stat .v')
    .forEach((v, i) => setTimeout(() => countUp(v, 900), 120 + i * 70));
  page.querySelectorAll<HTMLElement>('.bar > i').forEach((b, i) => {
    const w = b.style.width;
    b.style.transition = 'none';
    b.style.width = '0%';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        b.style.transition = '';
        b.style.transitionDelay = `${120 + i * 35}ms`;
        b.style.width = w;
        setTimeout(() => (b.style.transitionDelay = ''), 1400);
      }),
    );
  });
}

/** Pointer-follow glow on cards. Returns a cleanup function. */
export function installCardSpotlight(): () => void {
  let raf = 0;
  const onMove = (e: PointerEvent) => {
    if (raf || e.pointerType === 'touch') return;
    const c = (e.target as Element | null)?.closest?.('.card,.course-card,.stat') as HTMLElement | null;
    if (!c) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  return () => document.removeEventListener('pointermove', onMove);
}
