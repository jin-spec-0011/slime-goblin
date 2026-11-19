// 도트(픽셀아트) 스프라이트: 문자 격자 → 오프스크린 캔버스 캐시 → 정수배 확대(스무딩 OFF)
const SLIME = [
  '......oooo......',
  '....oohbbboo....',
  '...ohwwbbbbbo...',
  '..ohwwhbbbbbbo..',
  '..ohhbbbbbbbbo..',
  '.obhbbbbbbbbbbo.',
  '.obbbbbbbbbbbbo.',
  '.obbbbbbbbbbbbo.',
  'obbbbbbbbbbbbbso',
  'obsbbbbbbbbbbsso',
  'osssssssssssssso',
  '.oooooooooooooo.',
];
// 참고 이미지 기준 고블린: 큰 뾰족 귀, 화난 눈썹, 주황 눈, 송곳니, 3단 녹색 음영, 빨간 허리천
// 20x24 (위 4줄은 모자/왕관용 여백)
const GOBLIN_BASE = [
  '....................',
  '....................',
  '....................',
  '....................',
  '......KKKKKKKK......',
  '.....KGLLGGGGGK.....',
  '....KGLGGGGGGGGK....',
  'KK.KGGGGGGGGGGGGK.KK',
  'KLKKGDDGGGGGGDDGKKLK',
  '.KLGGYYPGGGGPYYGGLK.',
  '..KDGYYGGGGGGYYGDK..',
  '...KGGGGGDDGGGGGK...',
  '...KGMWMMMMMMWMGK...',
  '....KGMMWMMWMMGK....',
  '.....KDGGGGGGDK.....',
  '...KKGGGLLGGGGGKK...',
  '..KGGKGGLGGGGGKGGK..',
  '..KGGKGGGGGGGGKGGK..',
  '..KGGKBBBBBBBBKGGK..',
  '..KDDKRRRRRRRRKDDK..',
  '...KK.RRrRRrRR.KK...',
  '.....KGGKRRKGGK.....',
  '.....KGGK..KGGK.....',
  '....KKKKK..KKKKK....',
];
// 종류별 장비 오버레이: [행, 20자 문자열] ('.'은 투명)
const GEAR = {
  normal: [],
  fighter: [ // 철 투구 + 검
    [3, '......KKKKKKKK......'], [4, '.....KSSSSSSSSK.....'], [5, '....KSsSSSSSSsSK....'], [6, '....KKKKKKKKKKKK....'],
    [12, '..................S.'], [13, '..................S.'], [14, '..................S.'], [15, '..................S.'],
    [16, '..................S.'], [17, '.................BBB'], [18, '..................B.'],
  ],
  mage: [ // 보라 고깔모자 + 지팡이
    [0, '..........K.........'], [1, '.........KVK........'], [2, '........KVVvK.......'], [3, '.......KVVVVvK......'],
    [4, '...KKKKVVVVVVvKKKK..'], [5, '...KVVVVVVVVVVVVVK..'],
    [11, '.Y..................'], [12, '.B..................'], [13, '.B..................'], [14, '.B..................'],
    [15, '.B..................'], [16, '.B..................'], [17, '.B..................'], [18, '.B..................'],
  ],
  rider: [ // 가죽 모자 + 깃털 + 창
    [2, '.............f......'], [3, '......KKKKKKKf......'], [4, '.....KBBBBBBBBK.....'], [5, '....KBBbBBBBBBbK....'],
    [3, '..................S.'], [4, '.................SSS'], [5, '..................B.'], [6, '..................B.'],
    [7, '..................B.'], [8, '..................B.'], [9, '..................B.'], [10, '..................B.'],
    [11, '..................B.'], [12, '..................B.'], [13, '..................B.'], [14, '..................B.'],
  ],
  archer: [ // 초록 두건 + 활
    [3, '......KKKKKKKK......'], [4, '.....KHHHHHHHHK.....'], [5, '....KHHhHHHHHHhHK...'], [6, '....KHK........KHK..'],
    [12, '.B..................'], [13, 'B.w.................'], [14, 'B.w.................'], [15, 'B.w.................'],
    [16, 'B.w.................'], [17, 'B.w.................'], [18, '.B..................'],
  ],
  captain: [ // 금 왕관 + 망토 어깨
    [1, '......Y..YY..Y......'], [2, '......YY.YY.YY......'], [3, '......YYYYYYYY......'], [4, '......YOYYYYOY......'],
    [15, '..CC............CC..'], [16, '.C................C.'], [17, '.C................C.'], [18, '.C................C.'],
  ],
  giant: [ // 뼈 몽둥이
    [10, '.................bb.'], [11, '................bbbb'], [12, '.................bb.'], [13, '.................bb.'],
    [14, '.................bb.'], [15, '.................bb.'], [16, '.................bb.'],
  ],
  smart: [ // 안경 + 책
    [9, '....KccK....KccK....'], [10, '....KccKKKKKKccK....'],
    [17, 'PPP.................'], [18, 'PwP.................'], [19, 'PPP.................'],
  ],
};


function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c, f) { // f<0 어둡게, f>0 밝게
  const [r, g, b] = hex(c);
  const m = v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

const cache = new Map();
function bake(rows, pal) {
  const w = rows[0].length, h = rows.length;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const col = pal[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  });
  return cv;
}

export function slimeSprite(color, color2) {
  const key = `s|${color}|${color2 || ''}`;
  if (!cache.has(key)) {
    const pal = { o: shade(color, -0.65), b: color, s: shade(color2 || color, -0.3), h: shade(color, 0.35), w: '#ffffff' };
    cache.set(key, bake(SLIME, pal));
  }
  return cache.get(key);
}

const SKIN = {
  normal: { K: '#16220e', D: '#3f7a2a', G: '#5fae3a', L: '#8fd65a' },
  giant:  { K: '#1e1a0c', D: '#4d5a2a', G: '#6f7d3a', L: '#93a052' },
  frozen: { K: '#10304a', D: '#4f9cc9', G: '#8fd3f2', L: '#d4f3ff' },
};
const COMMON = {
  Y: '#ffb02e', P: '#3a1a00', W: '#f4f0d8', M: '#4a0e0e', R: '#c0392b', r: '#7a1f1a', B: '#6b4423', b: '#efe6cc',
  S: '#c9d1dc', s: '#7d8796', V: '#7d3cc9', v: '#4b1f80', f: '#ffd34d', H: '#2f6b4f', h: '#1f4a36',
  O: '#c45a00', C: '#a01818', c: '#bfe9ff', w: '#f4f0d8',
};
export function goblinSprite(type, frozen = false) {
  const key = `g|${type}|${frozen}`;
  if (!cache.has(key)) {
    const rows = GOBLIN_BASE.slice();
    for (const [r, line] of GEAR[type] || []) {
      rows[r] = [...rows[r]].map((ch, i) => (line[i] && line[i] !== '.' ? line[i] : ch)).join('');
    }
    const skin = frozen ? SKIN.frozen : type === 'giant' ? SKIN.giant : SKIN.normal;
    cache.set(key, bake(rows, { ...COMMON, ...skin }));
  }
  return cache.get(key);
}

// 목표 크기 이하의 최대 정수배로 그린다 (도트 선명도 유지). 반환: 실제 그려진 {x,y,w,h}
export function drawSprite(ctx, spr, cx, bottom, maxW, maxH) {
  const raw = Math.min(maxW / spr.width, maxH / spr.height);
  const k = raw >= 2 ? Math.floor(raw) : Math.max(1, Math.floor(raw * 2) / 2);
  const w = spr.width * k, h = spr.height * k;
  const x = Math.round(cx - w / 2), y = Math.round(bottom - h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, x, y, w, h);
  return { x, y, w, h };
}

// ---------- 참고 이미지에서 잘라낸 스프라이트 (assets/*.png) ----------
// 로드 전이거나 실패하면 위의 도트 격자 스프라이트로 대체한다.
const IMG = {};
export const ASSET_NAMES = [
  'goblin', 'goblin_frozen', 'goblin_normal', 'goblin_fighter', 'goblin_mage', 'goblin_rider',
  'goblin_archer', 'goblin_captain', 'goblin_giant', 'goblin_smart', 'slime_mega', 'slime_mix', 'slime_H2O', 'slime_NH3', 'slime_NaCl',
  'slime_O', 'slime_H', 'slime_C', 'slime_N', 'slime_He', 'slime_Fe', 'slime_Na', 'slime_Cl', 'slime_S', 'slime_U',
];
export function loadAssets(base = 'assets/') {
  return Promise.all(ASSET_NAMES.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; res(true); };
    im.onerror = () => { console.warn('스프라이트 로드 실패', n); res(false); };
    im.src = `${base}${n}.png`;
  })));
}

function fit(ctx, img, cx, bottom, maxW, maxH) {
  const k = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * k, h = img.height * k, x = Math.round(cx - w / 2), y = Math.round(bottom - h);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h);
  return { x, y, w, h };
}

// 반환: { rect, label } — label이 있으면 호출측이 이름표를 덧그린다(이미지에 글자가 없는 경우)
export function drawSlimeArt(ctx, sl, cx, bottom, maxW, maxH) {
  let img = null, label = null;
  if (sl.kind === 'mega') { img = IMG.slime_mega; label = sl.label; }
  else if (sl.kind === 'element') img = IMG['slime_' + sl.key];
  else if (sl.kind === 'mixture') { img = IMG.slime_mix; label = sl.label; }
  else if (IMG['slime_' + sl.key]) img = IMG['slime_' + sl.key];
  else { img = IMG['slime_' + sl.els[0]]; label = sl.label; }
  if (!img) {
    const rect = drawSprite(ctx, slimeSprite(sl.color, sl.color2), cx, bottom, maxW, maxH * 0.85);
    return { rect, label: sl.label };
  }
  return { rect: fit(ctx, img, cx, bottom, maxW, maxH), label };
}

// 빙결: 종류별 이미지에 얼음색을 덧입힌 사본을 캐시
const frozenCache = new Map();
function frozenOf(img, key) {
  if (!frozenCache.has(key)) {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(120,205,255,0.6)'; c.fillRect(0, 0, cv.width, cv.height);
    frozenCache.set(key, cv);
  }
  return frozenCache.get(key);
}

export function drawGoblinArt(ctx, type, frozen, cx, bottom, size) {
  const base = IMG['goblin_' + type] || IMG.goblin;
  if (!base) return drawSprite(ctx, goblinSprite(type, frozen), cx, bottom, size, size);
  const img = frozen ? frozenOf(base, type) : base;
  return fit(ctx, img, cx, bottom, size, size);
}
