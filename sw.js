// 앱 셸 캐시. 파일 변경 시 VERSION을 올리면 구버전 캐시가 삭제된다.
const VERSION = 'esd-v0.9.0';
const ASSETS = [
  './', './index.html', './manifest.json',
  './src/style.css', './src/main.js', './src/engine.js', './src/data.js', './src/sprites.js',
  './icons/icon.svg',
  './assets/goblin.png',
  './assets/goblin_archer.png',
  './assets/goblin_armored.png',
  './assets/goblin_captain.png',
  './assets/goblin_cook.png',
  './assets/goblin_fighter.png',
  './assets/goblin_frozen.png',
  './assets/goblin_gasmask.png',
  './assets/goblin_giant.png',
  './assets/goblin_giant_walk.png',
  './assets/goblin_mage.png',
  './assets/goblin_normal.png',
  './assets/goblin_rider.png',
  './assets/goblin_shaman.png',
  './assets/goblin_smart.png',
  './assets/item_catalyst.png',
  './assets/slime_C.png',
  './assets/slime_CO2.png',
  './assets/slime_Cl.png',
  './assets/slime_ELEC.png',
  './assets/slime_FIRE.png',
  './assets/slime_FROST.png',
  './assets/slime_FUSION.png',
  './assets/slime_Fe.png',
  './assets/slime_Fe2O3.png',
  './assets/slime_H.png',
  './assets/slime_H2O.png',
  './assets/slime_H2SO4.png',
  './assets/slime_He.png',
  './assets/slime_MIASMA.png',
  './assets/slime_MUD.png',
  './assets/slime_N.png',
  './assets/slime_NH3.png',
  './assets/slime_Na.png',
  './assets/slime_NaCl.png',
  './assets/slime_O.png',
  './assets/slime_PLASMA.png',
  './assets/slime_S.png',
  './assets/slime_SHOCK.png',
  './assets/slime_STEAM.png',
  './assets/slime_STORM.png',
  './assets/slime_U.png',
  './assets/slime_WATER.png',
  './assets/slime_mega.png',
  './assets/slime_mix.png',
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
