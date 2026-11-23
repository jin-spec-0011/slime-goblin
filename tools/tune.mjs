// 챕터별 체력 배율 자동 튜닝
// 사용: node tools/tune.mjs [판수=16] [auto|human]
//  auto : 자동 모드 + 강화 0 기준 (방치형 기본 난이도, 강화가 필요하도록)
//  human: x3 배속 30APM 사람 모델 기준
import { CHAPTERS } from '../src/data.js';
import { runBatch } from './sim.mjs';

const N = +process.argv[2] || 16, MODE = process.argv[3] || 'auto';
const TARGET = MODE === 'auto' ? [1.0, 0.85, 0.5, 0.25, 0.1] : [0.95, 0.85, 0.7, 0.6, 0.45];
const rate = c => (MODE === 'auto' ? runBatch(N, c, 'auto').wins : Math.max(runBatch(N, c, false).wins, runBatch(N, c, true).wins)) / N;

for (const ch of CHAPTERS) {
  const tgt = TARGET[ch.id - 1];
  if (tgt >= 1) { ch.hpMul = 1; ch.atkMul = 1; console.log(`챕터 ${ch.id} ${ch.name}: 기준 챕터 (hpMul 1)`); continue; }
  let lo = 1, hi = 12, best = null;
  for (let it = 0; it < 8; it++) {
    const mid = +((lo + hi) / 2).toFixed(3);
    ch.hpMul = mid; ch.atkMul = +(1 + (mid - 1) * 0.15).toFixed(3);
    const r = rate(ch.id);
    if (!best || Math.abs(r - tgt) < Math.abs(best.r - tgt)) best = { m: mid, a: ch.atkMul, r };
    if (r > tgt) lo = mid; else hi = mid;
  }
  ch.hpMul = best.m; ch.atkMul = best.a;
  console.log(`챕터 ${ch.id} ${ch.name}: hpMul ${best.m} atkMul ${best.a} -> 승률 ${(best.r * 100).toFixed(0)}% (목표 ${tgt * 100}%)`);
}
