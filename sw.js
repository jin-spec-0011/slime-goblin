// 앱 셸 캐시. 파일 변경 시 VERSION을 올리면 구버전 캐시가 삭제된다.
const VERSION = 'esd-v2.5.0';
const ASSETS = [
  './', './index.html', './manifest.json',
  './src/style.css', './src/main.js', './src/engine.js', './src/data.js', './src/meta.js', './src/sprites.js', './src/online.js', './src/notes.js',
  './icons/icon.svg',
  './assets/goblin_archer.png',
  './assets/goblin_armored.png',
  './assets/goblin_captain.png',
  './assets/goblin_cook.png',
  './assets/goblin_fighter.png',
  './assets/goblin_gasmask.png',
  './assets/goblin_giant.png',
  './assets/goblin_giant_walk.png',
  './assets/goblin_mage.png',
  './assets/goblin_normal.png',
  './assets/goblin_rider.png',
  './assets/goblin_shaman.png',
  './assets/goblin_smart.png',
  './assets/item_catalyst.png',
  './assets/slime_ACIDRAIN.png',
  './assets/slime_AURORA.png',
  './assets/slime_BLIZZARD.png',
  './assets/slime_C.png',
  './assets/slime_CH4.png',
  './assets/slime_CHUU.png',
  './assets/slime_CO2.png',
  './assets/slime_CON.png',
  './assets/slime_COOKER.png',
  './assets/slime_CRYO.png',
  './assets/slime_Cl.png',
  './assets/slime_ELEC.png',
  './assets/slime_FALLOUT.png',
  './assets/slime_FEFEFE.png',
  './assets/slime_FIRE.png',
  './assets/slime_FROST.png',
  './assets/slime_FROSTFIRE.png',
  './assets/slime_FUSION.png',
  './assets/slime_Fe.png',
  './assets/slime_Fe2O3.png',
  './assets/slime_FeS.png',
  './assets/slime_GAMMA.png',
  './assets/slime_H.png',
  './assets/slime_H2O.png',
  './assets/slime_H2O2.png',
  './assets/slime_H2SO4.png',
  './assets/slime_HCl.png',
  './assets/slime_HEAVYWATER.png',
  './assets/slime_HEHE.png',
  './assets/slime_HOHOHO.png',
  './assets/slime_HUSH.png',
  './assets/slime_He.png',
  './assets/slime_LAVA.png',
  './assets/slime_MAGNET.png',
  './assets/slime_MIASMA.png',
  './assets/slime_MUD.png',
  './assets/slime_MUTAGEN.png',
  './assets/slime_N.png',
  './assets/slime_NADIVE.png',
  './assets/slime_NANA.png',
  './assets/slime_NAPALM.png',
  './assets/slime_NEURO.png',
  './assets/slime_NH3.png',
  './assets/slime_NO2.png',
  './assets/slime_Na.png',
  './assets/slime_NaCl.png',
  './assets/slime_NaOH.png',
  './assets/slime_O.png',
  './assets/slime_ORE.png',
  './assets/slime_PERMAFROST.png',
  './assets/slime_PLASMA.png',
  './assets/slime_RAINSTORM.png',
  './assets/slime_S.png',
  './assets/slime_SANDSTORM.png',
  './assets/slime_SHOCK.png',
  './assets/slime_SO2.png',
  './assets/slime_SOS.png',
  './assets/slime_STEAM.png',
  './assets/slime_STORM.png',
  './assets/slime_SUN.png',
  './assets/slime_SWAMP.png',
  './assets/slime_THUNDER.png',
  './assets/slime_TOXICICE.png',
  './assets/slime_U.png',
  './assets/slime_UO2.png',
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
    // cache: 'no-cache' -> 브라우저 HTTP 캐시를 쓰지 않고 서버에 최신 여부를 확인 (배포 직후 구버전 파일 혼재 방지)
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
