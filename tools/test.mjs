// 핵심 규칙 단위 테스트: node tools/test.mjs
import { CFG, ROUND_TABLE, GOBLINS, CHAPTERS } from '../src/data.js';
import { createGame, step, affinity, placeFromQueue, moveSlime, combine, makeMega, recipeHint, getCell, PATH } from '../src/engine.js';
let pass = 0, fail = 0;
// 기존 규칙 테스트는 빈 필드를 전제로 하므로 자동 배치를 끄고 실행
const cg = seed => createGame(seed, { autoField: false });
const t = (name, cond) => { cond ? pass++ : (fail++, console.log('FAIL', name)); };
const put = (s, sym, x, y, z) => { s.queue.unshift({ id: 9e6 + Math.random(), sym }); return placeFromQueue(s, 0, x, y, z); };

let s = cg(1);
t('배치', put(s, 'H', 0, 0, 0).ok && getCell(s, 0, 0, 0).key === 'H');
t('겹치기 Lv2', put(s, 'H', 0, 0, 0).ok && getCell(s, 0, 0, 0).lv === 2);
t('다른 원소 겹치기 거부', !put(s, 'O', 0, 0, 0).ok);
put(s, 'H', 1, 0, 0);
t('이동 겹치기 Lv3', moveSlime(s, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }).ok && getCell(s, 0, 0, 0).lv === 3);
s = cg(2);
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
// 속성 합성: 물 + 불 = 수증기, H(불 속성) + 물 = 수증기, 전기 + 불 = 플라즈마
s = cg(8); s.catalysts = 5;
put(s, 'WATER', 0, 0, 0); put(s, 'FIRE', 1, 0, 0);
t('물+불 = 수증기', combine(s, [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]).ok && getCell(s, 0, 0, 0).key === 'STEAM' && getCell(s, 0, 0, 0).kind === 'fusion');
put(s, 'H', 2, 0, 0); put(s, 'WATER', 3, 0, 0);
t('H(불 속성)+물 = 수증기', combine(s, [{ x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }]).ok && getCell(s, 2, 0, 0).key === 'STEAM');
put(s, 'ELEC', 0, 1, 0); put(s, 'FIRE', 1, 1, 0);
t('전기+불 = 플라즈마(관통)', combine(s, [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }]).ok && getCell(s, 0, 1, 0).pierce === true);
t('화학 족보가 속성 합성보다 우선(H2O)', (() => { put(s, 'H', 2, 1, 0); put(s, 'H', 3, 1, 0); put(s, 'O', 4, 1, 0); combine(s, [{ x: 2, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, { x: 4, y: 1, z: 0 }]); return getCell(s, 2, 1, 0).key === 'H2O'; })());
// 상성: 기마는 물 약점(x1.5), 바람 내성(x0.5)
const rider = { weak: GOBLINS.rider.weak, resist: GOBLINS.rider.resist };
put(s, 'WATER', 0, 2, 0); put(s, 'O', 1, 2, 0); put(s, 'C', 2, 2, 0);
t('기마 vs 물 = 약점 1.5', affinity(getCell(s, 0, 2, 0), rider) === 1.5);
t('기마 vs 산소(바람) = 내성 0.5', affinity(getCell(s, 1, 2, 0), rider) === 0.5);
t('기마 vs 탄소(대지) = 보통 1', affinity(getCell(s, 2, 2, 0), rider) === 1);
// 개편 고블린 능력
s = cg(9); s.queue = []; s.prepLeft = 1; step(s); s.spawnList = [];
const mk = (type, idx) => { const d = GOBLINS[type]; const g = { id: 1e6 + idx, type, name: d.name, hp: 10, maxhp: 100, atk: d.atk, def: d.def, spd: 0, leak: 1, multi: 1, range: 0, aura: false, evade: 0, cleanse: false, weak: d.weak, resist: d.resist, immune: d.immune || [], heal: d.heal || 0, feast: d.feast || 0, atkBuff: 1, idx, pit: false, st: {}, fights: 0, dead: false, mv: 0 }; s.goblins.push(g); return g; };
const sh = mk('shaman', 10), ally = mk('normal', 11);
s.tick = 1; step(s);
t('주술사: 주변 고블린 회복', ally.hp > 10 && sh.hp > 10);
s.goblins = []; const ck = mk('cook', 5), friend = mk('fighter', 6);
ck.hp = 1; s.cells[0][PATH[5][1]][PATH[5][0]] = null;
put(s, 'FIRE', PATH[5][0], PATH[5][1], 0); getCell(s, PATH[5][0], PATH[5][1], 0).lv = 5;
ck.pit = true; step(s);
t('요리사: 쓰러지면 주변 회복 + 공격 버프', ck.dead && friend.hp > 10 && friend.atkBuff === 1.2);
s.goblins = []; const gm = mk('gasmask', 15);
put(s, 'Cl', PATH[15][0], PATH[15][1], 0); gm.pit = true; gm.hp = 100; step(s);
t('방독: 독 면역', !gm.st.poison);
// 메가
s = cg(3);
for (const x of [0, 1, 2]) for (let i = 0; i < 5; i++) put(s, 'Fe', x, 2, 0);
const M = [{ x: 1, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }];
s.round = CFG.MEGA_ROUND - 1;
t(`메가 ${CFG.MEGA_ROUND}라운드 전 거부`, !makeMega(s, M).ok);
s.round = CFG.MEGA_ROUND;
t('메가 생성', makeMega(s, M).ok && s.megas.length === 1 && !getCell(s, 1, 2, 0));
// 함정 규칙: 슬라임 없는 칸 통과, 있는 칸에서 빠짐, 일반 고블린 무공격
s = cg(4); s.queue = [];
put(s, 'Fe', PATH[3][0], PATH[3][1], 0);
s.prepLeft = 1; step(s);
const fe = getCell(s, PATH[3][0], PATH[3][1], 0); const hp0 = fe.hp;
for (let i = 0; i < 4; i++) step(s);
const g = s.goblins.find(v => v.idx === 3);
t('슬라임 칸에서 구덩이 빠짐', g && g.pit);
t('일반 고블린은 슬라임 공격 안 함', fe.hp === hp0);
// 1칸씩 빠지기: 1번 칸 구덩이에 1마리가 빠져 있으면 뒤 고블린은 지나쳐 진행
s = cg(7); s.queue = [];
put(s, 'Fe', PATH[0][0], PATH[0][1], 0); getCell(s, PATH[0][0], PATH[0][1], 0).lv = 5;
s.prepLeft = 1; step(s); step(s); step(s); step(s);
const inPit = s.goblins.filter(v => v.pit && v.idx === 0).length;
const passed = s.goblins.filter(v => !v.pit && v.idx > 0).length;
t('구덩이에는 1마리만', inPit === 1);
t('뒤 고블린은 다음 칸으로 진행', passed >= 1);
// 빈 맵 → 전원 통과 → 거점 피해
s = cg(5); s.queue = []; s.prepLeft = 1;
let n = 0; while (s.phase !== 'prep' || n < 2) { step(s); n++; if (n > 200) break; s.queue = []; }
const leakR1 = ROUND_TABLE[0].reduce((a, [type, n]) => a + GOBLINS[type].leak * n, 0);
t(`빈 맵 통과 시 거점 -${leakR1}`, s.baseHp === CFG.BASE_HP - leakR1);
// 패배 판정
s = cg(6); s.baseHp = 1; s.prepLeft = 1; n = 0;
while (s.phase !== 'over' && n++ < 200) { s.queue = []; step(s); }
t('거점 0 → 패배', s.phase === 'over');
// 자동 배치: 시작 슬라임은 필드로, 필드가 가득 차면 그때부터 덱으로
{
  const a = createGame(11);
  t('시작 슬라임 필드 랜덤 배치', a.cells.flat(2).filter(Boolean).length === CFG.START_SLIMES && a.queue.length === 0);
  let guard = 0;
  while (a.cells.flat(2).filter(Boolean).length < CFG.W * CFG.H && guard++ < 500) step(a);
  t('지급 슬라임은 필드 빈칸부터 채움 (덱 비어 있음)', a.cells.flat(2).filter(Boolean).length === CFG.W * CFG.H && a.queue.length === 0);
  a.goblins = []; a.spawnList = ['normal']; // 슬라임이 쓰러지지 않게 고블린 제거
  for (let i = 0; i < CFG.DROP_EVERY; i++) step(a);
  t('필드가 가득 차면 덱에 쌓임', a.queue.length === 1);
}
// 교착 방지: 얼음 내성 주술사 2마리가 질소(빙결) 슬라임에 갇혀 서로 회복해도 결국 쓰러짐
{
  const s2 = cg(21); s2.prepLeft = 1; step(s2); s2.spawnList = [];
  for (const i of [4, 6]) { put(s2, 'N', PATH[i][0], PATH[i][1], 0); getCell(s2, PATH[i][0], PATH[i][1], 0).lv = 5; }
  const d = GOBLINS.shaman;
  for (const i of [4, 6]) s2.goblins.push({ id: 5e6 + i, type: 'shaman', name: d.name, hp: 90, maxhp: 90, atk: 3, def: 0, spd: 0, leak: 2, multi: 1, range: 0, aura: false, evade: 0, cleanse: false, weak: d.weak, resist: d.resist, immune: [], heal: d.heal, feast: 0, atkBuff: 1, idx: i, pit: true, st: {}, fights: 0, dead: false, mv: 0 });
  let n = 0; while (s2.goblins.length && n++ < 200) step(s2);
  t('교착 방지: 서로 회복하는 갇힌 주술사도 200초 안에 쓰러짐', s2.goblins.length === 0);
}
// 챕터: 경로 유효성, 라운드 수, 난이도 상승, 환경 효과
for (const c of CHAPTERS) {
  const g = createGame(1, { chapter: c.id, autoField: false });
  const uniq = new Set(PATH.map(p => p.join(','))).size;
  const linked = PATH.every((p, i) => !i || Math.abs(p[0] - PATH[i - 1][0]) + Math.abs(p[1] - PATH[i - 1][1]) === 1);
  t(`챕터 ${c.id} 경로 25칸 한붓그리기`, PATH.length === 25 && uniq === 25 && linked);
  t(`챕터 ${c.id} 라운드 10개`, c.rounds.length === 10 && g.chapter === c.id);
}
{
  const g1 = createGame(1, { chapter: 1, autoField: false }), g5 = createGame(1, { chapter: 5, autoField: false });
  g1.round = g5.round = 8; g1.prepLeft = g5.prepLeft = 1; step(g1); step(g5);
  g1.spawnList = ['fighter']; g5.spawnList = ['fighter']; step(g1); step(g5);
  t('챕터 5 고블린이 챕터 1보다 강함', g5.goblins[0] && g1.goblins[0] && g5.goblins[0].maxhp > g1.goblins[0].maxhp * 3);
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
