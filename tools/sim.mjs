import { createGame, step, placeFromQueue, getCell, slimeCount, makeMega, skipPrep, PATH } from '../src/engine.js';
import { CFG } from '../src/data.js';

// 단순 AI: 같은 원소에 겹치기 우선, 없으면 경로 앞쪽 기둥의 위층부터 배치
const WEAK = process.argv[3]==='weak';
function ai(s) {
  if (WEAK) { let g=0; while (s.queue.length && g++<60){ const x=Math.floor(s.rng()*5), y=Math.floor(s.rng()*5), z=Math.floor(s.rng()*CFG.D); if(!placeFromQueue(s,0,x,y,z).ok && g>20) s.queue.shift(); } return; }
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
  const s = createGame(seed);
  let t = 0;
  while (s.phase !== 'over' && s.phase !== 'won' && t++ < 3000) { ai(s); step(s); }
  if (s.phase === 'won') { wins++; hpLeft.push(s.baseHp); }
  reach[s.round]++;
}
console.log(`승률 ${wins}/${N}, 도달 라운드 분포`, reach.slice(1).join(','), '평균 잔여HP', hpLeft.length ? (hpLeft.reduce((a, b) => a + b) / hpLeft.length).toFixed(1) : '-');
