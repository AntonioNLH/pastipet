// Pastipet: funciona sin conexión. Sube el número de versión cada vez que actualices index.html.
const VERSION = 'pastipet-v4';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './badge-96.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // La app: primero internet (para recibir actualizaciones), si no hay, la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Íconos, tipografías y demás: la copia guardada y, si no está, internet.
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req, { ignoreSearch: url.origin === location.origin }).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); }
      return r;
    })));
  }
});
// Toque en un aviso: «Marcar como dada», «En 15 min» o abrir la app.
self.addEventListener('notificationclick', e => {
  const n = e.notification, d = n.data || {}, act = e.action || 'open';
  n.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const msg = { type: 'dose', action: act, key: d.key || '', date: d.date || '' };
    if (wins.length) {
      const w = wins.find(c => c.visibilityState === 'visible') || wins[0];
      w.postMessage(msg);
      if (act !== 'later' && 'focus' in w) { try { await w.focus(); } catch (err) {} }
      return;
    }
    const url = new URL('./', self.registration.scope);
    url.searchParams.set('tab', 'today');
    if (d.key) { url.searchParams.set('act', act); url.searchParams.set('key', d.key); url.searchParams.set('d', d.date || ''); }
    return self.clients.openWindow(url.href);
  })());
});
