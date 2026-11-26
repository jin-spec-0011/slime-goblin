// 성장형 난이도 튜닝: '챕터 N은 강화 L레벨에서 승률 50%'가 되도록 챕터 체력 배율 탐색 (자동 모드)
// 사용: node tools/tune_prog.mjs [판수=10]
import { CHAPTERS } from '../src/data.js';
import { runBatch, modsAt } from './sim.mjs';

const N = +process.argv[2] || 10;
const PLAN = { 1: 1, 2: 2, 3: 5, 4: 8, 5: 12 };   // 챕터 -> 승률 50% 강화 레벨 (연구는 레벨/3)
for (const [cid, up] of Object.entries(PLAN)) {
  const ch = CHAPTERS[cid - 1], mods = modsAt(up, Math.floor(up / 3));
  let lo = Math.log(0.5), hi = Math.log(2000), best = null;
  for (let it = 0; it < 9; it++) {
    const mid = (lo + hi) / 2, h = +Math.exp(mid).toFixed(2);
    ch.hpMul = h; ch.atkMul = +(1 + 0.35 * Math.log2(h)).toFixed(2);
    const r = runBatch(N, +cid, 'auto', mods).wins / N;
    if (!best || Math.abs(r - 0.5) < Math.abs(best.r - 0.5)) best = { h, a: ch.atkMul, r };
    if (r > 0.5) lo = mid; else hi = mid;
  }
  ch.hpMul = best.h; ch.atkMul = best.a;
  console.log(`챕터 ${cid} ${ch.name}: 강화 ${up}레벨 기준 hpMul ${best.h} atkMul ${best.a} -> 승률 ${(best.r * 100).toFixed(0)}%`);
}
