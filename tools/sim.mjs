import { createGame, step, placeFromQueue, moveSlime, getCell, slimeCount, makeMega, skipPrep, autoPlay, PATH } from '../src/engine.js';
import { CFG } from '../src/data.js';
import { newProfile, modsOf, UPGRADES, adaptiveDiff } from '../src/meta.js';

// 단순 AI: 같은 원소에 겹치기 우선, 없으면 경로 앞쪽 칸부터 배치
// 사용: node tools/sim.mjs <판수> [strong|weak|auto] [챕터] [--speed=3] [--apm=30] [--up=N] [--res=N] [--tower=1]
//  auto: 게임의 자동 조합 모드를 켜고 방치 (조작 속도 제한 없음)
//  게임 규칙은 틱 단위라 배속과 무관하다. 배속이 바꾸는 것은 '사람이 조작할 수 있는 실제 시간'이므로
//  사람의 분당 행동 수(APM)를 실제 시간 기준으로 제한해 배속 효과를 재현한다. --apm=0 이면 제한 없음.
const WEAK = process.argv[3]==='weak';
const MODE = process.argv[3] || 'strong';
const CHAPTER = +process.argv[4] || 1;
const opt = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? +a.split('=')[1] : d; };
const SPEED = opt('speed', 3), APM = opt('apm', 30);
// 성장 검증: --up=N 골드 강화 전부 N레벨(최대치 제한), --res=N 속성 연구 전부 N레벨, --tower=1 무한의 탑
const UP = opt('up', 0), RES = opt('res', 0), TOWER = opt('tower', 0);
export function modsAt(up, res) {
  const p = newProfile();
  for (const k of Object.keys(p.upgrades)) p.upgrades[k] = UPGRADES[k].max !== undefined ? Math.min(UPGRADES[k].max, up) : up;
  for (const k of Object.keys(p.research)) p.research[k] = res;
  return modsOf(p);
}
function profileMods() {
  const p = newProfile();
  for (const k of Object.keys(p.upgrades)) p.upgrades[k] = UPGRADES[k].max !== undefined ? Math.min(UPGRADES[k].max, UP) : UP;
  for (const k of Object.keys(p.research)) p.research[k] = RES;
  return modsOf(p);
}
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
export function runBatch(n, chapter, weak, modsOverride = null) { // weak: false|true|'auto'
  let wins = 0, stalls = 0; const reach = Array(11).fill(0); const hpLeft = [];
  for (let seed = 1; seed <= n; seed++) {
    const base = modsOverride || profileMods(), deck = newProfile().deck;
    const s = createGame(seed, { chapter, unlocked: process.env.UL !== undefined ? +process.env.UL : chapter - 1, mods: base.__fixedDiff ? base : { ...base, ...adaptiveDiff(base, chapter, deck) }, deck }); // 기본 덱 8종 + 적응형 난이도
    let t = 0;
    while (s.phase !== 'over' && s.phase !== 'won' && t++ < 3000) { if (weak === 'auto') autoPlay(s); else ai(s, weak); step(s); }
    if (s.phase === 'won') { wins++; hpLeft.push(s.baseHp); } else if (s.phase !== 'over') stalls++;
    reach[s.round]++;
  }
  return { wins, n, stalls, reach, hp: hpLeft.length ? hpLeft.reduce((a, b) => a + b) / hpLeft.length : null };
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
  const N = +process.argv[2] || 30;
  let wins = 0, stalls = 0; const reach = Array(11).fill(0); const hpLeft = [], golds = [], crys = [], floors = [];
  for (let seed = 1; seed <= N; seed++) {
    const s = createGame(seed, { chapter: CHAPTER, mods: profileMods(), tower: TOWER, unlocked: process.env.UL !== undefined ? +process.env.UL : CHAPTER - 1 });
    let t = 0;
    while (s.phase !== 'over' && s.phase !== 'won' && t++ < (TOWER ? 20000 : 3000)) { if (MODE === 'auto') autoPlay(s); else ai(s); step(s); }
    golds.push(s.gold); crys.push(s.crystals); floors.push(s.round);
    if (s.phase === 'won') { wins++; hpLeft.push(s.baseHp); }
    else if (s.phase !== 'over') { stalls++; if (process.argv.includes('--debug')) {
      const g = s.goblins[0];
      console.log(`  [시간초과] seed${seed} R${s.round} tick${s.tick} 고블린${s.goblins.length} 출발대기${s.spawnList.length}`,
        s.goblins.slice(0, 4).map(o => `${o.type}@${o.idx}${o.pit ? '갇힘' : ''} hp${Math.round(o.hp)} atk${o.atk.toFixed(1)}`).join(' | '),
        g ? (() => { const [x, y] = PATH[g.idx]; const c = s.cells[0][y][x]; return '| 칸: ' + (c ? `${c.key}Lv${c.lv} hp${Math.round(c.hp)} atk${c.atk.toFixed(1)} 봉인${c.sealed}` : '없음') + ` 메가${s.megas.length}`; })() : '');
    } }
    if (!TOWER) reach[s.round]++;
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  if (TOWER) { console.log(`[무한의 탑 ${MODE} 강화${UP} 연구${RES}] 도달 층 평균 ${avg(floors).toFixed(1)} (최소 ${Math.min(...floors)}, 최대 ${Math.max(...floors)}) 골드 평균 ${Math.round(avg(golds))} 결정 ${avg(crys).toFixed(1)}`); process.exit(0); }
  console.log(`[챕터 ${CHAPTER} ${MODE === 'auto' ? '자동 모드' : `x${SPEED} ${APM ? APM + 'APM' : '무제한'}`}] 승률 ${wins}/${N}, 도달 라운드 분포`, reach.slice(1).join(','), '평균 잔여HP', hpLeft.length ? (hpLeft.reduce((a, b) => a + b) / hpLeft.length).toFixed(1) : '-', stalls ? `시간초과 ${stalls}` : '', `| 강화${UP} 연구${RES} 골드 평균 ${Math.round(avg(golds))} 결정 ${avg(crys).toFixed(1)}`);
}
