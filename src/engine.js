// 헤드리스 게임 엔진 (DOM 의존 없음, Node에서 시뮬레이션 가능)
import { CFG, STATUS, ELEMENTS, RECIPES, GOBLINS, ROUND_TABLE, buildPath } from './data.js';

export const PATH = buildPath();
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

export function createGame(seed = Date.now()) {
  const s = {
    seed, rng: mulberry32(seed), tick: 0, round: 1, phase: 'prep', prepLeft: CFG.FIRST_PREP,
    baseHp: CFG.BASE_HP, catalysts: CFG.CATALYST_START,
    cells: Array.from({ length: CFG.D }, () => Array.from({ length: CFG.H }, () => Array(CFG.W).fill(null))),
    queue: [], goblins: [], spawnList: [], megas: [], nextId: 1, kills: 0, lost: 0,
    log: [], fx: [], counts: {},
  };
  for (let i = 0; i < CFG.START_SLIMES; i++) addQueue(s);
  say(s, '준비 단계: 슬라임을 구덩이에 배치하세요.');
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
    id: s.nextId++, kind: 'element', key: sym, label: sym, name: e.name, els: [sym], lv,
    base: { hp: e.hp, atk: e.atk, def: e.def }, status: [e.st], kindMul: 1,
    color: e.color, color2: null, cd: 0, sealed: 0,
  };
  recalc(sl); return sl;
}

function makeCompound(s, rec, lv) {
  const sl = {
    id: s.nextId++, kind: 'compound', key: rec.key, label: rec.label, name: rec.name, els: Object.keys(rec.need), lv,
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
    id: s.nextId++, kind: 'mixture', key: 'MIX:' + syms.join(','), label: syms.join('+'), name: '혼합물', els: syms, lv,
    base, status: top.map(t => EL[t].st), kindMul: CFG.MIXTURE_MUL,
    color: EL[top[0]].color, color2: EL[top[top.length - 1]].color, cd: 0, sealed: 0,
  };
  recalc(sl); return sl;
}

// ---------- 지급 큐 ----------
function addQueue(s) {
  const pool = ELEMENTS.filter(e => e.unlock <= s.round);
  const e = pool[Math.floor(s.rng() * pool.length)];
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

function computeCounts(s) {
  const c = {};
  for (const sl of s.cells.flat(2)) if (sl) c[sl.key] = (c[sl.key] || 0) + 1;
  s.counts = c; return c;
}

function bonus(s, sl, col) {
  let atk = 1, take = 1;
  const cnt = s.counts[sl.key] || 0;
  if (cnt >= 3) atk *= CFG.GROUP3_ATK;
  if (cnt >= 2) take *= CFG.GROUP2_TAKEN;
  if (col.filter(c => c.key === sl.key).length >= 3) atk *= CFG.COLUMN_ATK;
  return { atk, take };
}

// ---------- 플레이어 행동 ----------
export function placeFromQueue(s, qi, x, y, z) {
  const q = s.queue[qi];
  if (!q) return err('대기 슬라임이 없습니다.');
  const cur = getCell(s, x, y, z);
  if (cur) {
    if (cur.kind !== 'element' || cur.key !== q.sym) return err('같은 원소에만 겹칠 수 있습니다.');
    if (cur.lv >= CFG.MAX_LV) return err('이미 최대 레벨입니다.');
    cur.lv += 1; recalc(cur); s.queue.splice(qi, 1);
    return ok(`${cur.label} Lv${cur.lv}`);
  }
  if (slimeCount(s) >= CFG.CAP) return err(`배치 상한(${CFG.CAP})입니다.`);
  s.cells[z][y][x] = makeElement(s, q.sym); s.queue.splice(qi, 1);
  computeCounts(s);
  return ok(`${q.sym} 배치`);
}

export function moveSlime(s, a, b) {
  if (a.x === b.x && a.y === b.y && a.z === b.z) return err('같은 칸입니다.');
  const A = getCell(s, a.x, a.y, a.z); if (!A) return err('이동할 슬라임이 없습니다.');
  const B = getCell(s, b.x, b.y, b.z);
  if (!B) { s.cells[b.z][b.y][b.x] = A; s.cells[a.z][a.y][a.x] = null; return ok('이동'); }
  const stackable = A.key === B.key && (A.kind === 'element' || A.kind === 'compound');
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
  if (sl.some(c => c.kind !== 'element')) return { state: 'bad', text: '원소 슬라임만 조합할 수 있습니다.' };
  const cnt = {}; sl.forEach(c => { cnt[c.key] = (cnt[c.key] || 0) + 1; });
  if (Object.keys(cnt).length < 2) return { state: 'bad', text: '같은 원소는 겹치기로 성장합니다.' };
  let best = null;
  for (const r of RECIPES) {
    const keys = new Set([...Object.keys(cnt), ...Object.keys(r.need)]);
    let diff = 0; for (const k of keys) diff += Math.abs((cnt[k] || 0) - (r.need[k] || 0));
    if (!best || diff < best.diff) best = { r, diff };
  }
  const fmt = r => Object.entries(r.need).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(' + ');
  if (best.diff === 0) return { state: 'match', recipe: best.r, text: `${best.r.label} ${best.r.name} (150%) 족보 일치` };
  if (best.diff <= 2) return { state: 'near', text: `혼합물(70%) · ${best.r.label} 거의 맞음: ${fmt(best.r)}` };
  return { state: 'mix', text: '혼합물(70%) 생성' };
}

export function combine(s, list) {
  if (s.catalysts < 1) return err('촉매가 없습니다.');
  const h = recipeHint(s, list);
  if (h.state === 'none' || h.state === 'bad') return err(h.text);
  const sl = list.map(p => getCell(s, p.x, p.y, p.z));
  const cnt = {}; sl.forEach(c => { cnt[c.key] = (cnt[c.key] || 0) + 1; });
  const lv = Math.min(CFG.MAX_LV, Math.ceil(sl.reduce((a, c) => a + c.lv, 0) / sl.length));
  const res = h.state === 'match' ? makeCompound(s, h.recipe, lv) : makeMixture(s, cnt, lv);
  list.forEach(p => { s.cells[p.z][p.y][p.x] = null; });
  const p0 = list[0]; s.cells[p0.z][p0.y][p0.x] = res;
  s.catalysts--; computeCounts(s);
  return ok(h.state === 'match' ? `${res.label} 합성 성공!` : `혼합물 ${res.label} 생성`);
}

export function makeMega(s, list) {
  if (s.round !== CFG.ROUNDS) return err('메가 슬라임은 보스 라운드(10)에서만 사용 가능합니다.');
  if (list.length !== 3) return err('Lv5 동일 원소 슬라임 3개를 선택하세요.');
  const sl = list.map(p => getCell(s, p.x, p.y, p.z));
  if (sl.some(c => !c || c.kind !== 'element' || c.lv < CFG.MAX_LV)) return err('Lv5 원소 슬라임만 가능합니다.');
  if (!(sl[0].key === sl[1].key && sl[1].key === sl[2].key)) return err('같은 원소여야 합니다.');
  const e = EL[sl[0].key], m = lvMult(CFG.MAX_LV);
  const zx = Math.min(Math.max(list[0].x - 1, 0), CFG.W - 3), zy = Math.min(Math.max(list[0].y - 1, 0), CFG.H - 3);
  const mega = {
    id: s.nextId++, kind: 'mega', key: sl[0].key + 'M', label: sl[0].key, name: `메가 ${e.name}`, els: [sl[0].key], lv: 6,
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
function buildSpawn(round) {
  const groups = ROUND_TABLE[round - 1].map(([t, n]) => Array(n).fill(t));
  const out = []; let more = true;
  while (more) { more = false; for (const g of groups) if (g.length) { out.push(g.shift()); more = true; } }
  return out;
}

function makeGoblin(s, type) {
  const d = GOBLINS[type], r = s.round - 1;
  const hp = Math.round(d.hp * Math.pow(CFG.HP_GROWTH, r));
  return {
    id: s.nextId++, type, name: d.name, ch: d.ch, color: d.color, hp, maxhp: hp,
    atk: d.atk * (1 + CFG.ATK_GROWTH * r), def: d.def + Math.floor(r / 3), spd: d.spd, leak: d.leak,
    multi: d.multi || 1, range: d.range || 0, aura: !!d.aura, evade: d.evade || 0, cleanse: !!d.cleanse,
    idx: 0, pit: false, st: {}, fights: 0, dead: false,
  };
}

// 지표면(걷는 고블린)과 구덩이(빠진 고블린)를 따로 점유한다.
// 구덩이는 칸마다 1마리만 빠지고, 뒤따르는 고블린은 그 위를 지나 다음 칸으로 진행한다.
const surfaceOcc = (s, idx) => s.goblins.some(g => !g.dead && !g.pit && g.idx === idx);
const pitOcc = (s, idx, self = null) => s.goblins.some(g => !g.dead && g.pit && g.idx === idx && g !== self);

function startRound(s) {
  s.phase = 'run'; s.spawnList = buildSpawn(s.round);
  say(s, `라운드 ${s.round} 시작! 고블린 ${s.spawnList.length}마리`);
}

function applyStatus(g, st, owner) {
  const def = STATUS[st.name]; if (!def) return;
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

function hurt(s, g, dmg, ref) {
  if (g.dead) return;
  g.hp -= dmg; s.fx.push({ k: 'dmg', idx: g.idx, v: Math.round(dmg), who: 'g' });
  if (g.hp <= 0) { g.dead = true; s.kills++; s.fx.push({ k: 'kill', idx: g.idx }); }
}

function slimeStatus(s, sl, g, x, y) {
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
      hurt(s, g, sl.atk * (st.mul || 1));
    } else {
      applyStatus(g, st, sl);
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
  let steps = g.spd;
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

function fight(s, g, x, y) {
  const col = columnSlimes(s, x, y);
  const mega = megaAt(s, x, y);
  g.fights++;
  const top = col[0] || null;
  // 슬라임(함정)이 먼저 공격
  if (top && !(top.sealed > 0)) {
    const b = bonus(s, top, col);
    const dmg = Math.max(1, Math.round(top.atk * b.atk - effDef(s, g)));
    hurt(s, g, dmg);
    if (!g.dead) slimeStatus(s, top, g, x, y);
    if (top.key === 'U') top.hp -= Math.ceil(top.maxhp * 0.05);
  }
  // 고블린 반격 (일반 고블린은 공격 불가)
  if (!g.dead && g.atk > 0 && !locked(s, g)) {
    const aura = auraOf(s, g).atk;
    const gatk = g.atk * aura * (hasSt(g, 'suffocate') ? 0.5 : 1);
    if (col.length) {
      const b = bonus(s, col[0], col);
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
  const [x, y] = PATH[g.idx];
  if (g.pit) {
    if (!trapAt(s, x, y)) { g.pit = false; moveGoblin(s, g); } else fight(s, g, x, y);
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
    hurt(s, g, Math.max(1, Math.round(m.atk - effDef(s, g))));
    if (!g.dead) for (const st of m.status) if (m.cd % (st.every || 1) === 0 && STATUS[st.name].kind !== 'explode') applyStatus(g, st, { lv: CFG.MAX_LV, atk: m.atk });
  }
}

// ---------- 틱 ----------
export function step(s) {
  if (s.phase === 'over' || s.phase === 'won') return;
  s.fx = []; s.tick++;
  if (!addQueue(s)) say(s, '대기열이 가득 차 슬라임이 사라졌습니다.');
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
    if (s.round >= CFG.ROUNDS) { s.phase = 'won'; say(s, '챕터 클리어!'); return; }
    s.round++; s.phase = 'prep'; s.prepLeft = CFG.PREP_TICKS; s.catalysts++;
    for (let i = 0; i < CFG.ROUND_BONUS_SLIMES; i++) addQueue(s);
    say(s, `라운드 ${s.round - 1} 클리어! 보너스 슬라임 +${CFG.ROUND_BONUS_SLIMES}, 촉매 +1`);
  }
}
