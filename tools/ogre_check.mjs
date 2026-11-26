// 오우거 세기 측정: 챕터 1 5라운드 오우거 1마리 vs 경로 위 Lv5 슬라임 N마리
// 오우거가 쓰러지는 비율과 부순 슬라임 수를 출력 (목표: Lv5 5마리 정도는 있어야 막힘)
// 사용: node tools/ogre_check.mjs [HP 배율=1] [공격 배율=1] [라운드=5] [챕터=1]
import { createGame, step, placeFromQueue, PATH } from '../src/engine.js';
import { GOBLINS } from '../src/data.js';
import { newProfile } from '../src/meta.js';

const [hpScale, atkScale, round, chapter] = [+process.argv[2] || 1, +process.argv[3] || 1, +process.argv[4] || 5, +process.argv[5] || 1];
GOBLINS.giant.hp = Math.round(GOBLINS.giant.hp * hpScale);
GOBLINS.giant.atk = GOBLINS.giant.atk * atkScale;
const deck = newProfile().deck, T = 40;
console.log(`오우거 HP ${GOBLINS.giant.hp} 공격 ${GOBLINS.giant.atk} · 챕터 ${chapter} ${round}라운드`);
for (const n of [3, 4, 5, 6, 7]) {
  let killed = 0, broke = 0;
  for (let seed = 1; seed <= T; seed++) {
    const s = createGame(seed, { chapter, autoField: false });
    s.round = round; s.queue = []; s.cells[0].forEach(r => r.fill(null));
    for (let i = 0; i < n; i++) {
      const sym = deck[(seed * 7 + i * 3) % deck.length], [x, y] = PATH[2 + i * 3];
      for (let k = 0; k < 5; k++) { s.queue.unshift({ id: seed * 100 + i * 10 + k, sym }); placeFromQueue(s, 0, x, y, 0); }
    }
    s.queue = []; s.prepLeft = 1; step(s);
    s.goblins = []; s.spawnList = ['giant']; s.kills = 0;   // 라운드 시작 직후 원래 편성은 버리고 오우거 1마리만
    const before = s.cells.flat(2).filter(Boolean).length;
    let t = 0; while (t++ < 3000 && (s.spawnList.length || s.goblins.length)) step(s);
    broke += before - s.cells.flat(2).filter(Boolean).length;
    if (s.kills > 0) killed++;
  }
  console.log(`Lv5 ${n}마리: 처치 ${Math.round(killed / T * 100)}% · 부순 슬라임 ${(broke / T).toFixed(1)}마리`);
}
