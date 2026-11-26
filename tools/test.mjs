// 핵심 규칙 단위 테스트: node tools/test.mjs
import { CFG, ROUND_TABLE, GOBLINS, CHAPTERS, FUSIONS, RECIPES, ATTRS, JOKES } from '../src/data.js';
import { existsSync } from 'node:fs';
import * as META from '../src/meta.js';
import * as ON from '../src/online.js';
import { setMods, towerRound } from '../src/engine.js';
import { createGame, step, affinity, autoPlay, placeFromQueue, moveSlime, combine, makeMega, recipeHint, getCell, PATH } from '../src/engine.js';
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
// 속성 합성은 2마리 전용 -> 족보가 아닌 3마리 조합은 혼합물
put(s, 'C', 3, 0, 0); put(s, 'N', 4, 0, 0); put(s, 'U', 0, 1, 0);
const L2 = [{ x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
t('혼합물 (족보 아닌 3마리)', combine(s, L2).ok && getCell(s, 3, 0, 0).kind === 'mixture');
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
  t('필드가 가득 차면 덱에 쌓임', a.queue.length >= 1 && a.cells.flat(2).filter(Boolean).length === CFG.W * CFG.H);
}
// 오우거: 5라운드부터 챕터 번호만큼(최대 5) 매 라운드 등장, 빙결·기절 면역
{
  const ok = CHAPTERS.every(c => c.rounds.every((r, i) => {
    const g = (r.find(([k]) => k === 'giant') || [0, 0])[1];
    return g === (i + 1 >= 5 ? Math.min(5, c.id) : 0);
  }));
  t('오우거 편성: 1-5부터 매 라운드, 챕터 N은 N마리', ok);
  t('탑 오우거 최대 5마리', towerRound(30).find(([k]) => k === 'giant')[1] === 5);
  t('오우거 빙결·기절 면역', GOBLINS.giant.immune.includes('freeze') && GOBLINS.giant.immune.includes('stun'));
}
// 조합 메가: 같은 조합 슬라임 Lv5 x3, 동시에 1마리만, 파괴되면 다시 가능
{
  const mk = (s, x, y, sym) => { for (let l = 0; l < 5; l++) { s.queue.unshift({ id: Math.random(), sym }); placeFromQueue(s, 0, x, y, 0); } };
  const s = cg(21); s.cells.forEach(f => f.forEach(r => r.fill(null))); s.queue = []; s.round = 6; s.catalysts = 9;
  const made = [];
  for (let k = 0; k < 6; k++) {                    // 뇌운(전기+바람) Lv5 6마리
    const y = Math.floor(k / 2) + (k >= 4 ? 1 : 0), x0 = (k % 2) * 2;
    mk(s, x0, y, 'ELEC'); mk(s, x0 + 1, y, 'O');
    const r = combine(s, [{ x: x0, y, z: 0 }, { x: x0 + 1, y, z: 0 }]);
    if (r.ok) made.push({ x: x0, y, z: 0 });
  }
  t('조합 슬라임 Lv5 생성', made.length === 6 && getCell(s, made[0].x, made[0].y, 0).lv === 5);
  const r1 = makeMega(s, made.slice(0, 3));
  t('조합 메가 생성', r1.ok && s.megas.length === 1 && s.megas[0].combo);
  const r2 = makeMega(s, made.slice(3, 6));
  t('조합 메가는 동시에 1마리만', !r2.ok && s.megas.length === 1);
  s.megas = [];                                    // 파괴됐다고 가정
  t('파괴 후 다시 생성 가능', makeMega(s, made.slice(3, 6)).ok);
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
// 조합 확장: 8속성 28쌍 전부 결과 존재, 모든 조합 슬라임에 전용 그림 존재
{
  const A = Object.keys(ATTRS), pairs = new Set(FUSIONS.map(f => [...f.pair].sort().join('+')));
  let all = true; for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (!pairs.has([A[i], A[j]].sort().join('+'))) all = false;
  t('속성 합성: 28쌍 모두 결과 존재', all && FUSIONS.length === 28);
  const missing = [...FUSIONS.map(f => f.key), ...RECIPES.map(r => r.key)].filter(k => !existsSync(new URL(`../assets/slime_${k}.png`, import.meta.url)));
  t(`조합 슬라임 전용 그림 (${FUSIONS.length + RECIPES.length}종)`, missing.length === 0);
  const s3 = cg(31); s3.catalysts = 9;
  put(s3, 'H', 0, 0, 0); put(s3, 'Cl', 1, 0, 0);
  t('H + Cl = 염산(화학 족보가 속성 합성보다 우선)', combine(s3, [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]).ok && getCell(s3, 0, 0, 0).key === 'HCl');
  put(s3, 'FIRE', 2, 0, 0); put(s3, 'Fe', 3, 0, 0);
  t('불 + 철(대지) = 용암', combine(s3, [{ x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }]).ok && getCell(s3, 2, 0, 0).key === 'LAVA');
}
// 비밀 족보(말장난)
{
  const s4 = cg(41); s4.catalysts = 20;
  const C = (...cells) => combine(s4, cells.map(([x, y]) => ({ x, y, z: 0 })));
  put(s4, 'He', 0, 0, 0); put(s4, 'He', 1, 0, 0);
  const r1 = C([0, 0], [1, 0]);
  t('He + He = 헤헤 (같은 원소끼리도 비밀 족보)', r1.ok && r1.joke === 'HEHE' && getCell(s4, 0, 0, 0).kind === 'joke');
  const hp0 = s4.baseHp; put(s4, 'S', 2, 0, 0); put(s4, 'O', 3, 0, 0); put(s4, 'S', 4, 0, 0);
  t('S + O + S = 구조 신호 (거점 +3)', C([2, 0], [3, 0], [4, 0]).joke === 'SOS' && s4.baseHp === hp0 + 3);
  const c0 = s4.catalysts; ['H', 'O', 'H', 'O', 'H'].forEach((k, i) => put(s4, k, i, 1, 0)); put(s4, 'O', 0, 2, 0);
  t('H×3 + O×3 = 산타 (촉매 +2, 사용 1)', C([0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2]).joke === 'HOHOHO' && s4.catalysts === c0 - 1 + 2);
  put(s4, 'Na', 1, 2, 0); put(s4, 'WATER', 2, 2, 0);
  t('Na + 물 = 나트륨 다이빙 (감전수보다 우선)', C([1, 2], [2, 2]).joke === 'NADIVE');
  put(s4, 'FIRE', 0, 3, 0); put(s4, 'WATER', 1, 3, 0); put(s4, 'ELEC', 2, 3, 0);
  t('불 + 물 + 전기 = 전기밥솥', C([0, 3], [1, 3], [2, 3]).joke === 'COOKER');
  put(s4, 'Fe', 1, 4, 0); const nb = getCell(s4, 1, 4, 0); nb.hp = 1;
  put(s4, 'C', 0, 4, 0); s4.cells[0][4][0] = s4.cells[0][3][0]; s4.cells[0][3][0] = null; // 밥솥을 (0,4)로 옮겨 Fe 옆에 둠
  s4.prepLeft = 99; s4.phase = 'run'; s4.spawnList = []; s4.goblins = []; step(s4);
  t('전기밥솥: 옆 슬라임 회복', nb.hp > 1);
  const miss = JOKES.map(j => j.key).filter(k => !existsSync(new URL(`../assets/slime_${k}.png`, import.meta.url)));
  t(`비밀 족보 ${JOKES.length}종 전용 그림`, miss.length === 0);
}
// 자동 조합 모드
{
  const s5 = cg(51); s5.catalysts = 0; s5.queue = []; // 덱 비우기 (시작 카드가 먼저 처리되지 않게)
  put(s5, 'C', PATH[0][0], PATH[0][1], 0); put(s5, 'C', PATH[10][0], PATH[10][1], 0);
  const s5b = cg(55); s5b.catalysts = 0; s5b.queue = [];
  put(s5b, 'C', PATH[0][0], PATH[0][1], 0); put(s5b, 'C', PATH[10][0], PATH[10][1], 0);
  t('자동: 빈칸이 안 채워지는 조건에선 겹치지 않음 (Lv1 둘 > Lv2 하나)', autoPlay(s5b).length === 0);
  s5.autoField = true; // 실제 게임처럼 빈칸이 다시 채워지는 조건에서만 겹치기가 이득
  const d = autoPlay(s5);
  t('자동: 같은 슬라임을 경로 앞쪽으로 겹침', d.length >= 1 && getCell(s5, PATH[0][0], PATH[0][1], 0).lv === 2 && !getCell(s5, PATH[10][0], PATH[10][1], 0));
  const s6 = cg(52); s6.catalysts = 1; s6.queue = [];
  put(s6, 'H', 0, 0, 0); put(s6, 'Cl', 1, 0, 0);
  const d2 = autoPlay(s6);
  t('자동: 촉매가 있으면 이득이 큰 조합 실행 (H+Cl=염산)', d2.some(x => /HCl/.test(x.msg)) && s6.catalysts === 0);
  const s7 = cg(53); s7.catalysts = 1; s7.queue = [];
  put(s7, 'He', 0, 0, 0); put(s7, 'He', 1, 0, 0); const d3 = autoPlay(s7);
  t('자동: 비밀 족보 vs 겹치기 중 이득이 큰 쪽 선택 (He+He)', d3.some(x => x.joke === 'HEHE') || getCell(s7, 0, 0, 0)?.lv === 2);
  // 자동 모드로 챕터 1 전체를 방치해도 오류 없이 끝남
  const g = createGame(54, { chapter: 1 }); let n = 0;
  while (g.phase !== 'over' && g.phase !== 'won' && n++ < 3000) { autoPlay(g); step(g); }
  t('자동: 챕터 1 방치 플레이가 끝까지 진행', g.phase === 'won' || g.phase === 'over');
}
// 성장(메타) 시스템
{
  const p = META.newProfile(); p.gold = 1000;
  const c0 = META.upgradeCost('atk', 0);
  t('강화 구매: 골드 차감 + 레벨업', META.buyUpgrade(p, 'atk').ok && p.upgrades.atk === 1 && p.gold === 1000 - c0);
  t('강화 비용은 레벨마다 증가', META.upgradeCost('atk', 5) > META.upgradeCost('atk', 4));
  p.upgrades.drop = 4; t('최대 레벨 강화는 구매 불가', !META.buyUpgrade(p, 'drop').ok);
  const g1 = createGame(61, { chapter: 1, autoField: false });
  const g2 = createGame(61, { chapter: 1, autoField: false, mods: META.modsOf({ ...META.newProfile(), upgrades: { ...META.newProfile().upgrades, atk: 10 } }) });
  put(g1, 'FIRE', 0, 0, 0); put(g2, 'FIRE', 0, 0, 0);
  t('공격력 강화 10레벨 = 슬라임 공격 2배', Math.abs(getCell(g2, 0, 0, 0).atk / getCell(g1, 0, 0, 0).atk - 2) < 0.01);
  const prof = META.newProfile(); prof.upgrades.hp = 5; setMods(g1, META.modsOf(prof));
  t('게임 중 강화 즉시 반영 (체력 +50%)', Math.abs(getCell(g1, 0, 0, 0).maxhp / getCell(g2, 0, 0, 0).maxhp - 1.5) < 0.05);
  const d = createGame(62, { chapter: 2, deck: ['FIRE', 'WATER', 'ELEC', 'N'] });
  for (let i = 0; i < 60; i++) step(d);
  t('덱 편성: 덱에 있는 슬라임만 지급', d.cells.flat(2).filter(Boolean).every(sl => ['FIRE', 'WATER', 'ELEC', 'N'].includes(sl.key) || sl.kind !== 'element') && d.queue.every(q => ['FIRE', 'WATER', 'ELEC', 'N'].includes(q.sym)));
  const tw = createGame(63, { tower: 1, autoField: false }); tw.prepLeft = 1; step(tw); tw.spawnList = []; tw.goblins = []; step(tw);
  t('무한의 탑: 층을 깨면 다음 층으로 (끝나지 않음)', tw.tower && tw.round === 2 && tw.phase === 'prep');
  const w1 = createGame(64, { tower: 1 }), w9 = createGame(64, { tower: 9 });
  for (const w of [w1, w9]) { w.prepLeft = 1; step(w); w.spawnList = ['fighter']; step(w); }
  t('무한의 탑: 높은 층 고블린이 더 강함', w9.goblins[0].maxhp > w1.goblins[0].maxhp * 2);
  const pr = META.newProfile(); pr.towerBest = 20; pr.gold = 999; pr.upgrades.atk = 7; pr.research.fire = 2;
  const r = META.prestige(pr);
  t('환생: 현자의 돌 획득, 골드·강화 초기화, 연구 유지', r.ok && pr.stones === 8 && pr.gold === 0 && pr.upgrades.atk === 0 && pr.research.fire === 2);
  t('환생: 같은 기록으로 반복 환생 불가', !META.prestige(pr).ok);
  const of = META.newProfile(); of.goldRate = 120; of.lastSeen = Date.now() - 3600 * 1000;
  t('오프라인 보상: 1시간 x 분당 120 x 20% = 1440', META.offlineReward(of).gold === 1440);
  of.lastSeen = Date.now() - 10 * 3600 * 1000;
  t('오프라인 보상: 최대 4시간에서 잘림', META.offlineReward(of).gold === 120 * 4 * 60 * 0.2);
  t('숫자 줄임 표시', META.fmt(1234) === '1.2K' && META.fmt(2500000) === '2.5M' && META.fmt(999) === '999');
  const gg = createGame(65, { chapter: 1 }); let n2 = 0; while (gg.phase !== 'over' && gg.phase !== 'won' && n2++ < 3000) { autoPlay(gg); step(gg); }
  t('챕터 플레이로 골드 획득', gg.gold > 0);
}
// 그림 목록: 모든 고블린·슬라임 그림이 게임 로드 목록에 있고 파일도 존재
{
  const { ASSET_NAMES } = await import('../src/sprites.js');
  const need = [...Object.keys(GOBLINS).map(k => 'goblin_' + k), ...FUSIONS.map(f => 'slime_' + f.key), ...RECIPES.map(r => 'slime_' + r.key), ...JOKES.map(j => 'slime_' + j.key)];
  const notListed = need.filter(n => !ASSET_NAMES.includes(n));
  t(`게임 그림 목록에 고블린 ${Object.keys(GOBLINS).length}종·조합 슬라임 전부 포함${notListed.length ? ' (빠짐: ' + notListed.join(',') + ')' : ''}`, notListed.length === 0);
  const noFile = ASSET_NAMES.filter(n => !existsSync(new URL(`../assets/${n}.png`, import.meta.url)));
  t(`그림 목록의 파일이 모두 존재${noFile.length ? ' (없음: ' + noFile.join(',') + ')' : ''}`, noFile.length === 0);
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
  t('챕터 5 고블린 체력 >= 챕터 1', g5.goblins[0] && g1.goblins[0] && g5.goblins[0].maxhp >= g1.goblins[0].maxhp);
  // 챕터 난이도는 주로 구성에서 나온다: 같은 라운드의 일반 고블린 비율이 챕터 5가 더 낮음
  const normalShare = c => { const r = CHAPTERS[c - 1].rounds[7]; const tot = r.reduce((a, [, n]) => a + n, 0); return (r.find(([k]) => k === 'normal')?.[1] || 0) / tot; };
  t('챕터 5 8라운드는 챕터 1보다 강한 고블린 비율이 높음', normalShare(5) < normalShare(1));
}
// 온라인: 닉네임·내부 이메일·랭킹 점수 (네트워크 없이 순수 함수만)
{
  t('닉네임 한글 허용', ON.validNick('슬라임장인').ok);
  t('닉네임 1자 거부', !ON.validNick('슬').ok);
  t('닉네임 13자 거부', !ON.validNick('가나다라마바사아자차카타파').ok);
  t('닉네임 특수문자 거부', !ON.validNick('slime!').ok && !ON.validNick('a b').ok && !ON.validNick('ㅅㅅ').ok);
  t('닉네임 금칙어 거부', !ON.validNick('관리자킴').ok && !ON.validNick('AdminKim').ok);
  t('닉네임 키는 대소문자 무시', ON.nickKey('SlimeKim') === ON.nickKey('slimekim'));
  const em = ON.nickEmail('가나다라마바사아자차카타');
  t('내부 이메일 아이디 64자 이내 (한글 12자)', em.split('@')[0].length <= 64 && em.endsWith('@slime-goblin.firebaseapp.com'));
  t('내부 이메일 대소문자 무시·1:1', ON.nickEmail('Kim01') === ON.nickEmail('kim01') && ON.nickEmail('kim01') !== ON.nickEmail('kim02'));
  t('내부 이메일 형식', /^n[a-z2-7]+@/.test(ON.nickEmail('슬라임')));
  const t0 = Date.UTC(2026, 10, 26);
  t('랭킹: 높은 층이 위', ON.rankScore(20, t0 + 9e9) > ON.rankScore(19, t0));
  t('랭킹: 같은 층이면 먼저 달성이 위', ON.rankScore(20, t0) > ON.rankScore(20, t0 + 1000));
  t('랭킹 점수 범위 (규칙과 동일)', ON.rankScore(999, t0) < 1000 * 1e10 && ON.rankScore(999, t0) <= Number.MAX_SAFE_INTEGER && ON.rankScore(5, t0) >= 5e10);
  const list = ON.parseRanking({ a: { nick: 'A', floor: 10, at: t0, score: ON.rankScore(10, t0) }, b: { nick: 'B', floor: 12, at: t0, score: ON.rankScore(12, t0) }, bad: { nick: 1 } });
  t('랭킹 파싱·정렬·불량 데이터 제외', list.length === 2 && list[0].nick === 'B');
  t('계정 저장 왕복', (() => { const m = new Map(); const st = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; ON.saveAccount(st, { uid: 'u1', refreshToken: 'r', nick: 'k' }); const ok1 = ON.loadAccount(st)?.uid === 'u1'; ON.clearAccount(st); return ok1 && ON.loadAccount(st) === null; })());
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
