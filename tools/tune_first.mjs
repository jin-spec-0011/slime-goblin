// 첫 도전 체력 보정(firstHp) 튜닝: 챕터를 처음 도전할 때(시작 단계 < 챕터 단계) 기준 강화 레벨 목표 승률이 되도록 고블린 체력 배율 탐색
// 사용: node tools/tune_first.mjs [판수=20] [챕터 목록=1,2,3,4]   (환경변수 TARGET 기본 0.375)
import { CHAPTERS } from '../src/data.js';
import { runBatch, modsAt } from './sim.mjs';
import { PLAN_LV } from '../src/meta.js';

const N = +process.argv[2] || 20, TARGET = +(process.env.TARGET || 0.375);
const ONLY = (process.argv[3] || '1,2,3,4').split(',').filter(Boolean).map(Number);
delete process.env.UL;                                   // 첫 도전 = 해금 단계 챕터-1
for (const cid of ONLY) {
  const ch = CHAPTERS[cid - 1], up = PLAN_LV[cid], mods = modsAt(up, Math.floor(up / 3));
  let lo = Math.log(0.05), hi = Math.log(20), best = null;
  for (let it = 0; it < 9; it++) {
    const mid = (lo + hi) / 2, f = +Math.exp(mid).toFixed(2);
    ch.firstHp = f;
    const r = runBatch(N, cid, 'auto', mods).wins / N;
    if (!best || Math.abs(r - TARGET) < Math.abs(best.r - TARGET)) best = { f, r };
    if (r > TARGET) lo = mid; else hi = mid;
  }
  ch.firstHp = best.f;
  console.log(`챕터 ${cid} ${ch.name}: 강화 ${up}레벨 첫 도전 firstHp ${best.f} -> 승률 ${(best.r * 100).toFixed(0)}%`);
}
