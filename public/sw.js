/* A small cache for the Study pages and their scripts, so a pack downloaded on this device can be opened without a connection.
   Network first, so an online visit always gets the newest version. Nothing from /api is ever cached here. */
const NAME = 'wlxc-study-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const ok = u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/app/study') || /\.(woff2?|css|js|svg|png|ico)$/.test(u.pathname);
  if (!ok) return;
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(NAME).then((c) => c.put(r, copy));
        }
        return res;
      })
      .catch(() => caches.match(r).then((hit) => hit || Response.error())),
  );
});
