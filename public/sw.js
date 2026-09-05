const CACHE = 'tcpd-fine-web-v6-copy-fix';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/crimes.json',
  './data/groups.json',
  './data/buttons.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, fallbackUrl = null) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.hostname === 'raw.githubusercontent.com') return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/')) {
    const cleanRequest = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(async (res) => {
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(cleanRequest, res.clone());
          }
          return res;
        })
        .catch(() => caches.match(cleanRequest))
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  // JS/CSSは必ずネットワーク優先。更新後に古いコードへ張り付かないようにする。
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 画像など変更頻度の低いものだけキャッシュ優先。
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(req, res.clone());
      }
      return res;
    }))
  );
});
