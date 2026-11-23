// 성장(메타) 시스템: 재화·강화·연구·덱·무한의 탑·환생·오프라인 보상
// DOM 의존 없음 (Node 시뮬레이터·테스트에서도 사용). 저장은 호출측이 storage 객체로 넘긴다.
import { CFG, ELEMENTS, ATTRS } from './data.js';

export const PROFILE_KEY = 'esd.profile.v1';
export const DECK_SIZE = 8;                 // 덱 편성 장수
export const OFFLINE_MAX_SEC = 8 * 3600;    // 오프라인 보상 최대 8시간
export const OFFLINE_RATE = 0.5;            // 오프라인 보상 = 최근 분당 골드의 50%
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
export const dropEvery = lv => Math.max(1, CFG.DROP_EVERY - 0.5 * lv);

// 속성 연구 (원소 결정): 레벨당 해당 속성 슬라임 공격 +10%
export const RESEARCH_PER = 0.1;
export const researchCost = lv => 1 + lv;

export function newProfile() {
  return {
    v: 1, gold: 0, crystals: 0, stones: 0, prestiges: 0,
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
    research: Object.fromEntries(Object.keys(ATTRS).map(k => [k, 0])),
    deck: ['FIRE', 'WATER', 'ELEC', 'O', 'H', 'C', 'N', 'Fe'],
    towerBest: 0, totalGold: 0, goldRate: 0, lastSeen: Date.now(),
  };
}

export function loadProfile(storage) {
  try {
    const p = JSON.parse(storage?.getItem(PROFILE_KEY) || 'null');
    if (!p || p.v !== 1) return newProfile();
    const base = newProfile();
    return { ...base, ...p, upgrades: { ...base.upgrades, ...p.upgrades }, research: { ...base.research, ...p.research } };
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

// 덱: 정확히 DECK_SIZE장. 순수 속성 슬라임 포함 13종 중 선택
export const DECK_POOL = ELEMENTS.map(e => e.sym);
export function toggleDeck(p, sym) {
  const i = p.deck.indexOf(sym);
  if (i >= 0) { if (p.deck.length <= 4) return { ok: false, msg: '덱은 최소 4장이어야 합니다.' }; p.deck.splice(i, 1); return { ok: true }; }
  if (p.deck.length >= DECK_SIZE) return { ok: false, msg: `덱은 최대 ${DECK_SIZE}장입니다.` };
  p.deck.push(sym); return { ok: true };
}

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

// 오프라인 보상: 마지막 접속 이후 시간 x 최근 분당 골드 x 50% (최대 8시간)
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
