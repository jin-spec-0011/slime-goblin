// 성장형 난이도 튜닝: '챕터 N은 기준 강화 레벨에서 목표 승률(기본 37.5%)'이 되도록 챕터 체력 배율 탐색 (자동 모드)
// 사용: node tools/tune_prog.mjs [판수=10] [챕터 목록=1,2,3,4,5]
import { CHAPTERS } from '../src/data.js';
import { runBatch, modsAt } from './sim.mjs';

const N = +process.argv[2] || 10;
import { PLAN_LV as PLAN } from '../src/meta.js';   // 챕터 -> 기준 강화 레벨 (연구는 레벨/3)
const TARGET = +(process.env.TARGET || 0.375);       // 기준 레벨 목표 승률
const ONLY = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
for (const [cid, up] of Object.entries(PLAN).filter(([c]) => !ONLY.length || ONLY.includes(+c))) {
  const ch = CHAPTERS[cid - 1], mods = modsAt(up, Math.floor(up / 3));
  let lo = Math.log(+(process.env.LO || 0.5)), hi = Math.log(+(process.env.HI || 2000)), best = null;
  for (let it = 0; it < 9; it++) {
    const mid = (lo + hi) / 2, h = +Math.exp(mid).toFixed(2);
    ch.hpMul = h; ch.atkMul = +Math.max(0.5, 1 + 0.35 * Math.log2(h)).toFixed(2);
    const r = runBatch(N, +cid, 'auto', mods).wins / N;
    if (!best || Math.abs(r - TARGET) < Math.abs(best.r - TARGET)) best = { h, a: ch.atkMul, r };
    if (r > TARGET) lo = mid; else hi = mid;
  }
  ch.hpMul = best.h; ch.atkMul = best.a;
  console.log(`챕터 ${cid} ${ch.name}: 강화 ${up}레벨 기준 hpMul ${best.h} atkMul ${best.a} -> 승률 ${(best.r * 100).toFixed(0)}%`);
}
