// 적응형 난이도 강도(ADAPT_ALPHA) 보정: 기준보다 강화가 높은 플레이어도 목표 승률(기본 37.5%) 근처가 되는지 측정
// 사용: node tools/tune_adapt.mjs [판수=20] [alpha 후보들, 쉼표=0.8,1,1.2] [기준 대비 추가 강화=4,8]
import { runBatch, modsAt } from './sim.mjs';
import { PLAN_LV, adaptiveDiff } from '../src/meta.js';
import * as META from '../src/meta.js';

const N = +process.argv[2] || 20;
const alphas = (process.argv[3] || '0.8,1,1.2').split(',').map(Number);
const extras = (process.argv[4] || '4,8').split(',').map(Number);
const chapters = (process.env.CH || '2,3,4').split(',').map(Number);
for (const alpha of alphas) {
  const cells = [];
  for (const ch of chapters) for (const ex of extras) {
    const lv = PLAN_LV[ch] + ex, mods = modsAt(lv, Math.floor(lv / 3));
    // runBatch는 META.ADAPT_ALPHA를 쓰므로, 여기서는 alpha를 직접 넣은 난이도로 덮어쓴다
    const diff = adaptiveDiff(mods, ch, null, alpha, undefined, +(process.env.BETA ?? META.ADAPT_BASE_EXP));
    const r = runBatch(N, ch, 'auto', { ...mods, ...diff, __fixedDiff: true }).wins / N;
    cells.push(`챕터${ch}+${ex} ${Math.round(r * 100)}%`);
  }
  console.log(`alpha ${alpha}: ${cells.join(' · ')}`);
}
void META;
