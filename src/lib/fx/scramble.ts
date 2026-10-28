import { clamp, prefersReducedMotion } from '../util';

/** Text that resolves from random glyphs. Returns a cancel function. */
export function scramble(el: HTMLElement, finalText: string, ms = 520): () => void {
  if (prefersReducedMotion()) {
    el.textContent = finalText;
    return () => {};
  }
  const glyphs = '!<>-_\\/[]{}=+*^?#abcdefxyz';
  const start = performance.now();
  const chars = finalText.split('');
  let raf = 0;
  const step = (now: number) => {
    const p = clamp((now - start) / ms, 0, 1);
    el.textContent = chars
      .map((c, i) =>
        c === ' ' ? ' ' : i / chars.length < p * 1.1 ? c : glyphs[Math.floor(Math.random() * glyphs.length)],
      )
      .join('');
    if (p < 1) raf = requestAnimationFrame(step);
    else el.textContent = finalText;
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
