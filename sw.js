// Pastipet: funciona sin conexión. Sube el número de versión cada vez que actualices index.html.
const VERSION = 'pastipet-v5.3';
const CFG_CACHE = 'pastipet-cfg'; // datos del servidor de avisos y acciones pendientes (no se borra al actualizar)
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './badge-96.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== CFG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
// Aviso que llega desde el servidor (funciona con la app cerrada)
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = {}, step = 'leer';
    try { d = e.data ? e.data.json() : {}; } catch (err) { try { d = { title: 'Pastipet', body: e.data ? e.data.text() : '' }; } catch (er2) {} }
    const dose = !!d.key, android = /Android/i.test((self.navigator && self.navigator.userAgent) || '');
    const title = d.title || 'Pastipet', base = { body: d.body || '', tag: dose ? 'dose-' + d.key : 'pastipet', icon: 'icon-192.png', data: { key: d.key || '', date: d.date || '' } };
    let ok = false, err = '';
    try {
      step = 'mostrar';
      await self.registration.showNotification(title, android
        ? { ...base, badge: 'badge-96.png', renotify: true, vibrate: [200, 100, 200], requireInteraction: dose, actions: dose ? [{ action: 'give', title: 'Marcar como dada' }, { action: 'later', title: 'En 15 min' }] : [] }
        : base);
      ok = true;
    } catch (err1) {
      err = String(err1 && err1.message || err1).slice(0, 120);
      try { await self.registration.showNotification(title, { body: d.body || '' }); ok = true; } catch (err2) {}
    }
    try { await tellServer('/ack', { ok, err, step, kind: d.kind || '', ua: ((self.navigator && self.navigator.userAgent) || '').slice(0, 90) }); } catch (er3) {}
  })());
});

async function cfg() {
  try { const r = await (await caches.open(CFG_CACHE)).match('cfg'); return r ? await r.json() : {}; } catch (err) { return {}; }
}
async function queueAct(a) {
  try {
    const c = await caches.open(CFG_CACHE), r = await c.match('acts');
    const list = r ? await r.json() : []; list.push(a);
    await c.put('acts', new Response(JSON.stringify(list.slice(-50))));
  } catch (err) {}
}
async function tellServer(path, body) {
  const c = await cfg(); if (!c.url || !c.id) return;
  try { await fetch(c.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, ...body }) }); } catch (err) {}
}

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
      if (d.key && act === 'give') await tellServer('/done', { key: d.key, date: d.date });
      if (d.key && act === 'later') await tellServer('/snooze', { key: d.key, date: d.date, at: Date.now() + 15 * 60000, title: n.title, body: n.body });
      if (act !== 'give' && act !== 'later' && 'focus' in w) { try { await w.focus(); } catch (err) {} }
      return;
    }
    // App cerrada: se anota sin abrirla y se avisa al servidor
    if (d.key && act === 'give') { await queueAct(msg); await tellServer('/done', { key: d.key, date: d.date }); return; }
    if (d.key && act === 'later') {
      const at = Date.now() + 15 * 60000;
      await queueAct({ ...msg, until: at });
      await tellServer('/snooze', { key: d.key, date: d.date, at, title: n.title, body: n.body });
      return;
    }
    const url = new URL('./', self.registration.scope);
    url.searchParams.set('tab', 'today');
    return self.clients.openWindow(url.href);
  })());
});
