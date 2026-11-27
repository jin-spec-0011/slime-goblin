// 거점 체력 배율(baseMul = 1/L) 튜닝: 고블린 체력은 그대로 두고(깊이 유지), 기준 강화 레벨 목표 승률이 되도록 챕터별 baseMul 탐색
// 사용: node tools/tune_leak.mjs [판수=20] [챕터 목록=1,2,3,4,5]   (환경변수 TARGET 기본 0.375, TB=탑 기록 → 군단 단계별 baseMul0/1/2/baseMul)
import { CHAPTERS } from '../src/data.js';
import { runBatch, modsAt } from './sim.mjs';
import { PLAN_LV } from '../src/meta.js';
import { BASE_KEYS, hordeStage } from '../src/engine.js';

const KEY = BASE_KEYS[hordeStage(+(process.env.TB || 0))];
const N = +process.argv[2] || 20, TARGET = +(process.env.TARGET || 0.375);
const ONLY = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
for (const [cid, up] of Object.entries(PLAN_LV).filter(([c]) => !ONLY.length || ONLY.includes(+c))) {
  const ch = CHAPTERS[cid - 1], mods = modsAt(up, Math.floor(up / 3));
  let lo = Math.log(+(process.env.LLO || 0.02)), hi = Math.log(+(process.env.LHI || 2)), best = null;
  for (let it = 0; it < 9; it++) {
    const mid = (lo + hi) / 2, L = +Math.exp(mid).toFixed(3);
    ch[KEY] = 1 / L;
    const r = runBatch(N, +cid, 'auto', mods).wins / N;
    if (!best || Math.abs(r - TARGET) < Math.abs(best.r - TARGET)) best = { L, r };
    if (r > TARGET) lo = mid; else hi = mid;      // 너무 쉬우면 거점 피해를 키움
  }
  ch[KEY] = +(1 / best.L).toFixed(1);
  console.log(`챕터 ${cid} ${ch.name}: 강화 ${up}레벨 기준 ${KEY} ${ch[KEY]} -> 승률 ${(best.r * 100).toFixed(0)}%`);
}
