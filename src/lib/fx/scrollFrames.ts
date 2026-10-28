import { clamp } from '../util';

interface Entry {
  fn: () => void;
  vis: boolean;
  gate: Element | null;
}

const subs = new Set<Entry>();
let queued = false;
let gateIO: IntersectionObserver | null = null;
const gateMap = new WeakMap<Element, Entry>();
let listening = false;

function runFrames() {
  queued = false;
  subs.forEach((en) => {
    if (!en.vis) return;
    try {
      en.fn();
    } catch (e) {
      console.error(e);
    }
  });
}
export function queueFrames() {
  if (!queued) {
    queued = true;
    requestAnimationFrame(runFrames);
  }
}

function ensureListeners() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('scroll', queueFrames, { passive: true });
  window.addEventListener('resize', queueFrames);
}

function gateWatch(el: Element, entry: Entry) {
  if (typeof IntersectionObserver === 'undefined') return;
  gateIO ??= new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        const en = gateMap.get(e.target);
        if (en) {
          en.vis = e.isIntersecting;
          if (e.isIntersecting) queueFrames();
        }
      }),
    { rootMargin: '120% 0px' },
  );
  gateMap.set(el, entry);
  gateIO.observe(el);
}

/** fn runs on scroll/resize once per animation frame. With a gate element it is skipped while that element is far off screen. */
export function onFrame(fn: () => void, gate?: Element | null): () => void {
  ensureListeners();
  const entry: Entry = { fn, vis: true, gate: gate ?? null };
  subs.add(entry);
  if (gate) gateWatch(gate, entry);
  try {
    fn();
  } catch (e) {
    console.error(e);
  }
  return () => {
    subs.delete(entry);
    if (gate && gateIO) gateIO.unobserve(gate);
  };
}

/** 0 when the top of el hits the bottom of the viewport, 1 when its bottom leaves the top. */
export function elProgress(el: Element, startOffset = 1, endOffset = 1): number {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const s = vh * startOffset;
  const e = -r.height * endOffset;
  return clamp((s - r.top) / (s - e), 0, 1);
}
