// 성장 시뮬레이터: 자동 모드로 판을 돌리고, 번 골드로 강화하며 진행하는 '방치형 플레이어'
// 사용: node tools/progress.mjs [최대 판수=60]
//  - 매 판: 열린 최고 챕터에 도전 (챕터 5 클리어 후에는 무한의 탑)
//  - 판이 끝나면 골드로 가장 싼 강화부터 구매, 원소 결정은 가장 낮은 속성 연구에 투자
//  - 출력: 각 챕터를 처음 깬 판 번호, 누적 플레이 시간(게임 시간, x1 기준), 탑 최고 층
import { createGame, step, autoPlay } from '../src/engine.js';
import { CHAPTERS, CFG } from '../src/data.js';
import { newProfile, modsOf, UPGRADES, upgradeCost, isMaxed, buyUpgrade, buyResearch, researchCost } from '../src/meta.js';

const MAX = +process.argv[2] || 60;
const p = newProfile();
let unlocked = 1, ticks = 0, seed = 1;
const firstClear = {};
const fmtTime = t => `${Math.floor(t / 3600)}시간 ${Math.floor((t % 3600) / 60)}분`;

for (let run = 1; run <= MAX; run++) {
  const tower = unlocked > CHAPTERS.length;
  const s = createGame(seed++, { chapter: Math.min(unlocked, CHAPTERS.length), tower: tower ? 1 : 0, mods: modsOf(p), deck: p.deck });
  let t = 0;
  while (s.phase !== 'over' && s.phase !== 'won' && t++ < 30000) { autoPlay(s); step(s); }
  ticks += s.tick; p.gold += s.gold; p.crystals += s.crystals;
  const res = tower ? `탑 ${s.round}층` : `챕터 ${s.chapter} ${s.phase === 'won' ? '클리어' : `${s.round}라운드 패배`}`;
  if (tower) p.towerBest = Math.max(p.towerBest, s.round);
  if (!tower && s.phase === 'won') { if (!firstClear[s.chapter]) firstClear[s.chapter] = { run, time: ticks }; unlocked = Math.max(unlocked, s.chapter + 1); }
  // 강화: 가장 싼 것부터 살 수 있는 만큼
  const bought = [];
  for (;;) {
    const opts = Object.keys(UPGRADES).filter(k => !isMaxed(k, p.upgrades[k])).map(k => [k, upgradeCost(k, p.upgrades[k])]).sort((a, b) => a[1] - b[1]);
    if (!opts.length || p.gold < opts[0][1]) break;
    buyUpgrade(p, opts[0][0]); bought.push(opts[0][0]);
  }
  for (;;) { const a = Object.keys(p.research).sort((x, y) => p.research[x] - p.research[y])[0]; if (p.crystals < researchCost(p.research[a])) break; buyResearch(p, a); }
  console.log(`#${String(run).padStart(2)} ${res.padEnd(18)} 골드+${String(s.gold).padStart(6)} 결정+${s.crystals} | 강화 ${Object.entries(p.upgrades).map(([k, v]) => k + v).join(' ')} | ${fmtTime(ticks)}`);
  if (tower && run >= MAX) break;
}
console.log('\n챕터 첫 클리어:', Object.entries(firstClear).map(([c, v]) => `챕터${c}=${v.run}판(${fmtTime(v.time)})`).join(', '), '| 탑 최고', p.towerBest);
