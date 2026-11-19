// 앱 셸 캐시. 파일 변경 시 VERSION을 올리면 구버전 캐시가 삭제된다.
const VERSION = 'esd-v0.3.0';
const ASSETS = [
  './', './index.html', './manifest.json',
  './src/style.css', './src/main.js', './src/engine.js', './src/data.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 우선 → 실패 시 캐시 (오프라인 플레이 지원, 배포 즉시 반영)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
