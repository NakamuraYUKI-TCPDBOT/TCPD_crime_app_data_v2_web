const CACHE = 'tcpd-fine-web-v5-preset-fix';
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // GitHub上の最新版データはService Workerではキャッシュしない。
  if (url.hostname === 'raw.githubusercontent.com') return;
  if (url.origin !== self.location.origin) return;

  // data/*.json は app.js が毎回キャッシュ回避クエリを付けるため、
  // pathname単位に正規化してキャッシュが増え続けないようにする。
  if (url.pathname.includes('/data/')) {
    const cleanRequest = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(cleanRequest, copy));
          }
          return res;
        })
        .catch(() => caches.match(cleanRequest))
    );
    return;
  }

  // HTMLはネットワーク優先。オフライン時だけキャッシュへ。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // CSS/JS/画像はキャッシュ優先。新しいCACHE名なので更新直後から新ファイルになる。
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
