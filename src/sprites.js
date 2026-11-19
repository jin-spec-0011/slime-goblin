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
const GOBLIN = [
  '...oooooooo...',
  'o.oggggggggo.o',
  'oggggggggggggo',
  '.ogwwggggwwgo.',
  '.ogwrggggrwgo.',
  '..oggggggggo..',
  '..oggttttggo..',
  '...oggggggo...',
  '..occccccccco.',
  '.ogocccccccogo',
  '.ogocccccccogo',
  '..occccccccco.',
  '...ogo...ogo..',
  '...ooo...ooo..',
];

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

export function goblinSprite(cloth) {
  const key = `g|${cloth}`;
  if (!cache.has(key)) {
    const pal = { o: '#18200f', g: '#6cbf4b', w: '#ffffff', r: '#d82020', t: '#f4f0d8', c: cloth };
    cache.set(key, bake(GOBLIN, pal));
  }
  return cache.get(key);
}

// 목표 크기 이하의 최대 정수배로 그린다 (도트 선명도 유지). 반환: 실제 그려진 {x,y,w,h}
export function drawSprite(ctx, spr, cx, bottom, maxW, maxH) {
  const k = Math.max(1, Math.floor(Math.min(maxW / spr.width, maxH / spr.height)));
  const w = spr.width * k, h = spr.height * k;
  const x = Math.round(cx - w / 2), y = Math.round(bottom - h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, x, y, w, h);
  return { x, y, w, h };
}
