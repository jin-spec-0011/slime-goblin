import { createGame, step, placeFromQueue, moveSlime, getCell, slimeCount, makeMega, skipPrep, PATH } from '../src/engine.js';
import { CFG } from '../src/data.js';

// 단순 AI: 같은 원소에 겹치기 우선, 없으면 경로 앞쪽 칸부터 배치
// 사용: node tools/sim.mjs <판수> [strong|weak] [챕터] [--speed=3] [--apm=30]
//  게임 규칙은 틱 단위라 배속과 무관하다. 배속이 바꾸는 것은 '사람이 조작할 수 있는 실제 시간'이므로
//  사람의 분당 행동 수(APM)를 실제 시간 기준으로 제한해 배속 효과를 재현한다. --apm=0 이면 제한 없음.
const WEAK = process.argv[3]==='weak';
const CHAPTER = +process.argv[4] || 1;
const opt = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? +a.split('=')[1] : d; };
const SPEED = opt('speed', 3), APM = opt('apm', 30);
// 틱(게임 1초)당 행동 가능 횟수 = (APM/60) x 틱의 실제 시간(1초/배속)
const PER_TICK = APM > 0 ? (APM / 60) * (CFG.TICK_MS / 1000) / SPEED : Infinity;
const BANK_MAX = 3; // 쌓아둘 수 있는 행동 수 (사람은 행동을 무한히 모아두지 못함)
function act(s, fn) {
  if (s._bud < 1) return false;
  const r = fn(); if (r.ok) s._bud -= 1; return r.ok;
}
function ai(s, weak = WEAK) {
  s._bud = Math.min(PER_TICK === Infinity ? Infinity : BANK_MAX, (s._bud || 0) + PER_TICK);
  if (weak) { let g=0; while (s.queue.length && s._bud >= 1 && g++<60){ const x=Math.floor(s.rng()*5), y=Math.floor(s.rng()*5), z=Math.floor(s.rng()*CFG.D); if(!act(s, () => placeFromQueue(s,0,x,y,z)) && g>20) s.queue.shift(); } return; }
  // 0) 필드 정리: 같은 원소 슬라임을 경로 앞쪽 칸에 겹친다 (자동 랜덤 배치 대응)
  for (let changed = true, n = 0; changed && n < 30; n++) {
    changed = false;
    const cells = PATH.map(([x, y]) => ({ x, y, z: 0, sl: getCell(s, x, y, 0) })).filter(c => c.sl && c.sl.kind === 'element');
    outer: for (let i = 0; i < cells.length; i++) for (let j = cells.length - 1; j > i; j--) {
      const a = cells[i], b = cells[j];
      if (a.sl.key === b.sl.key && a.sl.lv + b.sl.lv <= 5) { if (act(s, () => moveSlime(s, b, a))) { changed = true; break outer; } }
    }
  }
  let guard = 0;
  while (s.queue.length && s._bud >= 1 && guard++ < 60) {
    const q = s.queue[0]; let done = false;
    // 1) 겹치기
    for (let z = 0; z < CFG.D && !done; z++) for (const [x, y] of PATH) {
      const c = getCell(s, x, y, z);
      if (c && c.kind === 'element' && c.key === q.sym && c.lv < CFG.MAX_LV) { done = act(s, () => placeFromQueue(s, 0, x, y, z)); if (done) break; }
    }
    if (!done) for (const [x, y] of PATH) {
      for (let z = 0; z < CFG.D && !done; z++) if (!getCell(s, x, y, z)) { done = act(s, () => placeFromQueue(s, 0, x, y, z)); }
      if (done) break;
    }
    if (!done) { if (s._bud < 1) break; s.queue.shift(); } // 행동 여유가 없으면 카드는 덱에 둔다
  }
  if (s.round >= CFG.MEGA_ROUND) {
    const by = {};
    for (let z = 0; z < CFG.D; z++) for (const [x, y] of PATH) { const c = getCell(s, x, y, z); if (c && c.kind === 'element' && c.lv === 5) (by[c.key] ||= []).push({ x, y, z }); }
    for (const k in by) if (by[k].length >= 3) act(s, () => makeMega(s, by[k].slice(0, 3)));
  }
}

// 한 묶음 실행 (튜닝 스크립트에서도 사용)
export function runBatch(n, chapter, weak) {
  let wins = 0, stalls = 0; const reach = Array(11).fill(0); const hpLeft = [];
  for (let seed = 1; seed <= n; seed++) {
    const s = createGame(seed, { chapter });
    let t = 0;
    while (s.phase !== 'over' && s.phase !== 'won' && t++ < 3000) { ai(s, weak); step(s); }
    if (s.phase === 'won') { wins++; hpLeft.push(s.baseHp); } else if (s.phase !== 'over') stalls++;
    reach[s.round]++;
  }
  return { wins, n, stalls, reach, hp: hpLeft.length ? hpLeft.reduce((a, b) => a + b) / hpLeft.length : null };
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
  const N = +process.argv[2] || 30;
  let wins = 0, stalls = 0; const reach = Array(11).fill(0); const hpLeft = [];
  for (let seed = 1; seed <= N; seed++) {
    const s = createGame(seed, { chapter: CHAPTER });
    let t = 0;
    while (s.phase !== 'over' && s.phase !== 'won' && t++ < 3000) { ai(s); step(s); }
    if (s.phase === 'won') { wins++; hpLeft.push(s.baseHp); }
    else if (s.phase !== 'over') { stalls++; if (process.argv.includes('--debug')) {
      const g = s.goblins[0];
      console.log(`  [시간초과] seed${seed} R${s.round} tick${s.tick} 고블린${s.goblins.length} 출발대기${s.spawnList.length}`,
        s.goblins.slice(0, 4).map(o => `${o.type}@${o.idx}${o.pit ? '갇힘' : ''} hp${Math.round(o.hp)} atk${o.atk.toFixed(1)}`).join(' | '),
        g ? (() => { const [x, y] = PATH[g.idx]; const c = s.cells[0][y][x]; return '| 칸: ' + (c ? `${c.key}Lv${c.lv} hp${Math.round(c.hp)} atk${c.atk.toFixed(1)} 봉인${c.sealed}` : '없음') + ` 메가${s.megas.length}`; })() : '');
    } }
    reach[s.round]++;
  }
  console.log(`[챕터 ${CHAPTER} x${SPEED} ${APM ? APM + 'APM' : '무제한'}] 승률 ${wins}/${N}, 도달 라운드 분포`, reach.slice(1).join(','), '평균 잔여HP', hpLeft.length ? (hpLeft.reduce((a, b) => a + b) / hpLeft.length).toFixed(1) : '-', stalls ? `시간초과 ${stalls}` : '');
}
