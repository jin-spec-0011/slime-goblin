// 헤드리스 게임 엔진 (DOM 의존 없음, Node에서 시뮬레이션 가능)
import { CFG, STATUS, ELEMENTS, RECIPES, FUSIONS, JOKES, ATTRS, GOBLINS, CHAPTERS, TOWER, GIANT_MAX, buildPath } from './data.js';

// 경로는 챕터마다 바뀐다. 다른 모듈이 같은 배열을 참조하므로 내용만 교체한다
export const PATH = buildPath('rows');
function setPath(kind) { const p = buildPath(kind); PATH.length = 0; PATH.push(...p); }
const EL = Object.fromEntries(ELEMENTS.map(e => [e.sym, e]));
const RC = Object.fromEntries(RECIPES.map(r => [r.key, r]));
export const lvMult = lv => 1 + CFG.LV_STEP * (lv - 1);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(seed = Date.now(), opts = {}) {
  const tower = opts.tower ? Math.max(1, opts.tower) : 0;   // 무한의 탑 시작 층 (0 = 일반 챕터)
  const chapter = tower ? CHAPTERS.length + 1 : Math.min(CHAPTERS.length, Math.max(1, opts.chapter || 1));
  const ch = tower ? TOWER : CHAPTERS[chapter - 1];
  setPath(ch.path);
  const mods = { ...DEFAULT_MODS, ...(opts.mods || {}) };
  const s = {
    seed, rng: mulberry32(seed), tick: 0, round: tower || 1, phase: 'prep', prepLeft: CFG.FIRST_PREP,
    event: null, baseHp: mods.baseHp, catalysts: CFG.CATALYST_START, mods, deck: opts.deck || null, tower: !!tower,
    gold: 0, crystals: 0, dropAcc: 0, autoRounds: new Set(),
    cells: Array.from({ length: CFG.D }, () => Array.from({ length: CFG.H }, () => Array(CFG.W).fill(null))),
    queue: [], goblins: [], spawnList: [], megas: [], nextId: 1, kills: 0, lost: 0,
    log: [], fx: [], counts: {}, autoField: opts.autoField ?? CFG.AUTO_FIELD, chapter, ch,
  };
  for (let i = 0; i < mods.startSlimes; i++) addQueue(s);
  rollRound(s);
  say(s, s.autoField ? '준비 단계: 슬라임이 필드에 랜덤 배치됩니다. 끌어서 겹치거나 옮기세요.' : '준비 단계: 슬라임을 배치하세요.');
  return s;
}

function say(s, msg) { s.log.push(msg); if (s.log.length > 40) s.log.shift(); }
const err = msg => ({ ok: false, msg });
const ok = (msg = '') => ({ ok: true, msg });

// ---------- 슬라임 생성/능력치 ----------
// 슬라임 능력치 (s = 슬라임). modAtk·modHp = 강화·연구 보정
function recalc(s) {
  const m = lvMult(s.lv);
  s.maxhp = Math.max(1, Math.round(s.base.hp * m * s.kindMul * (s.modHp || 1)));
  s.atk = s.base.atk * m * s.kindMul * (s.modAtk || 1);
  s.def = s.base.def * (1 + 0.25 * (s.lv - 1));
  s.hp = s.maxhp;
}

function makeElement(s, sym, lv = 1) {
  const e = EL[sym];
  const sl = {
    id: s.nextId++, kind: 'element', key: sym, label: e.label || sym, name: e.name, els: [sym], attrs: [e.attr], lv,
    base: { hp: e.hp, atk: e.atk, def: e.def }, status: [e.st], kindMul: 1,
    color: e.color, color2: null, cd: 0, sealed: 0,
  };
  applySlimeMods(s, sl); recalc(sl); return sl;
}

function makeCompound(s, rec, lv) {
  const sl = {
    id: s.nextId++, kind: 'compound', key: rec.key, label: rec.label, name: rec.name, els: Object.keys(rec.need),
    attrs: rec.attr ? [rec.attr] : [...new Set(Object.keys(rec.need).map(k => EL[k].attr))], lv,
    base: { hp: rec.hp, atk: rec.atk, def: rec.def }, status: [rec.st], kindMul: CFG.COMPOUND_MUL,
    color: rec.color, color2: null, cd: 0, sealed: 0,
  };
  applySlimeMods(s, sl); recalc(sl); return sl;
}

function makeMixture(s, counts, lv) {
  const syms = Object.keys(counts).sort();
  let n = 0; const base = { hp: 0, atk: 0, def: 0 };
  for (const sym of syms) {
    const c = counts[sym]; n += c;
    base.hp += EL[sym].hp * c; base.atk += EL[sym].atk * c; base.def += EL[sym].def * c;
  }
  base.hp /= n; base.atk /= n; base.def /= n;
  const top = [...syms].sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).slice(0, 2);
  const sl = {
    id: s.nextId++, kind: 'mixture', key: 'MIX:' + syms.join(','), label: syms.map(k => EL[k].label || k).join('+'), name: '혼합물', els: syms,
    attrs: [...new Set(syms.map(k => EL[k].attr))], lv,
    base, status: top.map(t => EL[t].st), kindMul: CFG.MIXTURE_MUL,
    color: EL[top[0]].color, color2: EL[top[top.length - 1]].color, cd: 0, sealed: 0,
  };
  applySlimeMods(s, sl); recalc(sl); return sl;
}

function makeFusion(s, fu, lv) {
  const sl = {
    id: s.nextId++, kind: 'fusion', key: fu.key, label: fu.label, name: fu.label, els: [], attrs: [...fu.pair], lv,
    base: { hp: fu.hp, atk: fu.atk, def: fu.def }, status: fu.st, kindMul: CFG.FUSION_MUL,
    pierce: !!fu.pierce, decay: !!fu.decay, color: fu.color, color2: ATTRS[fu.pair[1]].color, cd: 0, sealed: 0,
  };
  applySlimeMods(s, sl); recalc(sl); return sl;
}
function makeJoke(s, j, lv) {
  const syms = Object.keys(j.need);
  const sl = {
    id: s.nextId++, kind: 'joke', key: j.key, label: j.label, name: j.name, els: syms,
    attrs: [...new Set(syms.map(k => EL[k].attr))], lv,
    base: { hp: j.hp, atk: j.atk * CFG.JOKE_ATK_BUFF, def: j.def * CFG.JOKE_DEF_BUFF }, status: j.st, kindMul: CFG.JOKE_MUL,
    healAura: j.healAura || 0, color: j.color, color2: null, cd: 0, sealed: 0,
  };
  applySlimeMods(s, sl); recalc(sl); return sl;
}
const sameCounts = (a, b) => { const k = new Set([...Object.keys(a), ...Object.keys(b)]); for (const x of k) if ((a[x] || 0) !== (b[x] || 0)) return false; return true; };

const fusionOf = (a, b) => FUSIONS.find(f => (f.pair[0] === a && f.pair[1] === b) || (f.pair[0] === b && f.pair[1] === a)) || null;
// 조합 재료 키: 원소 슬라임은 자기 기호, 물 역할 화합물(H₂O)은 'WATER'로 취급. 그 외(조합·혼합물)는 재료 불가
const ACTS_AS = Object.fromEntries(RECIPES.filter(r => r.actsAs).map(r => [r.key, r.actsAs]));
export const ingKey = c => (!c ? null : c.kind === 'element' ? c.key : c.kind === 'compound' && ACTS_AS[c.key] ? ACTS_AS[c.key] : null);
const ingAttr = c => { const k = ingKey(c); return k ? EL[k].attr : null; };

// 강화(공격·체력) + 속성 연구(슬라임 속성들의 평균 배율)
export const DEFAULT_MODS = { atk: 1, hp: 1, attrAtk: {}, dropEvery: CFG.DROP_EVERY, catPerRound: 1, baseHp: CFG.BASE_HP, startSlimes: CFG.START_SLIMES, goldMul: 1, diffHp: 1, diffAtk: 1, diffGold: 1, diffBase: 1 };
function applySlimeMods(s, sl) {
  const at = sl.attrs.length ? sl.attrs.reduce((a, k) => a + (s.mods.attrAtk[k] || 1), 0) / sl.attrs.length : 1;
  sl.modAtk = s.mods.atk * at; sl.modHp = s.mods.hp;
}
// 게임 중 강화를 사면 즉시 반영 (필드 슬라임 재계산·회복, 거점 체력 증가분 추가)
export function setMods(s, mods) {
  const prevBase = s.mods.baseHp, keep = { diffHp: s.mods.diffHp, diffAtk: s.mods.diffAtk, diffGold: s.mods.diffGold, diffBase: s.mods.diffBase };
  s.mods = { ...DEFAULT_MODS, ...keep, ...mods };   // 적응형 난이도는 게임 시작 시 고정 (게임 중 강화로 바뀌지 않음)
  for (const k of Object.keys(keep)) if (mods[k] === undefined) s.mods[k] = keep[k];
  for (const sl of s.cells.flat(2)) if (sl) { applySlimeMods(s, sl); recalc(sl); }
  if (s.mods.baseHp > prevBase && s.phase !== 'over') s.baseHp += s.mods.baseHp - prevBase;   // v2.9.2: 거점 배율(범핑) 없음
}

// ---------- 지급 큐 ----------
// 슬라임 지급: 필드에 빈칸이 있으면 빈칸에 랜덤 배치. 필드가 가득 차면 덱에 쌓지 않고 (v2.9.1)
// 같은 원소 슬라임(Lv5 미만, 경로 앞쪽 우선)에 자동으로 겹치고, 겹칠 곳도 없으면 지급되지 않는다
function addQueue(s) {
  let pool = ELEMENTS.filter(e => !e.noDrop && (s.ch.unlockAll || e.unlock <= s.round));
  if (s.deck && s.deck.length) { const d = pool.filter(e => s.deck.includes(e.sym)); if (d.length) pool = d; } // 덱 편성
  const e = pool[Math.floor(s.rng() * pool.length)];
  if (s.autoField) {
    const empty = [];
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) if (!s.cells[0][y][x]) empty.push([x, y]);
    if (empty.length && slimeCount(s) < CFG.CAP) {
      const [x, y] = empty[Math.floor(s.rng() * empty.length)];
      s.cells[0][y][x] = makeElement(s, e.sym);
      s.fx.push({ k: 'drop', x, y });
      computeCounts(s);
      return true;
    }
    for (const [x, y] of PATH) {
      const c = s.cells[0][y][x];
      if (c && c.kind === 'element' && c.key === e.sym && c.lv < CFG.MAX_LV) { c.lv += 1; recalc(c); s.fx.push({ k: 'drop', x, y }); computeCounts(s); return true; }
    }
    s.lost++; return false;
  }
  if (s.queue.length >= CFG.QUEUE_MAX) { s.lost++; return false; }
  s.queue.push({ id: s.nextId++, sym: e.sym });
  return true;
}

// ---------- 그리드 헬퍼 ----------
export const slimeCount = s => s.cells.flat(2).filter(Boolean).length;
export const getCell = (s, x, y, z) => s.cells[z]?.[y]?.[x] ?? null;

export function columnSlimes(s, x, y) {
  const out = [];
  for (let z = 0; z < CFG.D; z++) { const c = s.cells[z][y][x]; if (c) out.push(c); }
  return out;
}
export const megaAt = (s, x, y) => s.megas.find(m => x >= m.zx && x < m.zx + 3 && y >= m.zy && y < m.zy + 3) || null;
const trapAt = (s, x, y) => columnSlimes(s, x, y).length > 0 || !!megaAt(s, x, y);

function removeSlime(s, sl) {
  for (let z = 0; z < CFG.D; z++) for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
    if (s.cells[z][y][x] === sl) s.cells[z][y][x] = null;
}

// 속성별 배치 수 (슬라임 하나가 여러 속성이면 각각 1씩)
function computeCounts(s) {
  const c = {};
  for (const sl of s.cells.flat(2)) if (sl) for (const a of sl.attrs) c[a] = (c[a] || 0) + 1;
  s.counts = c; return c;
}
const sameAttr = (a, b) => a.attrs.some(x => b.attrs.includes(x));

function bonus(s, sl, col) {
  let atk = 1, take = 1;
  for (const a of sl.attrs) atk *= s.ch.boost[a] || 1; // 챕터 환경 효과
  const cnt = Math.max(0, ...sl.attrs.map(a => s.counts[a] || 0));
  if (cnt >= 3) atk *= CFG.GROUP3_ATK;
  if (cnt >= 2) take *= CFG.GROUP2_TAKEN;
  if (col.filter(c => sameAttr(c, sl)).length >= 3) atk *= CFG.COLUMN_ATK; // col = 같은 가로줄 슬라임
  return { atk, take };
}

// 속성 상성: 고블린 약점 속성이면 x1.5, 내성 속성이면 x0.5 (약점 우선)
export function affinity(sl, g) {
  if (sl.attrs.some(a => g.weak.includes(a))) return CFG.WEAK_MUL;
  if (sl.attrs.some(a => g.resist.includes(a))) return CFG.RESIST_MUL;
  return 1;
}

// ---------- 플레이어 행동 ----------
export function placeFromQueue(s, qi, x, y, z) {
  const q = s.queue[qi];
  if (!q) return err('대기 슬라임이 없습니다.');
  const cur = getCell(s, x, y, z);
  if (cur) {
    if (cur.kind !== 'element' || cur.key !== q.sym) return err('같은 슬라임에만 겹칠 수 있습니다.');
    if (cur.lv >= CFG.MAX_LV) return err('이미 최대 레벨입니다.');
    cur.lv += 1; recalc(cur); s.queue.splice(qi, 1);
    return ok(`${cur.label} Lv${cur.lv}`);
  }
  if (slimeCount(s) >= CFG.CAP) return err(`배치 상한(${CFG.CAP})입니다.`);
  s.cells[z][y][x] = makeElement(s, q.sym); s.queue.splice(qi, 1);
  computeCounts(s);
  return ok(`${EL[q.sym].label || q.sym} 배치`);
}

export function moveSlime(s, a, b) {
  if (a.x === b.x && a.y === b.y && a.z === b.z) return err('같은 칸입니다.');
  const A = getCell(s, a.x, a.y, a.z); if (!A) return err('이동할 슬라임이 없습니다.');
  const B = getCell(s, b.x, b.y, b.z);
  if (!B) { s.cells[b.z][b.y][b.x] = A; s.cells[a.z][a.y][a.x] = null; return ok('이동'); }
  const stackable = A.key === B.key && (A.kind === 'element' || A.kind === 'compound' || A.kind === 'fusion' || A.kind === 'joke');
  if (stackable) {
    if (A.lv + B.lv > CFG.MAX_LV) return err('합치면 Lv5를 초과합니다.');
    B.lv += A.lv; recalc(B); s.cells[a.z][a.y][a.x] = null; computeCounts(s);
    return ok(`${B.label} Lv${B.lv}`);
  }
  s.cells[b.z][b.y][b.x] = A; s.cells[a.z][a.y][a.x] = B; return ok('위치 교환');
}

export function recipeHint(s, list) {
  const sl = list.map(p => getCell(s, p.x, p.y, p.z)).filter(Boolean);
  if (sl.length < 2) return { state: 'none', text: '슬라임 2개 이상을 선택하세요.' };
  if (sl.some(c => !ingKey(c))) return { state: 'bad', text: '원소·속성 슬라임(과 물 역할 H₂O)만 조합할 수 있습니다.' };
  const cnt = {}; sl.forEach(c => { const k = ingKey(c); cnt[k] = (cnt[k] || 0) + 1; });
  // 0) 비밀 족보 (말장난 화학식) - 정확히 일치하면 최우선. 이름은 만들기 전까지 숨김
  const joke = JOKES.find(j => sameCounts(j.need, cnt));
  if (joke) return { state: 'joke', joke, text: '✨ 뭔가 특별한 반응이 일어날 것 같다...' };
  if (Object.keys(cnt).length < 2) return { state: 'bad', text: '같은 슬라임은 겹치기로 성장합니다.' };
  // 1) 화학 족보 정확히 일치 -> 화합물 150%
  let best = null;
  for (const r of RECIPES) {
    const keys = new Set([...Object.keys(cnt), ...Object.keys(r.need)]);
    let diff = 0; for (const k of keys) diff += Math.abs((cnt[k] || 0) - (r.need[k] || 0));
    if (!best || diff < best.diff) best = { r, diff };
  }
  if (best.diff === 0) return { state: 'match', recipe: best.r, text: `${best.r.label} ${best.r.name} (화학 족보 150%)` };
  // 2) 서로 다른 속성 슬라임 2마리 -> 속성 합성
  if (sl.length === 2 && ingAttr(sl[0]) !== ingAttr(sl[1])) {
    const fu = fusionOf(ingAttr(sl[0]), ingAttr(sl[1]));
    if (fu) return { state: 'fusion', fusion: fu, text: `${ATTRS[fu.pair[0]].label} + ${ATTRS[fu.pair[1]].label} = ${fu.label} (속성 합성 ${Math.round(CFG.FUSION_MUL * 100)}%)` };
  }
  // 3) 그 외 -> 혼합물 70%
  const fmt = r => Object.entries(r.need).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(' + ');
  if (best.diff <= 2) return { state: 'near', text: `혼합물(70%) · ${best.r.label} 거의 맞음: ${fmt(best.r)}` };
  return { state: 'mix', text: '혼합물(70%) 생성 · 속성 합성은 서로 다른 속성 2마리' };
}

// 튜토리얼 추천: 필드에서 지금 바로 만들 수 있는 화학 족보 (비밀 족보와 겹치는 조합은 숨김)
// list[0]은 경로 가장 앞쪽 재료 = 결과가 놓이는 자리
export function craftable(s) {
  const pool = {};
  for (const [i, [x, y]] of PATH.entries()) { const c = getCell(s, x, y, 0), k = ingKey(c); if (k) (pool[k] ||= []).push({ x, y, z: 0, idx: i }); }
  const out = [];
  for (const r of RECIPES) {
    if (!Object.entries(r.need).every(([k, n]) => (pool[k]?.length || 0) >= n)) continue;
    if (JOKES.some(j => sameCounts(j.need, r.need))) continue;
    const list = Object.entries(r.need).flatMap(([k, n]) => pool[k].slice(0, n)).sort((a, b) => a.idx - b.idx);
    out.push({ recipe: r, list: list.map(({ x, y, z }) => ({ x, y, z })) });
  }
  return out;
}
export function combine(s, list) {
  if (s.catalysts < 1) return err('촉매가 없습니다.');
  const h = recipeHint(s, list);
  if (h.state === 'none' || h.state === 'bad') return err(h.text);
  const sl = list.map(p => getCell(s, p.x, p.y, p.z));
  const cnt = {}; sl.forEach(c => { const k = ingKey(c); cnt[k] = (cnt[k] || 0) + 1; });
  const lv = Math.min(CFG.MAX_LV, Math.ceil(sl.reduce((a, c) => a + c.lv, 0) / sl.length));
  const res = h.state === 'joke' ? makeJoke(s, h.joke, lv)
    : h.state === 'match' ? makeCompound(s, h.recipe, lv)
    : h.state === 'fusion' ? makeFusion(s, h.fusion, lv) : makeMixture(s, cnt, lv);
  // 비밀 족보의 '만드는 순간' 효과
  const oc = h.state === 'joke' ? h.joke.onCreate : null;
  if (oc?.baseHp) { s.baseHp += oc.baseHp; say(s, `${res.name}: 거점 +${oc.baseHp}`); }
  if (oc?.catalysts) { s.catalysts += oc.catalysts; say(s, `${res.name}: 선물로 촉매 +${oc.catalysts}`); }
  list.forEach(p => { s.cells[p.z][p.y][p.x] = null; });
  const p0 = list[0]; s.cells[p0.z][p0.y][p0.x] = res;
  s.catalysts--; computeCounts(s);
  if (h.state === 'joke') return { ok: true, msg: `🎉 비밀 족보 발견! ${res.label} ${res.name}`, joke: h.joke.key };
  return ok(h.state === 'match' ? `${res.label} 합성 성공!` : h.state === 'fusion' ? `속성 합성: ${res.label}!` : `혼합물 ${res.label} 생성`);
}

const COMBO_KINDS = ['compound', 'fusion', 'joke'];
export const isComboMegaable = sl => !!sl && COMBO_KINDS.includes(sl.kind);
export const comboMegaCount = s => s.megas.filter(m => m.combo).length;

// 메가 슬라임: Lv5 같은 슬라임 3개 -> 3x3 구역
//  - 원소(순수 속성 포함): 제한 없음
//  - 조합(화학 족보·비밀 족보·속성 합성): 동시에 COMBO_MEGA_MAX마리까지, 파괴되면 다시 만들 수 있음
export function makeMega(s, list) {
  if (s.round < CFG.MEGA_ROUND && !s.tower) return err(`메가 슬라임은 ${CFG.MEGA_ROUND}라운드부터 사용 가능합니다.`);
  if (list.length !== 3) return err('Lv5 같은 슬라임 3개를 선택하세요.');
  const sl = list.map(p => getCell(s, p.x, p.y, p.z));
  if (sl.some(c => !c || (c.kind !== 'element' && !isComboMegaable(c)))) return err('원소 또는 조합 슬라임만 메가가 됩니다 (혼합물 불가).');
  if (sl.some(c => c.lv < CFG.MAX_LV)) return err('Lv5 슬라임만 가능합니다.');
  if (!(sl[0].key === sl[1].key && sl[1].key === sl[2].key)) return err('같은 슬라임 3개여야 합니다.');
  const combo = sl[0].kind !== 'element';
  if (combo && comboMegaCount(s) >= CFG.COMBO_MEGA_MAX) return err(`조합 메가는 동시에 ${CFG.COMBO_MEGA_MAX}마리만 가능합니다. 파괴되면 다시 만들 수 있습니다.`);
  const m = lvMult(CFG.MAX_LV), src = sl[0];
  const zx = Math.min(Math.max(list[0].x - 1, 0), CFG.W - 3), zy = Math.min(Math.max(list[0].y - 1, 0), CFG.H - 3);
  let mega;
  if (!combo) {
    const e = EL[src.key];
    mega = {
      id: s.nextId++, kind: 'mega', key: src.key + 'M', label: e.label || src.key, name: `메가 ${e.name}`, els: [src.key], attrs: [e.attr], lv: 6,
      maxhp: Math.round(3 * e.hp * m * CFG.MEGA_MUL * 2 * s.mods.hp), atk: e.atk * m * CFG.MEGA_ATK * s.mods.atk * (s.mods.attrAtk[e.attr] || 1),
      def: e.def * (1 + 0.25 * (CFG.MAX_LV - 1)) * 1.5, status: [e.st], color: e.color, zx, zy, cd: 0, sealed: 0,
    };
  } else {
    const b = src.base, km = src.kindMul || 1;
    const research = src.attrs.reduce((a, at) => a + (s.mods.attrAtk[at] || 1), 0) / src.attrs.length;
    mega = {
      id: s.nextId++, kind: 'mega', combo: true, artKey: src.key, key: src.key + 'M', label: src.label, name: `메가 ${src.name}`, els: src.els, attrs: src.attrs, lv: 6,
      maxhp: Math.round(3 * b.hp * km * m * CFG.MEGA_MUL * 2 * CFG.COMBO_MEGA_HP * s.mods.hp), atk: b.atk * km * m * CFG.COMBO_MEGA_ATK * s.mods.atk * research,
      def: b.def * (1 + 0.25 * (CFG.MAX_LV - 1)) * 1.5, status: src.status, pierce: !!src.pierce, color: src.color, zx, zy, cd: 0, sealed: 0,
    };
  }
  mega.hp = mega.maxhp;
  list.forEach(p => { s.cells[p.z][p.y][p.x] = null; });
  s.megas.push(mega); computeCounts(s);
  say(s, `${mega.name} 슬라임 가동! (구역 ${zx + 1},${zy + 1} 기준 3×3)`);
  return ok(combo ? `조합 메가 생성: ${mega.name}` : '메가 슬라임 생성');
}

// =====================================================================
// 자동 조합 (방치형): 필드·덱 전체에서 '가장 이득이 큰 행동'을 골라 실행
//  - 슬라임 가치 = 공격력 x 지금 라운드 고블린 상성 평균 x 효과 보너스 + 체력·방어 보정
//  - 경로 앞쪽 칸(먼저 부딪히는 자리)일수록 가중치가 높다
//  - 후보 행동: 덱 카드 배치/겹치기, 필드 겹치기, 조합(비밀 족보·화학 족보·속성 합성), 메가
// =====================================================================
const pathIdxOf = (x, y) => PATH.findIndex(p => p[0] === x && p[1] === y);
const posW = idx => 1.6 - (idx / Math.max(1, PATH.length - 1)) * 1.1;      // 앞 1.6 -> 뒤 0.5
function roundFoes(s) {                                                     // 이번(또는 다음) 라운드 고블린 구성
  const r = s.ch.rounds[Math.min(CFG.ROUNDS, s.round) - 1] || [];
  return r.map(([type, n]) => ({ n, weak: GOBLINS[type].weak || [], resist: GOBLINS[type].resist || [] }));
}
function slimeValue(s, sl, foes) {
  let aff = 1;
  if (foes.length) { let w = 0, sum = 0; for (const f of foes) { sum += affinity(sl, f) * f.n; w += f.n; } aff = sum / w; }
  const fx = 1 + 0.15 * sl.status.length + (sl.pierce ? 0.3 : 0) + (sl.healAura ? 0.4 : 0) - (sl.decay ? 0.15 : 0)
    + sl.status.reduce((a, st) => a + (st.aoe ? 0.2 : 0) + (STATUS[st.name].kind === 'explode' ? 0.25 : 0), 0);
  return sl.atk * aff * fx + sl.maxhp * 0.06 + sl.def * 0.6;
}
// 비어 있는 칸은 곧 랜덤 슬라임으로 채워지므로 그 기대 가치를 더해준다
const refillValue = s => (s.autoField ? 3.2 : 0);

function bestAutoAction(s) {
  const foes = roundFoes(s), V = (sl, idx) => slimeValue(s, sl, foes) * posW(idx);
  const cells = [];
  for (const [i, [x, y]] of PATH.entries()) { const sl = s.cells[0][y][x]; cells.push({ x, y, z: 0, idx: i, sl }); }
  const filled = cells.filter(c => c.sl), empty = cells.filter(c => !c.sl);
  let best = null;
  const offer = (gain, run, msg) => { if (gain > 0.5 && (!best || gain > best.gain)) best = { gain, run, msg }; };
  const levelUp = (sl, add) => { const c = { ...sl, lv: sl.lv + add, maxhp: 0 }; recalc(c); return c; };

  // 1) 덱 카드: 같은 슬라임 위에 겹치기(가장 앞쪽 우선) 또는 빈칸 중 가장 앞쪽에 배치
  s.queue.forEach((q, qi) => {
    for (const c of filled) if (c.sl.kind === 'element' && c.sl.key === q.sym && c.sl.lv < CFG.MAX_LV)
      offer(V(levelUp(c.sl, 1), c.idx) - V(c.sl, c.idx) + 0.3, () => placeFromQueue(s, s.queue.findIndex(v => v.id === q.id), c.x, c.y, 0), `덱 ${q.sym} → 겹치기`);
    if (empty.length && slimeCount(s) < CFG.CAP) { const c = empty[0]; const tmp = makeElement(s, q.sym);
      offer(V(tmp, c.idx), () => placeFromQueue(s, s.queue.findIndex(v => v.id === q.id), c.x, c.y, 0), `덱 ${q.sym} 배치`); }
  });
  // 2) 필드 겹치기: 뒤쪽 슬라임을 앞쪽 같은 슬라임 위로
  for (const a of filled) for (const b of filled) {
    if (a === b || a.idx > b.idx || a.sl.key !== b.sl.key || a.sl.lv + b.sl.lv > CFG.MAX_LV) continue;
    if (!['element', 'compound', 'fusion', 'joke'].includes(a.sl.kind)) continue;
    offer(V(levelUp(a.sl, b.sl.lv), a.idx) - V(a.sl, a.idx) - V(b.sl, b.idx) + refillValue(s) * posW(b.idx),
      () => moveSlime(s, b, a), `${a.sl.label} 겹치기 Lv${a.sl.lv + b.sl.lv}`);
  }
  // 3) 조합 (촉매 1개): 결과 가치 - 재료 가치 + 빈칸 재충전. 결과는 재료 중 가장 앞쪽 칸에 생긴다
  if (s.catalysts > 0) {
    const els = filled.filter(c => ingKey(c.sl));
    const tryList = list => {
      list.sort((p, q) => p.idx - q.idx);
      const h = recipeHint(s, list); if (!['joke', 'match', 'fusion'].includes(h.state)) return;
      const lv = Math.min(CFG.MAX_LV, Math.ceil(list.reduce((a, c) => a + c.sl.lv, 0) / list.length));
      const res = h.state === 'joke' ? makeJoke(s, h.joke, lv) : h.state === 'match' ? makeCompound(s, h.recipe, lv) : makeFusion(s, h.fusion, lv);
      let gain = V(res, list[0].idx) - list.reduce((a, c) => a + V(c.sl, c.idx), 0) + refillValue(s) * list.slice(1).reduce((a, c) => a + posW(c.idx), 0);
      if (h.state === 'joke' && h.joke.onCreate) gain += (h.joke.onCreate.baseHp || 0) * 2 + (h.joke.onCreate.catalysts || 0) * 3;
      const label = res.label;
      offer(gain, () => combine(s, list.map(({ x, y, z }) => ({ x, y, z }))), `자동 조합: ${label}`);
    };
    // 3-1) 정해진 재료가 있는 족보(비밀·화학): 원소별로 레벨 높은 순 후보에서 필요 수만큼
    for (const r of [...JOKES, ...RECIPES]) {
      const pick = []; let okAll = true;
      for (const [k, n] of Object.entries(r.need)) {
        const cand = els.filter(c => ingKey(c.sl) === k && !pick.includes(c)).sort((p, q) => q.sl.lv - p.sl.lv || p.idx - q.idx);
        if (cand.length < n) { okAll = false; break; } pick.push(...cand.slice(0, n));
      }
      if (okAll) tryList(pick);
    }
    // 3-2) 속성 합성: 서로 다른 속성 2마리의 모든 쌍
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++)
      if (ingAttr(els[i].sl) !== ingAttr(els[j].sl)) tryList([els[i], els[j]]);
  }
  // 4) 메가: Lv5 같은 원소 3개 (가장 앞쪽 3개), 조합 슬라임은 동시에 1마리까지
  if (s.round >= CFG.MEGA_ROUND || s.tower) {
    const by = {};
    const comboOk = comboMegaCount(s) < CFG.COMBO_MEGA_MAX;
    for (const c of filled) if (c.sl.lv === CFG.MAX_LV && (c.sl.kind === 'element' || (comboOk && isComboMegaable(c.sl)))) (by[c.sl.key] ||= []).push(c);
    for (const k in by) if (by[k].length >= 3) {
      const three = by[k].slice(0, 3);
      offer(three.reduce((a, c) => a + V(c.sl, c.idx), 0) * 0.8 + refillValue(s) * 3, () => makeMega(s, three.map(({ x, y, z }) => ({ x, y, z }))), `메가 ${k}`);
    }
  }
  return best;
}

// 한 번 호출에 최대 maxActions번, 이득이 있는 행동이 없을 때까지 실행. 실행한 행동 결과 목록 반환
export function autoPlay(s, maxActions = 4) {
  const done = [];
  if (s.phase === 'over' || s.phase === 'won') return done;
  for (let k = 0; k < maxActions; k++) {
    const a = bestAutoAction(s); if (!a) break;
    const r = a.run(); if (!r || !r.ok) break;
    done.push({ msg: r.msg || a.msg, joke: r.joke || null });
    s.autoRounds.add(s.round);
  }
  return done;
}

export function skipPrep(s) {
  if (s.phase === 'prep') { s.prepLeft = 0; return ok('라운드 시작'); }
  return err('이미 진행 중입니다.');
}

// 골드: 기준값 x 라운드(층) 성장 x 챕터 배율 x 현자의 돌
function goldFor(s, base) {
  const prog = s.tower ? 1 + 0.2 * (CFG.ROUNDS - 1) : 1 + 0.2 * (s.round - 1);
  const chMul = s.tower ? s.ch.goldMul * Math.pow(CFG.TOWER_GOLD_GROWTH, s.round - 1) : s.ch.goldMul;
  return Math.round(base * prog * chMul * s.mods.goldMul * (s.tower ? 1 : s.mods.diffGold || 1) * CFG.GOLD_SCALE);
}
// 무한의 탑 층별 편성: 모든 종류 섞임, 층이 오를수록 수·오우거 증가
export const TOWER_GIANT_EVERY = 4;
export function towerRound(floor) {
  const total = Math.min(60, 34 + floor), giants = Math.min(GIANT_MAX, Math.ceil(floor / TOWER_GIANT_EVERY));   // 오우거: 4층마다 1마리씩 늘어 최대 5
  const types = Object.keys(GOBLINS).filter(k => k !== 'giant' && !GOBLINS[k].boss), each = Math.floor((total - giants) / types.length);
  const row = types.map(k => [k, each]); row[0][1] += total - giants - each * types.length;
  row.push(['giant', giants]);
  return row;
}

// ---------- 고블린 ----------
// 챕터 (v2.10.0): 1~9라운드는 기본 (1초 1마리 · 칸당 1마리 · 오우거·폭식 없음 · 물량 x1)
//   X-5: 중간 보스 고블린 왕 · X-10: 오우거 / 폭식 / 군단 / 물량 2배 중 하나가 랜덤 이벤트로 등장
// 무한의 탑: 10층마다 한 단계씩 (1~10층 기본 · 11층 군단 · 21층 오우거 · 31층 폭식 · 41층~ 물량 x2), 10층 단위로 보스
export const STAGE_MAX = 4, MID_BOSS_ROUND = 5;
export const TOWER_STAGE_FLOORS = 10;
export const towerStage = floor => Math.min(STAGE_MAX, Math.floor((floor - 1) / TOWER_STAGE_FLOORS));
export const EVENTS = ['ogre', 'glutton', 'horde', 'double'];
export const EVENT_INFO = {
  ogre: { icon: '🪓', name: '오우거', msg: '오우거 등장! 모든 슬라임과 싸우는 거인' },
  glutton: { icon: '😋', name: '폭식 고블린', msg: '폭식 고블린 등장! Lv2 이하 슬라임을 먹어 치웁니다' },
  horde: { icon: '⚔', name: '군단', msg: '군단! 1초에 3마리, 한 칸에 3마리씩 몰려옵니다' },
  double: { icon: '📈', name: '물량 2배', msg: '물량 2배! 이번 라운드 고블린 수가 2배' },
};
// 이번 라운드(층)에 켜진 특수 요소
export function feat(s) {
  if (s.tower) { const st = towerStage(s.round); return { horde: st >= 1, ogre: st >= 2, glutton: st >= 3, double: st >= 4 }; }
  const e = s.round === CFG.ROUNDS ? s.event : null;
  return { horde: e === 'horde', ogre: e === 'ogre', glutton: e === 'glutton', double: e === 'double' };
}
export const surfaceCap = s => (feat(s).horde ? CFG.SURFACE_CAP : 1);
const spawnPerTick = s => (feat(s).horde ? CFG.SPAWN_PER_TICK : 1);
function buildSpawn(s, round) {
  const f = feat(s), base = s.tower ? towerRound(round) : s.ch.rounds[round - 1];
  // 오우거·폭식은 켜진 라운드에만 (꺼져 있으면 오우거는 빠지고, 폭식은 같은 수의 일반 고블린)
  const table = base.filter(([t]) => f.ogre || t !== 'giant').map(([t, n]) => [t === 'glutton' && !f.glutton ? 'normal' : t, n]);
  if (f.ogre && !table.some(([t]) => t === 'giant')) table.push(['giant', 1]);
  if (f.glutton && !table.some(([t]) => t === 'glutton')) table.push(['glutton', 2]);
  // 물량 배율 (오우거·보스 수는 그대로)
  const mul = f.double ? CFG.SPAWN_COUNT_MUL : 1;
  const groups = table.map(([t, n]) => Array(t === 'giant' ? n : Math.round(n * mul)).fill(t));
  const out = []; let more = true;
  while (more) { more = false; for (const g of groups) if (g.length) { out.push(g.shift()); more = true; } }
  // 보스(고블린 왕): 챕터는 X-5 중간 보스, 무한의 탑은 10층 단위. 준비 단계에서 미리 정해 경고를 띄운다
  if (s.bossRound === round) out.splice(Math.floor(out.length / 2), 0, 'king');
  return out;
}

function makeGoblin(s, type) {
  const d = GOBLINS[type], r = s.tower ? CFG.ROUNDS - 1 : s.round - 1;
  // 챕터 배율은 라운드가 갈수록 커진다: 1라운드 30% 적용 -> 10라운드 100% (초반 붕괴 방지)
  const ramp = 0.3 + 0.7 * (r / (CFG.ROUNDS - 1));
  const towerMul = s.tower ? Math.pow(CFG.TOWER_GROWTH, s.round - 1) : 1; // 무한의 탑: 층마다 성장
  let hpMul = (1 + (s.ch.hpMul - 1) * ramp) * towerMul, atkMul = (1 + (s.ch.atkMul - 1) * ramp) * Math.sqrt(towerMul);
  // 오우거(chAnchor): 챕터 1 배율을 기준점으로 나눈다 -> 챕터 1에서는 항상 기본 능력치(Lv5 약 5마리로 막힘),
  // 챕터 2~5는 챕터 1 대비 배율만큼만 강해진다. 챕터 밸런스를 다시 맞춰도 오우거 세기가 흔들리지 않음
  if (d.chAnchor && !s.tower) { hpMul = 1; atkMul = 1; }   // v2.9.2: 오우거는 챕터 배율 없이 고정 능력치 (라운드 성장·적응형만)
  if (!s.tower) { hpMul *= s.mods.diffHp || 1; atkMul *= s.mods.diffAtk || 1; } // 적응형 난이도 (플레이어 전투력 비례)
  const hp = Math.round(d.hp * Math.pow(CFG.HP_GROWTH, r) * hpMul);
  return {
    id: s.nextId++, type, name: d.name, ch: d.ch, color: d.color, hp, maxhp: hp,
    atk: d.atk * (1 + CFG.ATK_GROWTH * r) * atkMul * (d.chAnchor ? 1 : CFG.GOBLIN_ATK_MUL), def: d.def + Math.floor(r / 3), spd: d.spd, leak: d.leak,
    multi: d.multi || 1, range: d.range || 0, aura: !!d.aura, evade: d.evade || 0, cleanse: !!d.cleanse,
    weak: d.weak || [], resist: d.resist || [], immune: d.immune || [], heal: d.heal || 0, feast: d.feast || 0, lv5Only: !!d.lv5Only, megaStomp: !!d.megaStomp, eatLv: d.eatLv || 0, stRes: d.stRes || null, atkBuff: 1,
    idx: 0, pit: false, st: {}, fights: 0, dead: false,
  };
}

// 지표면(걷는 고블린)과 구덩이(빠진 고블린)를 따로 점유한다.
// 구덩이는 칸마다 1마리만 빠지고, 뒤따르는 고블린은 그 위를 지나 다음 칸으로 진행한다.
// 지표면 점유: 한 칸에 SURFACE_CAP마리까지 나란히 걸을 수 있다 (2칸 크기 고블린은 칸 하나를 다 차지)
const laneW = (s, g) => ((GOBLINS[g.type].size || 1) > 1 ? surfaceCap(s) : 1);
const surfaceOcc = (s, idx, add = 1) => s.goblins.reduce((n, g) => n + (!g.dead && !g.pit && g.idx === idx ? laneW(s, g) : 0), 0) + add > surfaceCap(s);
const pitOcc = (s, idx, self = null) => s.goblins.some(g => !g.dead && g.pit && g.idx === idx && g !== self);

// 준비 단계 시작 시 이번 라운드(층)의 보스·이벤트를 미리 정하고 경고 메시지
export function rollRound(s) {
  const r = s.round, boss = s.tower ? r % TOWER_STAGE_FLOORS === 0 : r === MID_BOSS_ROUND;
  s.bossRound = boss ? r : 0; s.bossNear = false;
  if (boss) { say(s, `👑 경고! 이번 ${s.tower ? '층' : '라운드'}에 ${s.tower ? '' : '중간 '}보스 고블린 왕이 나타납니다`); s.fx.push({ k: 'boss', t: 'prep' }); }
  if (!s.tower && r === CFG.ROUNDS) {
    s.event = EVENTS[Math.floor(s.rng() * EVENTS.length)];
    const e = EVENT_INFO[s.event]; say(s, `${e.icon} ${r}라운드 이벤트: ${e.msg}`); s.fx.push({ k: 'event', e: s.event });
  }
}
export const rollBoss = rollRound;
function startRound(s) {
  s.phase = 'run'; s.spawnList = buildSpawn(s, s.round);
  say(s, `라운드 ${s.round} 시작! 고블린 ${s.spawnList.length}마리`);
}

// 오우거(lv5Only): Lv1~4 슬라임에게서는 어떤 피해·효과도 받지 않는다 (메가는 예외)
// 폭식(eatLv): Lv(eatLv) 이하 슬라임에게서는 어떤 피해·효과도 받지 않는다
export const ignores = (g, sl) => !!(sl && sl.kind !== 'mega' && ((g.lv5Only && (sl.lv || 0) < CFG.MAX_LV) || (g.eatLv && (sl.lv || 0) <= g.eatLv)));
// ↑ 폭식 고블린(eatLv): 먹을 수 있는 레벨(Lv2 이하) 슬라임의 피해·효과도 전부 무시
const stResOf = (g, name) => (g.stRes && g.stRes[name] !== undefined ? g.stRes[name] : 1); // 상태 피해 내성 (오우거 피폭 50%)

function applyStatus(g, st, owner) {
  const def = STATUS[st.name]; if (!def) return;
  if (g.immune && g.immune.includes(st.name)) return; // 방독: 독·질식 면역
  const e = g.st[st.name] || (g.st[st.name] = { t: 0, v: 0, fresh: false });
  const m = lvMult(owner.lv > CFG.MAX_LV ? CFG.MAX_LV : owner.lv);
  e.t = Math.max(e.t, st.dur || 1); e.fresh = true;
  if (def.kind === 'dot') e.v = Math.max(e.v, owner.atk * (st.mul || 0.5) * stResOf(g, st.name));
  else if (def.kind === 'defdown') e.v = Math.min(st.cap || 8, e.v + (st.val || 1) * m);
}

const hasSt = (g, n) => g.st[n] && g.st[n].t > 0;
const locked = (s, g) => hasSt(g, 'freeze') || hasSt(g, 'stun') || (hasSt(g, 'slow') && s.tick % 2 === 1);

function auraOf(s, g) {
  let atk = 1, def = 0;
  for (const o of s.goblins) if (!o.dead && o.aura && o !== g && Math.abs(o.idx - g.idx) <= 2) { atk = 1.25; def = 2; break; }
  return { atk, def };
}
function effDef(s, g) {
  if (hasSt(g, 'float')) return 0;
  const a = auraOf(s, g);
  return Math.max(0, g.def + a.def - (hasSt(g, 'defdown') ? g.st.defdown.v : 0));
}

function hurt(s, g, dmg, aff = 1) {
  if (g.dead) return;
  g.hp -= dmg; s.fx.push({ k: 'dmg', idx: g.idx, v: Math.round(dmg), who: 'g', aff });
  if (g.hp <= 0) {
    g.dead = true; s.kills++; s.fx.push({ k: 'kill', idx: g.idx, type: g.type });
    s.gold += goldFor(s, (g.leak + 1));
    if (g.feast) { // 요리사: 쓰러지면서 앞뒤 2칸 고블린에게 음식 -> 회복 + 공격 +20%
      for (const o of s.goblins) if (!o.dead && Math.abs(o.idx - g.idx) <= 2) {
        o.hp = Math.min(o.maxhp, o.hp + o.maxhp * g.feast); o.atkBuff = 1.2;
        s.fx.push({ k: 'heal', idx: o.idx, v: Math.round(o.maxhp * g.feast) });
      }
    }
  }
}

function slimeStatus(s, sl, g, x, y, aff = 1) {
  sl.cd = (sl.cd || 0) + 1;
  const m = lvMult(Math.min(sl.lv, CFG.MAX_LV));
  for (const st of sl.status) {
    if (sl.cd % (st.every || 1) !== 0) continue;
    const kind = STATUS[st.name].kind;
    if (kind === 'explode') {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = PATH.findIndex(p => p[0] === x + dx && p[1] === y + dy);
        if (ni < 0) continue;
        s.goblins.filter(o => !o.dead && o.idx === ni && !ignores(o, sl)).forEach(o => hurt(s, o, sl.atk * (st.mul || 1)));
      }
      if (!ignores(g, sl)) hurt(s, g, sl.atk * (st.mul || 1) * aff, aff);
    } else {
      if (!ignores(g, sl)) applyStatus(g, st, aff === 1 ? sl : { lv: sl.lv, atk: sl.atk * aff });
      if (st.aoe) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = PATH.findIndex(p => p[0] === x + dx && p[1] === y + dy);
          if (ni < 0) continue;
          s.goblins.filter(o => !o.dead && o.idx === ni && !ignores(o, sl)).forEach(o => hurt(s, o, sl.atk * st.aoe * stResOf(o, st.name)));
        }
      }
    }
  }
  void m;
}

// 거점 체력 = 강화 거점 체력 그대로 (v2.9.2)
function leak(s, g) {
  const d = g.leak;
  g.dead = true; s.baseHp -= d;
  s.fx.push({ k: 'leak', idx: PATH.length - 1, v: d });
  say(s, `${g.name} 고블린이 거점에 도달! 거점 -${d}`);
}

function moveGoblin(s, g) {
  if (locked(s, g)) return;
  // 소수 속도 지원: 누적치가 1 이상일 때만 칸 이동 (초대형 0.5 = 2틱에 1칸)
  g.mv = (g.mv || 0) + g.spd;
  let steps = Math.floor(g.mv);
  g.mv -= steps;
  while (steps-- > 0) {
    const ni = g.idx + 1;
    if (ni >= PATH.length) { leak(s, g); return; }
    if (surfaceOcc(s, ni, laneW(s, g))) break;
    g.idx = ni;
    const [x, y] = PATH[ni];
    if (trapAt(s, x, y) && !pitOcc(s, ni, g)) {
      if (g.evade > 0) { g.evade--; continue; }
      if (g.eatLv) { const top = columnSlimes(s, x, y)[0]; if (top && (top.lv || 0) <= g.eatLv) { eatSlime(s, g, top); if (!trapAt(s, x, y)) continue; } }
      if (g.lv5Only && !megaAt(s, x, y) && (columnSlimes(s, x, y)[0]?.lv || 0) < CFG.MAX_LV) { stompBy(s, g, x, y); if (g.dead) return; continue; }
      g.pit = true; s.fx.push({ k: 'fall', idx: ni }); break;
    }
  }
}

// 폭식 고블린: Lv(eatLv) 이하 슬라임을 통째로 먹고 체력을 회복한 뒤 계속 걷는다 (메가는 먹지 않음)
function eatSlime(s, g, sl) {
  removeSlime(s, sl); computeCounts(s);
  const heal = g.maxhp * CFG.GLUTTON_HEAL; g.hp = Math.min(g.maxhp, g.hp + heal);
  s.fx.push({ k: 'eat', idx: g.idx }, { k: 'heal', idx: g.idx, v: Math.round(heal) });
  if (!g.ateSaid) { g.ateSaid = true; say(s, `😋 폭식 고블린이 ${sl.label} 슬라임(Lv${sl.lv})을 먹어 치웠습니다!`); }
}

// 오우거: Lv1~4 슬라임 칸은 갇히지 않고 밟고 지나간다. 슬라임이 한 번 공격하고, 오우거는 툭 치고(GIANT_TAP) 계속 걷는다
function stompBy(s, g, x, y) {
  // 오우거: Lv1~4 슬라임 칸은 갇히지 않고 밟고 지나간다. 슬라임은 오우거에게 피해를 주지 못하고, 오우거는 툭 치고(GIANT_TAP) 계속 걷는다
  const top = columnSlimes(s, x, y)[0]; if (!top) return;
  const d = Math.max(1, Math.round(g.atk * CFG.GIANT_TAP * auraOf(s, g).atk * g.atkBuff - top.def));
  top.hp -= d; s.fx.push({ k: 'dmg', idx: g.idx, v: d, who: 's' }, { k: 'stomp', idx: g.idx });
  if (top.hp <= 0) { removeSlime(s, top); say(s, `${top.label} 슬라임이 오우거에게 밟혔습니다.`); }
  computeCounts(s);
}

const rowSlimes = (s, y) => { const out = []; for (let z = 0; z < CFG.D; z++) for (let x = 0; x < CFG.W; x++) if (s.cells[z][y][x]) out.push(s.cells[z][y][x]); return out; };

function fight(s, g, x, y) {
  const col = columnSlimes(s, x, y);
  const row = rowSlimes(s, y);
  const mega = megaAt(s, x, y);
  g.fights++;
  // 포획 피로: 갇힌 지 TRAP_FATIGUE_AFTER초가 지나면 매초 최대 체력의 1%, 2%, 3%...씩 고정 피해
  // (회복·내성·빙결이 겹쳐 아무도 죽지 않는 교착 상태 방지)
  g.trapT = (g.trapT || 0) + 1;
  // 초대형은 피로 내성(fatigue 배율)이 있어 슬라임 화력으로 직접 잡아야 한다
  if (g.trapT > CFG.TRAP_FATIGUE_AFTER) {
    hurt(s, g, g.maxhp * CFG.TRAP_FATIGUE_STEP * (g.trapT - CFG.TRAP_FATIGUE_AFTER) * (GOBLINS[g.type].fatigue ?? 1));
    if (g.dead) { computeCounts(s); return; }
  }
  const top = col[0] || null;
  // 슬라임(함정)이 먼저 공격
  if (top && !(top.sealed > 0) && !ignores(g, top)) {
    const b = bonus(s, top, row), aff = affinity(top, g);
    const dmg = Math.max(1, Math.round(top.atk * b.atk * aff - (top.pierce ? 0 : effDef(s, g))));
    hurt(s, g, dmg, aff);
    if (!g.dead) slimeStatus(s, top, g, x, y, aff);
    if (top.key === 'U' || top.decay) top.hp -= Math.ceil(top.maxhp * 0.05);
  }
  // 고블린 반격 (일반 고블린은 공격 불가)
  if (!g.dead && g.atk > 0 && !locked(s, g)) {
    const aura = auraOf(s, g).atk;
    const gatk = g.atk * aura * g.atkBuff * (hasSt(g, 'suffocate') ? 0.5 : 1);
    if (mega && g.megaStomp) {
      // 오우거 짓밟기: 메가 구역에서는 칸의 슬라임을 무시하고 메가를 직접 강타 (피해 x GIANT_STOMP_MUL)
      const d = Math.max(1, Math.round(gatk * CFG.GIANT_STOMP_MUL - mega.def));
      mega.hp -= d; s.fx.push({ k: 'dmg', idx: g.idx, v: d, who: 's' }, { k: 'stomp', idx: g.idx });
      if (!g.stompSaid) { g.stompSaid = true; say(s, `🦶 오우거가 ${mega.name}을(를) 짓밟습니다!`); }
      // 짓밟기 충격파: 서 있는 칸 + 상하좌우의 슬라임 전부 (레벨 무관) 오우거 공격력 x GIANT_STOMP_SPLASH
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const sx = x + dx, sy = y + dy; if (sx < 0 || sy < 0 || sx >= CFG.W || sy >= CFG.H) continue;
        for (const t of columnSlimes(s, sx, sy)) {
          const d2 = Math.max(1, Math.round(gatk * CFG.GIANT_STOMP_SPLASH - t.def));
          t.hp -= d2; s.fx.push({ k: 'slimeHit', x: sx, y: sy, v: d2 });
          if (t.hp <= 0 && (dx || dy)) { removeSlime(s, t); say(s, `${t.label} 슬라임이 짓밟기 충격파에 쓰러졌습니다.`); } // 가운데 칸은 아래 공통 처리
        }
      }
    } else if (col.length) {
      const b = bonus(s, col[0], row);
      for (const t of col.slice(0, g.multi)) {
        const d = Math.max(1, Math.round(gatk * b.take - t.def));
        t.hp -= d; s.fx.push({ k: 'dmg', idx: g.idx, v: d, who: 's' });
      }
      if (g.type === 'mage' && g.fights % 3 === 0) col[0].sealed = 2;
    } else if (mega) {
      const d = Math.max(1, Math.round(gatk - mega.def));
      mega.hp -= d; s.fx.push({ k: 'dmg', idx: g.idx, v: d, who: 's' });
    }
  }
  for (const t of col) if (t.hp <= 0) { removeSlime(s, t); say(s, `${t.label} 슬라임이 쓰러졌습니다.`); }
  if (mega && mega.hp <= 0) { s.megas = s.megas.filter(m => m !== mega); say(s, mega.combo ? `${mega.name}이(가) 파괴되었습니다. 다시 만들 수 있습니다.` : '메가 슬라임이 파괴되었습니다.'); }
  computeCounts(s);
}

function actGoblin(s, g) {
  if (g.cleanse && s.tick % 2 === 0) g.st = {};
  if (g.heal && s.tick % 2 === 0 && !locked(s, g)) { // 주술사: 앞뒤 2칸(자신 포함) 고블린 회복
    for (const o of s.goblins) if (!o.dead && o.hp < o.maxhp && Math.abs(o.idx - g.idx) <= 2) {
      const v = o.maxhp * g.heal; o.hp = Math.min(o.maxhp, o.hp + v);
      s.fx.push({ k: 'heal', idx: o.idx, v: Math.round(v) });
    }
  }
  const [x, y] = PATH[g.idx];
  if (g.pit) {
    if (!trapAt(s, x, y)) { g.pit = false; g.trapT = 0; moveGoblin(s, g); } else fight(s, g, x, y);
  } else moveGoblin(s, g);
  // 궁수: 이동 후 앞 range칸의 슬라임 저격
  if (!g.dead && g.range && !g.pit) {
    for (let k = 1; k <= g.range; k++) {
      const p = PATH[g.idx + k]; if (!p) break;
      const col = columnSlimes(s, p[0], p[1]);
      if (col.length) {
        const d = Math.max(1, Math.round(g.atk - col[0].def));
        col[0].hp -= d; s.fx.push({ k: 'dmg', idx: g.idx + k, v: d, who: 's' });
        if (col[0].hp <= 0) { removeSlime(s, col[0]); say(s, `${col[0].label} 슬라임이 저격당했습니다.`); }
        break;
      }
    }
  }
}

function actMega(s, m) {
  const targets = s.goblins
    .filter(g => !g.dead && g.pit)
    .filter(g => { const [x, y] = PATH[g.idx]; return x >= m.zx && x < m.zx + 3 && y >= m.zy && y < m.zy + 3; })
    .sort((a, b) => b.idx - a.idx).slice(0, CFG.MEGA_MAX_TARGETS);
  if (!targets.length || m.sealed > 0) return;
  m.cd++;
  for (const g of targets) {
    const aff = affinity(m, g);
    hurt(s, g, Math.max(1, Math.round(m.atk * aff - (m.pierce ? 0 : effDef(s, g)))), aff);
    if (!g.dead) for (const st of m.status) if (m.cd % (st.every || 1) === 0 && STATUS[st.name].kind !== 'explode') applyStatus(g, st, { lv: CFG.MAX_LV, atk: m.atk });
  }
}

// ---------- 틱 ----------
export function step(s) {
  if (s.phase === 'over' || s.phase === 'won') return;
  s.fx = []; s.tick++;
  s.dropAcc += 1; // 지급 속도 강화: 간격이 소수(2.5초 등)여도 누적으로 처리
  while (s.dropAcc >= s.mods.dropEvery) { s.dropAcc -= s.mods.dropEvery; if (!addQueue(s)) say(s, '덱이 가득 차 카드 1장이 버려졌습니다.'); }
  if (s.phase === 'prep') {
    s.prepLeft--; if (s.prepLeft <= 0) startRound(s);
    return;
  }
  computeCounts(s);
  // 스폰
  { const ki = s.spawnList.indexOf('king'); if (ki >= 0 && ki <= 6 && !s.bossNear) { s.bossNear = true; s.fx.push({ k: 'boss', t: 'near' }); say(s, '👑 보스가 곧 들어옵니다!'); } }
  for (let k = 0, per = spawnPerTick(s); k < per && s.spawnList.length; k++) {   // 1초 입장 수 (군단 단계면 SPAWN_PER_TICK)
    const type = s.spawnList[0], w = (GOBLINS[type].size || 1) > 1 ? surfaceCap(s) : 1;
    if (surfaceOcc(s, 0, w)) break;
    const g = makeGoblin(s, s.spawnList.shift());
    if (g.type === 'king') { s.fx.push({ k: 'boss', t: 'enter' }); say(s, '👑 보스 고블린 왕 입장!'); }
    if (trapAt(s, PATH[0][0], PATH[0][1]) && !pitOcc(s, 0)) g.pit = true;
    s.goblins.push(g);
  }
  // 지속 피해
  for (const g of s.goblins) {
    if (g.dead) continue;
    for (const [n, e] of Object.entries(g.st)) if (e.t > 0 && STATUS[n].kind === 'dot') hurt(s, g, e.v);
  }
  // 행동 (선두부터)
  for (const g of [...s.goblins].sort((a, b) => b.idx - a.idx)) if (!g.dead) actGoblin(s, g);
  for (const m of s.megas) actMega(s, m);
  // 상태 정리
  for (const g of s.goblins) for (const e of Object.values(g.st)) { if (e.fresh) e.fresh = false; else if (e.t > 0) e.t--; }
  for (const sl of s.cells.flat(2)) if (sl && sl.sealed > 0) sl.sealed--;
  // 회복 오라(전기밥솥): 상하좌우 슬라임과 자신을 최대 체력 비율만큼 회복
  for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
    const src = s.cells[0][y][x]; if (!src || !src.healAura) continue;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const o = s.cells[0][y + dy]?.[x + dx]; if (o && o.hp < o.maxhp) o.hp = Math.min(o.maxhp, o.hp + o.maxhp * src.healAura);
    }
  }
  for (const m of s.megas) if (m.sealed > 0) m.sealed--;
  s.goblins = s.goblins.filter(g => !g.dead);
  computeCounts(s);

  if (s.baseHp <= 0) { s.baseHp = 0; s.phase = 'over'; say(s, '거점이 함락되었습니다…'); return; }
  if (!s.spawnList.length && !s.goblins.length) {
    // 라운드 보상: 골드, 보스(10라운드)를 자동 없이 직접 깨면 1.5배
    const boss = !s.tower && s.round >= CFG.ROUNDS, manual = boss && !s.autoRounds.has(s.round);
    const g0 = Math.round(goldFor(s, 6 * s.round) * (manual ? 1.5 : 1));
    s.gold += g0;
    if (s.tower) {
      if (s.round % 5 === 0) { s.crystals += 1; say(s, `탑 ${s.round}층 돌파! 원소 결정 +1`); }
    } else if (boss) {
      const c = s.chapter * (manual ? 1.5 : 1);
      s.crystals += Math.round(c);
      s.phase = 'won'; say(s, `챕터 ${s.chapter} ${s.ch.name} 클리어! 골드 +${g0}, 원소 결정 +${Math.round(c)}${manual ? ' (직접 지휘 1.5배)' : ''}`); return;
    }
    s.round++; s.phase = 'prep'; rollRound(s); s.prepLeft = s.tower ? CFG.TOWER_PREP : CFG.PREP_TICKS; s.catalysts += s.mods.catPerRound;
    for (let i = 0; i < CFG.ROUND_BONUS_SLIMES; i++) addQueue(s);
    say(s, `${s.tower ? `탑 ${s.round - 1}층` : `라운드 ${s.round - 1}`} 클리어! 골드 +${g0}, 촉매 +${s.mods.catPerRound}`);
  }
}
