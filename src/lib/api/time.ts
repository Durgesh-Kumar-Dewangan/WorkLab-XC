import { api } from './client';

let pending = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Study time is sent to the server in small batches, so it follows the learner to every device. */
export function queueMinutes(m: number): void {
  if (!(m > 0)) return;
  pending += m;
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    const send = Math.min(30, Math.round(pending * 10) / 10);
    pending = Math.max(0, pending - send);
    if (send > 0) void api('/learn/time', { body: { minutes: send } }).catch(() => undefined);
  }, 30_000);
}
