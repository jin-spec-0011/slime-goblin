// 헤드리스 게임 엔진 (DOM 의존 없음, Node에서 시뮬레이션 가능)
import { CFG, STATUS, ELEMENTS, RECIPES, FUSIONS, ATTRS, GOBLINS, CHAPTERS, buildPath } from './data.js';

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
  const chapter = Math.min(CHAPTERS.length, Math.max(1, opts.chapter || 1));
  const ch = CHAPTERS[chapter - 1];
  setPath(ch.path);
  const s = {
    seed, rng: mulberry32(seed), tick: 0, round: 1, phase: 'prep', prepLeft: CFG.FIRST_PREP,
    baseHp: CFG.BASE_HP, catalysts: CFG.CATALYST_START,
    cells: Array.from({ length: CFG.D }, () => Array.from({ length: CFG.H }, () => Array(CFG.W).fill(null))),
    queue: [], goblins: [], spawnList: [], megas: [], nextId: 1, kills: 0, lost: 0,
    log: [], fx: [], counts: {}, autoField: opts.autoField ?? CFG.AUTO_FIELD, chapter, ch,
  };
  for (let i = 0; i < CFG.START_SLIMES; i++) addQueue(s);
  say(s, s.autoField ? '준비 단계: 슬라임이 필드에 랜덤 배치됩니다. 끌어서 겹치거나 옮기세요.' : '준비 단계: 슬라임을 배치하세요.');
  return s;
}

function say(s, msg) { s.log.push(msg); if (s.log.length > 40) s.log.shift(); }
const err = msg => ({ ok: false, msg });
const ok = (msg = '') => ({ ok: true, msg });

// ---------- 슬라임 생성/능력치 ----------
function recalc(s) {
  const m = lvMult(s.lv);
  s.maxhp = Math.max(1, Math.round(s.base.hp * m * s.kindMul));
  s.atk = s.base.atk * m * s.kindMul;
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
  recalc(sl); return sl;
}

function makeCompound(s, rec, lv) {
  const sl = {
    id: s.nextId++, kind: 'compound', key: rec.key, label: rec.label, name: rec.name, els: Object.keys(rec.need),
    attrs: [...new Set(Object.keys(rec.need).map(k => EL[k].attr))], lv,
    base: { hp: rec.hp, atk: rec.atk, def: rec.def }, status: [rec.st], kindMul: CFG.COMPOUND_MUL,
    color: rec.color, color2: null, cd: 0, sealed: 0,
  };
  recalc(sl); return sl;
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
  recalc(sl); return sl;
}

function makeFusion(s, fu, lv) {
  const sl = {
    id: s.nextId++, kind: 'fusion', key: fu.key, label: fu.label, name: fu.label, els: [], attrs: [...fu.pair], lv,
    base: { hp: fu.hp, atk: fu.atk, def: fu.def }, status: fu.st, kindMul: CFG.FUSION_MUL,
    pierce: !!fu.pierce, decay: !!fu.decay, color: fu.color, color2: ATTRS[fu.pair[1]].color, cd: 0, sealed: 0,
  };
  recalc(sl); return sl;
}
const fusionOf = (a, b) => FUSIONS.find(f => (f.pair[0] === a && f.pair[1] === b) || (f.pair[0] === b && f.pair[1] === a)) || null;

// ---------- 지급 큐 ----------
// 슬라임 지급: 필드에 빈칸이 있으면 빈칸에 랜덤 배치, 필드가 가득 차면 덱(큐)에 쌓는다
function addQueue(s) {
  const pool = ELEMENTS.filter(e => s.ch.unlockAll || e.unlock <= s.round);
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
  const stackable = A.key === B.key && (A.kind === 'element' || A.kind === 'compound' || A.kind === 'fusion');
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
  if (sl.some(c => c.kind !== 'element')) return { state: 'bad', text: '원소·속성 슬라임만 조합할 수 있습니다.' };
  const cnt = {}; sl.forEach(c => { cnt[c.key] = (cnt[c.key] || 0) + 1; });
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
  if (sl.length === 2 && sl[0].attrs[0] !== sl[1].attrs[0]) {
    const fu = fusionOf(sl[0].attrs[0], sl[1].attrs[0]);
    if (fu) return { state: 'fusion', fusion: fu, text: `${ATTRS[fu.pair[0]].label} + ${ATTRS[fu.pair[1]].label} = ${fu.label} (속성 합성 ${Math.round(CFG.FUSION_MUL * 100)}%)` };
  }
  // 3) 그 외 -> 혼합물 70%
  const fmt = r => Object.entries(r.need).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(' + ');
  if (best.diff <= 2) return { state: 'near', text: `혼합물(70%) · ${best.r.label} 거의 맞음: ${fmt(best.r)}` };
  return { state: 'mix', text: '혼합물(70%) 생성 · 속성 합성은 서로 다른 속성 2마리' };
}

export function combine(s, list) {
  if (s.catalysts < 1) return err('촉매가 없습니다.');
  const h = recipeHint(s, list);
  if (h.state === 'none' || h.state === 'bad') return err(h.text);
  const sl = list.map(p => getCell(s, p.x, p.y, p.z));
  const cnt = {}; sl.forEach(c => { cnt[c.key] = (cnt[c.key] || 0) + 1; });
  const lv = Math.min(CFG.MAX_LV, Math.ceil(sl.reduce((a, c) => a + c.lv, 0) / sl.length));
  const res = h.state === 'match' ? makeCompound(s, h.recipe, lv)
    : h.state === 'fusion' ? makeFusion(s, h.fusion, lv) : makeMixture(s, cnt, lv);
  list.forEach(p => { s.cells[p.z][p.y][p.x] = null; });
  const p0 = list[0]; s.cells[p0.z][p0.y][p0.x] = res;
  s.catalysts--; computeCounts(s);
  return ok(h.state === 'match' ? `${res.label} 합성 성공!` : h.state === 'fusion' ? `속성 합성: ${res.label}!` : `혼합물 ${res.label} 생성`);
}

export function makeMega(s, list) {
  if (s.round < CFG.MEGA_ROUND) return err(`메가 슬라임은 ${CFG.MEGA_ROUND}라운드부터 사용 가능합니다.`);
  if (list.length !== 3) return err('Lv5 동일 원소 슬라임 3개를 선택하세요.');
  const sl = list.map(p => getCell(s, p.x, p.y, p.z));
  if (sl.some(c => !c || c.kind !== 'element' || c.lv < CFG.MAX_LV)) return err('Lv5 원소 슬라임만 가능합니다.');
  if (!(sl[0].key === sl[1].key && sl[1].key === sl[2].key)) return err('같은 원소여야 합니다.');
  const e = EL[sl[0].key], m = lvMult(CFG.MAX_LV);
  const zx = Math.min(Math.max(list[0].x - 1, 0), CFG.W - 3), zy = Math.min(Math.max(list[0].y - 1, 0), CFG.H - 3);
  const mega = {
    id: s.nextId++, kind: 'mega', key: sl[0].key + 'M', label: e.label || sl[0].key, name: `메가 ${e.name}`, els: [sl[0].key], attrs: [e.attr], lv: 6,
    maxhp: Math.round(3 * e.hp * m * CFG.MEGA_MUL * 2), atk: e.atk * m * CFG.MEGA_ATK,
    def: e.def * (1 + 0.25 * (CFG.MAX_LV - 1)) * 1.5, status: [e.st], color: e.color, zx, zy, cd: 0, sealed: 0,
  };
  mega.hp = mega.maxhp;
  list.forEach(p => { s.cells[p.z][p.y][p.x] = null; });
  s.megas.push(mega); computeCounts(s);
  say(s, `메가 ${e.name} 슬라임 가동! (구역 ${zx + 1},${zy + 1} 기준 3×3)`);
  return ok('메가 슬라임 생성');
}

export function skipPrep(s) {
  if (s.phase === 'prep') { s.prepLeft = 0; return ok('라운드 시작'); }
  return err('이미 진행 중입니다.');
}

// ---------- 고블린 ----------
function buildSpawn(s, round) {
  const groups = s.ch.rounds[round - 1].map(([t, n]) => Array(n).fill(t));
  const out = []; let more = true;
  while (more) { more = false; for (const g of groups) if (g.length) { out.push(g.shift()); more = true; } }
  return out;
}

function makeGoblin(s, type) {
  const d = GOBLINS[type], r = s.round - 1;
  // 챕터 배율은 라운드가 갈수록 커진다: 1라운드 30% 적용 -> 10라운드 100% (초반 붕괴 방지)
  const ramp = 0.3 + 0.7 * (r / (CFG.ROUNDS - 1));
  const hpMul = 1 + (s.ch.hpMul - 1) * ramp, atkMul = 1 + (s.ch.atkMul - 1) * ramp;
  const hp = Math.round(d.hp * Math.pow(CFG.HP_GROWTH, r) * hpMul);
  return {
    id: s.nextId++, type, name: d.name, ch: d.ch, color: d.color, hp, maxhp: hp,
    atk: d.atk * (1 + CFG.ATK_GROWTH * r) * atkMul, def: d.def + Math.floor(r / 3), spd: d.spd, leak: d.leak,
    multi: d.multi || 1, range: d.range || 0, aura: !!d.aura, evade: d.evade || 0, cleanse: !!d.cleanse,
    weak: d.weak || [], resist: d.resist || [], immune: d.immune || [], heal: d.heal || 0, feast: d.feast || 0, atkBuff: 1,
    idx: 0, pit: false, st: {}, fights: 0, dead: false,
  };
}

// 지표면(걷는 고블린)과 구덩이(빠진 고블린)를 따로 점유한다.
// 구덩이는 칸마다 1마리만 빠지고, 뒤따르는 고블린은 그 위를 지나 다음 칸으로 진행한다.
const surfaceOcc = (s, idx) => s.goblins.some(g => !g.dead && !g.pit && g.idx === idx);
const pitOcc = (s, idx, self = null) => s.goblins.some(g => !g.dead && g.pit && g.idx === idx && g !== self);

function startRound(s) {
  s.phase = 'run'; s.spawnList = buildSpawn(s, s.round);
  say(s, `라운드 ${s.round} 시작! 고블린 ${s.spawnList.length}마리`);
}

function applyStatus(g, st, owner) {
  const def = STATUS[st.name]; if (!def) return;
  if (g.immune && g.immune.includes(st.name)) return; // 방독: 독·질식 면역
  const e = g.st[st.name] || (g.st[st.name] = { t: 0, v: 0, fresh: false });
  const m = lvMult(owner.lv > CFG.MAX_LV ? CFG.MAX_LV : owner.lv);
  e.t = Math.max(e.t, st.dur || 1); e.fresh = true;
  if (def.kind === 'dot') e.v = Math.max(e.v, owner.atk * (st.mul || 0.5));
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
        s.goblins.filter(o => !o.dead && o.idx === ni).forEach(o => hurt(s, o, sl.atk * (st.mul || 1)));
      }
      hurt(s, g, sl.atk * (st.mul || 1) * aff, aff);
    } else {
      applyStatus(g, st, aff === 1 ? sl : { lv: sl.lv, atk: sl.atk * aff });
      if (st.aoe) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = PATH.findIndex(p => p[0] === x + dx && p[1] === y + dy);
          if (ni < 0) continue;
          s.goblins.filter(o => !o.dead && o.idx === ni).forEach(o => hurt(s, o, sl.atk * st.aoe));
        }
      }
    }
  }
  void m;
}

function leak(s, g) {
  g.dead = true; s.baseHp -= g.leak;
  s.fx.push({ k: 'leak', idx: PATH.length - 1, v: g.leak });
  say(s, `${g.name} 고블린이 거점에 도달! 거점 -${g.leak}`);
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
    if (surfaceOcc(s, ni)) break;
    g.idx = ni;
    const [x, y] = PATH[ni];
    if (trapAt(s, x, y) && !pitOcc(s, ni, g)) {
      if (g.evade > 0) { g.evade--; continue; }
      g.pit = true; s.fx.push({ k: 'fall', idx: ni }); break;
    }
  }
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
  if (g.trapT > CFG.TRAP_FATIGUE_AFTER) {
    hurt(s, g, g.maxhp * CFG.TRAP_FATIGUE_STEP * (g.trapT - CFG.TRAP_FATIGUE_AFTER));
    if (g.dead) { computeCounts(s); return; }
  }
  const top = col[0] || null;
  // 슬라임(함정)이 먼저 공격
  if (top && !(top.sealed > 0)) {
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
    if (col.length) {
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
  if (mega && mega.hp <= 0) { s.megas = s.megas.filter(m => m !== mega); say(s, '메가 슬라임이 파괴되었습니다.'); }
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
    hurt(s, g, Math.max(1, Math.round(m.atk * aff - effDef(s, g))), aff);
    if (!g.dead) for (const st of m.status) if (m.cd % (st.every || 1) === 0 && STATUS[st.name].kind !== 'explode') applyStatus(g, st, { lv: CFG.MAX_LV, atk: m.atk });
  }
}

// ---------- 틱 ----------
export function step(s) {
  if (s.phase === 'over' || s.phase === 'won') return;
  s.fx = []; s.tick++;
  if (s.tick % CFG.DROP_EVERY === 0 && !addQueue(s)) say(s, '덱이 가득 차 카드 1장이 버려졌습니다.');
  if (s.phase === 'prep') {
    s.prepLeft--; if (s.prepLeft <= 0) startRound(s);
    return;
  }
  computeCounts(s);
  // 스폰
  if (s.spawnList.length && !surfaceOcc(s, 0)) {
    const g = makeGoblin(s, s.spawnList.shift());
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
  for (const m of s.megas) if (m.sealed > 0) m.sealed--;
  s.goblins = s.goblins.filter(g => !g.dead);
  computeCounts(s);

  if (s.baseHp <= 0) { s.baseHp = 0; s.phase = 'over'; say(s, '거점이 함락되었습니다…'); return; }
  if (!s.spawnList.length && !s.goblins.length) {
    if (s.round >= CFG.ROUNDS) { s.phase = 'won'; say(s, `챕터 ${s.chapter} ${s.ch.name} 클리어!`); return; }
    s.round++; s.phase = 'prep'; s.prepLeft = CFG.PREP_TICKS; s.catalysts++;
    for (let i = 0; i < CFG.ROUND_BONUS_SLIMES; i++) addQueue(s);
    say(s, `라운드 ${s.round - 1} 클리어! 보너스 슬라임 +${CFG.ROUND_BONUS_SLIMES}, 촉매 +1`);
  }
}
