// 챕터별 체력 배율 자동 튜닝 (x3 배속, 30APM 사람 모델)
// 사용: node tools/tune.mjs [판수=24] -> 챕터별 목표 승률에 맞는 hpMul 출력 (data.js는 직접 수정)
import { CHAPTERS } from '../src/data.js';
import { runBatch } from './sim.mjs';

const N = +process.argv[2] || 24;
const TARGET = [0.95, 0.85, 0.7, 0.6, 0.45];
const rate = c => Math.max(runBatch(N, c, false).wins, runBatch(N, c, true).wins) / N; // 더 잘한 플레이 방식 기준

for (const ch of CHAPTERS) {
  const tgt = TARGET[ch.id - 1];
  let lo = 0.3, hi = Math.max(1.2, ch.hpMul), best = null;
  for (let it = 0; it < 7; it++) {
    const mid = +((lo + hi) / 2).toFixed(3);
    ch.hpMul = mid; ch.atkMul = 1 + (mid - 1) * 0.15 > 1 ? 1 + (mid - 1) * 0.15 : 1;
    const r = rate(ch.id);
    if (!best || Math.abs(r - tgt) < Math.abs(best.r - tgt)) best = { m: mid, a: +ch.atkMul.toFixed(3), r };
    if (r > tgt) lo = mid; else hi = mid;
  }
  ch.hpMul = best.m; ch.atkMul = best.a;
  console.log(`챕터 ${ch.id} ${ch.name}: hpMul ${best.m} atkMul ${best.a} -> 승률 ${(best.r * 100).toFixed(0)}% (목표 ${tgt * 100}%)`);
}
