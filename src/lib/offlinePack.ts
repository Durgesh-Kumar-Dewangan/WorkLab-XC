/** The offline study pack: saved in this browser's IndexedDB, and exportable as one self-contained HTML file. */

export interface PackTopic {
  id: string;
  title: string;
  material: string;
  notes: string;
  drill: { prompt: string; options: string[]; answer: number; why: string }[];
}
export interface Pack {
  courseId: string;
  courseTitle: string;
  generated: number;
  topics: PackTopic[];
  cards: { id: string; front: string; back: string; title: string }[];
  plan: { daysLeft: number; examDate: string; days: { date: string; items: { title: string; kind: string }[] }[] } | null;
}

const DB = 'wlxc-offline';
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('packs');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export async function savePack(p: Pack): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('packs', 'readwrite');
    tx.objectStore('packs').put(p, p.courseId);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadPack(courseId: string): Promise<Pack | null> {
  try {
    const db = await open();
    return await new Promise<Pack | null>((res, rej) => {
      const r = db.transaction('packs').objectStore('packs').get(courseId);
      r.onsuccess = () => res((r.result as Pack) ?? null);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One HTML file with the notes, the drill questions and the cards. It needs no network and no account. */
export function packToHtml(p: Pack): string {
  const topics = p.topics
    .map(
      (t) => `<section><h2>${esc(t.title)}</h2><pre>${esc(t.material)}</pre>${t.notes ? `<h3>Notes</h3><pre>${esc(t.notes)}</pre>` : ''}${
        t.drill.length
          ? `<h3>Practice</h3>${t.drill.map((d, i) => `<details><summary>${i + 1}. ${esc(d.prompt)}</summary><ol type="A">${d.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol><p><b>Answer: ${'ABCD'[d.answer] ?? ''}.</b> ${esc(d.why || '')}</p></details>`).join('')}`
          : ''
      }</section>`,
    )
    .join('');
  const cards = p.cards.length ? `<section><h2>Cards to review</h2>${p.cards.map((c) => `<details><summary>${esc(c.front)}</summary><p>${esc(c.back)}</p></details>`).join('')}</section>` : '';
  const plan = p.plan ? `<section><h2>Plan to ${esc(p.plan.examDate)}</h2>${p.plan.days.map((d) => `<p><b>${esc(d.date)}</b>: ${d.items.map((i) => esc(i.title)).join(', ') || 'rest'}</p>`).join('')}</section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.courseTitle)}: study pack</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1a1a22}h1{font-size:26px}section{border:1px solid #ddd;border-radius:14px;padding:6px 18px 14px;margin:16px 0}pre{white-space:pre-wrap;font:inherit}summary{cursor:pointer;font-weight:600;margin:8px 0}</style></head><body><h1>${esc(p.courseTitle)}</h1><p>Study pack made ${new Date(p.generated).toLocaleString()}. It works without a connection.</p>${plan}${topics}${cards}</body></html>`;
}

export function downloadText(name: string, text: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
