// 성장(메타) 시스템: 재화·강화·연구·덱·무한의 탑·환생·오프라인 보상
// DOM 의존 없음 (Node 시뮬레이터·테스트에서도 사용). 저장은 호출측이 storage 객체로 넘긴다.
import { CFG, ELEMENTS, ATTRS } from './data.js';

export const PROFILE_KEY = 'esd.profile.v1';
export const DECK_SIZE = 8;                 // 덱 편성 장수
export const OFFLINE_MAX_SEC = 4 * 3600;    // 오프라인 보상 최대 4시간
export const OFFLINE_RATE = 0.2;            // 오프라인 보상 = 최근 분당 골드의 20%
export const PRESTIGE_MIN_FLOOR = 10;       // 환생 가능 최소 탑 층

// 골드 강화: cost = base x growth^lv, max 없으면 무제한
export const UPGRADES = {
  atk:   { name: '슬라임 공격력', icon: '⚔', base: 30,  growth: 1.45,  desc: lv => `+${lv * 10}%` },
  hp:    { name: '슬라임 체력',   icon: '❤', base: 25,  growth: 1.42, desc: lv => `+${lv * 10}%` },
  drop:  { name: '지급 속도',     icon: '⏱', base: 400, growth: 3.2,  max: 4, desc: lv => `${dropEvery(lv)}초마다` },
  cat:   { name: '촉매 공급',     icon: '🧪', base: 300, growth: 2.6,  max: 5, desc: lv => `라운드당 +${1 + lv}` },
  base:  { name: '거점 체력',     icon: '🏰', base: 40,  growth: 1.55, desc: lv => `${CFG.BASE_HP + lv * 5}` },
  start: { name: '시작 슬라임',   icon: '🫧', base: 250, growth: 2.4,  max: 5, desc: lv => `${CFG.START_SLIMES + lv * 2}마리` },
};
export const dropEvery = lv => Math.max(1, CFG.DROP_EVERY - 0.5 * lv); // 4초 -> 최대 강화 시 2초

// 속성 연구 (원소 결정): 레벨당 해당 속성 슬라임 공격 +10%
export const RESEARCH_PER = 0.1;
export const researchCost = lv => 1 + lv;

export function newProfile() {
  return {
    v: 1, gold: 0, crystals: 0, stones: 0, prestiges: 0,
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
    research: Object.fromEntries(Object.keys(ATTRS).map(k => [k, 0])),
    deck: ['FIRE', 'ELEC', 'O', 'H', 'C', 'N', 'Fe', 'He'],
    towerBest: 0, totalGold: 0, goldRate: 0, lastSeen: Date.now(),
  };
}

export function loadProfile(storage) {
  try {
    const p = JSON.parse(storage?.getItem(PROFILE_KEY) || 'null');
    if (!p || p.v !== 1) return newProfile();
    const base = newProfile();
    const out = { ...base, ...p, upgrades: { ...base.upgrades, ...p.upgrades }, research: { ...base.research, ...p.research } };
    // v2.4.0: 덱에서 지급되지 않는 슬라임(물) 제거 -> 덱에 없는 슬라임으로 채움
    out.deck = (Array.isArray(out.deck) ? out.deck : base.deck).filter(sym => DECK_POOL.includes(sym));
    out.deck = [...new Set(out.deck)].slice(0, DECK_SIZE);
    for (const sym of DECK_POOL) { if (out.deck.length >= DECK_SIZE) break; if (!out.deck.includes(sym)) out.deck.push(sym); } // 항상 8종
    return out;
  } catch { return newProfile(); }
}
export function saveProfile(storage, p) {
  try { storage?.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* 저장 불가 환경 무시 */ }
}

export const upgradeCost = (key, lv) => Math.round(UPGRADES[key].base * Math.pow(UPGRADES[key].growth, lv));
export const isMaxed = (key, lv) => UPGRADES[key].max !== undefined && lv >= UPGRADES[key].max;

export function buyUpgrade(p, key) {
  const lv = p.upgrades[key];
  if (isMaxed(key, lv)) return { ok: false, msg: '최대 레벨입니다.' };
  const cost = upgradeCost(key, lv);
  if (p.gold < cost) return { ok: false, msg: `골드가 부족합니다 (${fmt(cost)} 필요)` };
  p.gold -= cost; p.upgrades[key] = lv + 1;
  return { ok: true, msg: `${UPGRADES[key].name} Lv${lv + 1}` };
}
export function buyResearch(p, attr) {
  const lv = p.research[attr], cost = researchCost(lv);
  if (p.crystals < cost) return { ok: false, msg: `원소 결정이 부족합니다 (${cost} 필요)` };
  p.crystals -= cost; p.research[attr] = lv + 1;
  return { ok: true, msg: `${ATTRS[attr].label} 연구 Lv${lv + 1}` };
}

// 덱: 정확히 DECK_SIZE장 (8장 미만이면 같은 슬라임이 너무 자주 나와 난이도가 무너짐)
export const DECK_POOL = ELEMENTS.filter(e => !e.noDrop).map(e => e.sym); // 물은 H₂O로만 얻으므로 덱에서 제외
// 덱 편집 (편집 중에는 0~8장, 게임 입장은 정확히 8장일 때만: deckReady)
export function toggleDeck(p, sym) {
  if (!DECK_POOL.includes(sym)) return { ok: false, msg: '덱에 넣을 수 없는 슬라임입니다.' };
  const i = p.deck.indexOf(sym);
  if (i >= 0) { p.deck.splice(i, 1); return { ok: true }; }
  if (p.deck.length >= DECK_SIZE) return { ok: false, msg: `덱은 ${DECK_SIZE}종입니다. 먼저 하나를 빼세요.` };
  p.deck.push(sym); return { ok: true };
}
export const deckReady = deck => Array.isArray(deck) && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE && deck.every(x => DECK_POOL.includes(x));

// 환생: 골드·골드 강화 초기화, 현자의 돌 획득(영구 배율). 연구·덱·결정·탑 최고 기록은 유지
// 현자의 돌 = (탑 최고 층 / 5)^1.5 (예: 20층 8개, 40층 22개). 이미 받은 만큼은 빼고 지급
export const stoneGain = p => (p.towerBest >= PRESTIGE_MIN_FLOOR ? Math.max(0, Math.floor(Math.pow(p.towerBest / 5, 1.5)) - (p.stonesFromBest || 0)) : 0);
export function prestige(p) {
  const g = stoneGain(p);
  if (g <= 0) return { ok: false, msg: p.towerBest < PRESTIGE_MIN_FLOOR ? `무한의 탑 ${PRESTIGE_MIN_FLOOR}층 이상 도달해야 합니다.` : '탑 최고 기록을 더 올려야 현자의 돌을 더 받을 수 있습니다.' };
  p.stones += g; p.prestiges++; p.gold = 0; p.stonesFromBest = (p.stonesFromBest || 0) + g;
  for (const k of Object.keys(p.upgrades)) p.upgrades[k] = 0;
  return { ok: true, msg: `환생! 현자의 돌 +${g}`, gain: g };
}

// 게임 엔진에 넘길 보정값
export function modsOf(p) {
  const u = p.upgrades, stone = 1 + 0.05 * p.stones;
  return {
    atk: (1 + 0.1 * u.atk) * stone, hp: 1 + 0.1 * u.hp,
    attrAtk: Object.fromEntries(Object.entries(p.research).map(([a, lv]) => [a, 1 + RESEARCH_PER * lv])),
    dropEvery: dropEvery(u.drop), catPerRound: 1 + u.cat, baseHp: CFG.BASE_HP + 5 * u.base,
    startSlimes: CFG.START_SLIMES + 2 * u.start, goldMul: 1 + 0.2 * p.stones,
  };
}

// 오프라인 보상: 마지막 접속 이후 시간 x 최근 분당 골드 x OFFLINE_RATE (최대 OFFLINE_MAX_SEC)
export function offlineReward(p, now = Date.now()) {
  const sec = Math.min(OFFLINE_MAX_SEC, Math.max(0, (now - (p.lastSeen || now)) / 1000));
  if (sec < 60 || !p.goldRate) return { sec, gold: 0 };
  return { sec, gold: Math.floor((p.goldRate / 60) * sec * OFFLINE_RATE) };
}

// 숫자 줄여 표시: 1234 -> 1.2K
export function fmt(n) {
  n = Math.floor(n);
  const u = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [s, v] of u) if (Math.abs(n) >= v) return (n / v).toFixed(n / v >= 100 ? 0 : 1).replace(/\.0$/, '') + s;
  return String(n);
}

// ---------- 적응형 난이도 (챕터 전용, 무한의 탑 제외) ----------
// 챕터마다 기준 강화 레벨(PLAN_LV)이 있다. 플레이어 전투력이 기준보다 높으면 그 비율만큼 고블린도 강해지고
// 보상 골드도 늘어난다. 기준보다 약할 때는 쉬워지지 않는다 (성장해서 깨는 구조 유지).
export const PLAN_LV = { 1: 1, 2: 2, 3: 5, 4: 8, 5: 12 };
export const ADAPT_ALPHA = 0.56;                  // 고블린 체력 배율 = (전투력 비율)^(ALPHA + CURVE x ln 비율) · tools/tune_adapt.mjs로 보정
export const ADAPT_CURVE = 0.04;                  // 기준보다 훨씬 강할수록 조금 더 강하게 따라감
export function planMods(lv) {
  const p = newProfile();
  for (const k of Object.keys(p.upgrades)) p.upgrades[k] = UPGRADES[k].max !== undefined ? Math.min(UPGRADES[k].max, lv) : lv;
  for (const k of Object.keys(p.research)) p.research[k] = Math.floor(lv / 3);
  return modsOf(p);
}
// 전투력: 공격 x 덱 속성 연구 평균 x sqrt(체력) x sqrt(지급 속도) x sqrt(거점 체력)
export function powerOf(mods, deck) {
  const syms = deck && deck.length ? deck : newProfile().deck;
  const attrs = syms.map(sym => ELEMENTS.find(e => e.sym === sym)?.attr).filter(Boolean);
  const res = attrs.length ? attrs.reduce((a, at) => a + ((mods.attrAtk && mods.attrAtk[at]) || 1), 0) / attrs.length : 1;
  return (mods.atk || 1) * res * Math.sqrt(mods.hp || 1) * Math.sqrt(CFG.DROP_EVERY / (mods.dropEvery || CFG.DROP_EVERY))
    * Math.sqrt((mods.baseHp || CFG.BASE_HP) / CFG.BASE_HP);
}
// 방어 투자 = 슬라임 체력 배율 x sqrt(거점 체력). 기준보다 높으면 고블린 공격력을 추가로 올린다 (탱커형 성장 견제)
export const ADAPT_DEF_EXP = 0.3;
export const defenseOf = mods => (mods.hp || 1) * Math.sqrt((mods.baseHp || CFG.BASE_HP) / CFG.BASE_HP);
export function adaptiveDiff(mods, chapter, deck, alpha = ADAPT_ALPHA, defExp = ADAPT_DEF_EXP) {
  const lv = PLAN_LV[chapter];
  if (!lv) return { diffHp: 1, diffAtk: 1, diffGold: 1, ratio: 1, defRatio: 1 };
  const plan = planMods(lv), ratio = powerOf(mods, deck) / powerOf(plan, null);
  const defRatio = defenseOf(mods) / defenseOf(plan), defAtk = defRatio > 1 ? Math.pow(defRatio, defExp) : 1;
  if (!(ratio > 1)) return { diffHp: 1, diffAtk: defAtk, diffGold: 1, ratio, defRatio };
  const hp = Math.pow(ratio, alpha + ADAPT_CURVE * Math.log(ratio));
  return { diffHp: hp, diffAtk: Math.sqrt(hp) * defAtk, diffGold: Math.sqrt(hp), ratio, defRatio };
}
