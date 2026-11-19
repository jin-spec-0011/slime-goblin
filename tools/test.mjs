// 핵심 규칙 단위 테스트: node tools/test.mjs
import { createGame, step, placeFromQueue, moveSlime, combine, makeMega, recipeHint, getCell, PATH } from '../src/engine.js';
let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('FAIL', name)); };
const put = (s, sym, x, y, z) => { s.queue.unshift({ id: 9e6 + Math.random(), sym }); return placeFromQueue(s, 0, x, y, z); };

let s = createGame(1);
t('배치', put(s, 'H', 0, 0, 0).ok && getCell(s, 0, 0, 0).key === 'H');
t('겹치기 Lv2', put(s, 'H', 0, 0, 0).ok && getCell(s, 0, 0, 0).lv === 2);
t('다른 원소 겹치기 거부', !put(s, 'O', 0, 0, 0).ok);
put(s, 'H', 1, 0, 0);
t('이동 겹치기 Lv3', moveSlime(s, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }).ok && getCell(s, 0, 0, 0).lv === 3);
s = createGame(2);
put(s, 'H', 0, 0, 0); put(s, 'H', 1, 0, 0); put(s, 'O', 2, 0, 0);
const L = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }];
t('족보 일치 힌트', recipeHint(s, L).state === 'match');
const c0 = s.catalysts;
t('H2O 합성', combine(s, L).ok && getCell(s, 0, 0, 0).key === 'H2O' && getCell(s, 0, 0, 0).kind === 'compound' && s.catalysts === c0 - 1);
put(s, 'C', 3, 0, 0); put(s, 'N', 4, 0, 0);
const L2 = [{ x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }];
t('혼합물', combine(s, L2).ok && getCell(s, 3, 0, 0).kind === 'mixture');
s.catalysts = 0; put(s, 'C', 0, 1, 0); put(s, 'O', 1, 1, 0);
t('촉매 없으면 거부', !combine(s, [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }]).ok);
// 메가
s = createGame(3);
for (const x of [0, 1, 2]) for (let i = 0; i < 5; i++) put(s, 'Fe', x, 2, 0);
const M = [{ x: 1, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }];
t('메가 R10 외 거부', !makeMega(s, M).ok);
s.round = 10;
t('메가 생성', makeMega(s, M).ok && s.megas.length === 1 && !getCell(s, 1, 2, 0));
// 함정 규칙: 슬라임 없는 칸 통과, 있는 칸에서 빠짐, 일반 고블린 무공격
s = createGame(4); s.queue = [];
put(s, 'Fe', PATH[3][0], PATH[3][1], 0);
s.prepLeft = 1; step(s);
const fe = getCell(s, PATH[3][0], PATH[3][1], 0); const hp0 = fe.hp;
for (let i = 0; i < 4; i++) step(s);
const g = s.goblins.find(v => v.idx === 3);
t('슬라임 칸에서 구덩이 빠짐', g && g.pit);
t('일반 고블린은 슬라임 공격 안 함', fe.hp === hp0);
// 빈 맵 → 전원 통과 → 거점 피해
s = createGame(5); s.queue = []; s.prepLeft = 1;
let n = 0; while (s.phase !== 'prep' || n < 2) { step(s); n++; if (n > 200) break; s.queue = []; }
t('빈 맵 통과 시 거점 -6', s.baseHp === 14);
// 패배 판정
s = createGame(6); s.baseHp = 1; s.prepLeft = 1; n = 0;
while (s.phase !== 'over' && n++ < 200) { s.queue = []; step(s); }
t('거점 0 → 패배', s.phase === 'over');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
