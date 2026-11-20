import { createGame, step, placeFromQueue, moveSlime, getCell, slimeCount, makeMega, skipPrep, PATH } from '../src/engine.js';
import { CFG } from '../src/data.js';

// 단순 AI: 같은 원소에 겹치기 우선, 없으면 경로 앞쪽 기둥의 위층부터 배치
// 사용: node tools/sim.mjs <판수> [strong|weak] [챕터]
const WEAK = process.argv[3]==='weak';
const CHAPTER = +process.argv[4] || 1;
function ai(s) {
  if (WEAK) { let g=0; while (s.queue.length && g++<60){ const x=Math.floor(s.rng()*5), y=Math.floor(s.rng()*5), z=Math.floor(s.rng()*CFG.D); if(!placeFromQueue(s,0,x,y,z).ok && g>20) s.queue.shift(); } return; }
  // 0) 필드 정리: 같은 원소 슬라임을 경로 앞쪽 칸에 겹친다 (자동 랜덤 배치 대응)
  for (let changed = true, n = 0; changed && n < 30; n++) {
    changed = false;
    const cells = PATH.map(([x, y]) => ({ x, y, z: 0, sl: getCell(s, x, y, 0) })).filter(c => c.sl && c.sl.kind === 'element');
    outer: for (let i = 0; i < cells.length; i++) for (let j = cells.length - 1; j > i; j--) {
      const a = cells[i], b = cells[j];
      if (a.sl.key === b.sl.key && a.sl.lv + b.sl.lv <= 5) { if (moveSlime(s, b, a).ok) { changed = true; break outer; } }
    }
  }
  let guard = 0;
  while (s.queue.length && guard++ < 60) {
    const q = s.queue[0]; let done = false;
    // 1) 겹치기
    for (let z = 0; z < CFG.D && !done; z++) for (const [x, y] of PATH) {
      const c = getCell(s, x, y, z);
      if (c && c.kind === 'element' && c.key === q.sym && c.lv < CFG.MAX_LV) { done = placeFromQueue(s, 0, x, y, z).ok; if (done) break; }
    }
    if (!done) for (const [x, y] of PATH) {
      for (let z = 0; z < CFG.D && !done; z++) if (!getCell(s, x, y, z)) { done = placeFromQueue(s, 0, x, y, z).ok; }
      if (done) break;
    }
    if (!done) { s.queue.shift(); }
  }
  if (s.round >= CFG.MEGA_ROUND) {
    const by = {};
    for (let z = 0; z < CFG.D; z++) for (const [x, y] of PATH) { const c = getCell(s, x, y, z); if (c && c.kind === 'element' && c.lv === 5) (by[c.key] ||= []).push({ x, y, z }); }
    for (const k in by) if (by[k].length >= 3) makeMega(s, by[k].slice(0, 3));
  }
}

const N = +process.argv[2] || 30;
let wins = 0; const reach = Array(11).fill(0); const hpLeft = [];
for (let seed = 1; seed <= N; seed++) {
  const s = createGame(seed, { chapter: CHAPTER });
  let t = 0;
  while (s.phase !== 'over' && s.phase !== 'won' && t++ < 3000) { ai(s); step(s); }
  if (s.phase === 'won') { wins++; hpLeft.push(s.baseHp); }
  reach[s.round]++;
}
console.log(`[챕터 ${CHAPTER}] 승률 ${wins}/${N}, 도달 라운드 분포`, reach.slice(1).join(','), '평균 잔여HP', hpLeft.length ? (hpLeft.reduce((a, b) => a + b) / hpLeft.length).toFixed(1) : '-');
