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
// 슬라임은 tools/gen_slimes.py가 생성(글자 없음, 원소 기호는 게임이 덧그림)
const SLIME_KEYS = ['FIRE', 'WATER', 'ELEC', 'O', 'H', 'C', 'N', 'Fe', 'He', 'Na', 'Cl', 'S', 'U',
  'STEAM', 'PLASMA', 'SHOCK', 'FROST', 'STORM', 'MUD', 'MIASMA', 'FUSION',
  'H2O', 'CO2', 'NaCl', 'NH3', 'Fe2O3', 'H2SO4', 'mix', 'mega'];
export const ASSET_NAMES = [
  'goblin', 'goblin_frozen', 'goblin_normal', 'goblin_fighter', 'goblin_mage', 'goblin_rider',
  'goblin_archer', 'goblin_captain', 'goblin_giant', 'goblin_smart', 'goblin_giant_walk',
  ...SLIME_KEYS.map(k => 'slime_' + k),
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
  const img = sl.kind === 'mega' ? IMG.slime_mega
    : sl.kind === 'mixture' ? IMG.slime_mix
    : IMG['slime_' + sl.key] || IMG['slime_' + sl.els[0]] || null;
  if (!img) {
    const rect = drawSprite(ctx, slimeSprite(sl.color, sl.color2), cx, bottom, maxW, maxH * 0.85);
    return { rect, label: sl.label };
  }
  // 생성 이미지에는 글자가 없으므로 항상 이름표(원소 기호/합성명)를 덧그린다
  return { rect: fit(ctx, img, cx, bottom, maxW, maxH), label: sl.label };
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

// 걷기 모션 시트: 가로로 이어 붙인 프레임 (종류 -> 프레임 수)
// n: 프레임 수, ms: 프레임당 시간 (영상 원본 24fps, 31프레임 주기를 16장으로 샘플링 -> 약 83ms)
const WALK = { giant: { n: 16, ms: 83 } };
const frameCache = new Map();
function walkFrame(type, i) {
  const sheet = IMG[`goblin_${type}_walk`]; if (!sheet) return null;
  const n = WALK[type].n, key = `${type}|${i % n}`;
  if (!frameCache.has(key)) {
    const fw = sheet.width / n, cv = document.createElement('canvas');
    cv.width = Math.round(fw); cv.height = sheet.height;
    cv.getContext('2d').drawImage(sheet, -Math.round((i % n) * fw), 0);
    frameCache.set(key, cv);
  }
  return frameCache.get(key);
}
export const walkFrames = type => (WALK[type] ? WALK[type].n : 0);
export const walkFrameMs = type => (WALK[type] ? WALK[type].ms : 100);

// opts: { frame: 걷기 프레임 번호(null이면 정지), flip: 좌우 반전 }
// 맞았을 때 붉은 번쩍임용 사본
const hitCache = new Map();
function hitOf(img, key) {
  if (!hitCache.has(key)) {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,60,60,0.55)'; c.fillRect(0, 0, cv.width, cv.height);
    hitCache.set(key, cv);
  }
  return hitCache.get(key);
}

// opts: frame(걷기 프레임), flip(좌우 반전), bob(위로 뜨는 px), tilt(라디안), squash(0~0.1 찌그러짐), dx(좌우 흔들림 px), hit(피격)
export function drawGoblinArt(ctx, type, frozen, cx, bottom, size, opts = {}) {
  let base = walkFrames(type) ? walkFrame(type, opts.frame ?? 0) : null;
  const key = base ? `${type}|f${(opts.frame ?? 0) % walkFrames(type)}` : type;
  if (!base) base = IMG['goblin_' + type] || IMG.goblin;
  if (!base) return drawSprite(ctx, goblinSprite(type, frozen), cx, bottom, size, size);
  const img = frozen ? frozenOf(base, key) : opts.hit ? hitOf(base, key) : base;
  const bob = opts.bob || 0, sq = opts.squash || 0, x = cx + (opts.dx || 0);
  const sx = (opts.flip ? -1 : 1) * (1 + sq * 0.6), sy = 1 - sq;
  ctx.save();
  ctx.translate(x, bottom - bob);           // 발밑을 기준점으로 변형 (찌그러져도 발은 바닥에)
  if (opts.tilt) ctx.rotate(opts.tilt);
  ctx.scale(sx, sy);
  const r = fit(ctx, img, 0, 0, size, size);
  ctx.restore();
  const w = r.w * Math.abs(sx), h = r.h * sy;
  return { x: x - w / 2, y: bottom - bob - h, w, h };
}
