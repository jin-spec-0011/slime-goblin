// 모든 밸런스 수치는 이 파일에서만 조정한다.
export const CFG = {
  W: 5, H: 5, D: 1,            // 판 가로·세로, 층 수(판 통합으로 1층)
  CAP: 25,                      // 배치 상한 (판 칸 수)
  TICK_MS: 1000,                // 1틱 = 1초: 고블린 1칸 이동 / 1마리 출발
  DROP_EVERY: 3,                // 슬라임 카드 지급 주기(틱) = 3초
  QUEUE_MAX: 10,                // 덱(손패) 최대 장수
  BASE_HP: 20,
  MAX_LV: 5,
  LV_STEP: 0.6,                 // 능력치 = 기본 x (1 + 0.6 x (Lv-1))
  ROUNDS: 10,
  FIRST_PREP: 24,               // 게임 시작 준비 틱(초)
  PREP_TICKS: 12,               // 라운드 사이 준비 틱(초)
  START_SLIMES: 6,
  AUTO_FIELD: true,             // 지급 슬라임을 필드 빈칸에 랜덤 배치, 필드가 가득 차면 덱으로
  ROUND_BONUS_SLIMES: 3,
  CATALYST_START: 2,
  HP_GROWTH: 1.12,              // 라운드별 고블린 HP 성장
  ATK_GROWTH: 0.08,
  COMPOUND_MUL: 1.5,
  MIXTURE_MUL: 0.7,
  FUSION_MUL: 1.3,              // 속성 합성 슬라임 능력치 배율
  WEAK_MUL: 1.5,                // 고블린 약점 속성 피해 배율
  RESIST_MUL: 0.5,              // 고블린 내성 속성 피해 배율
  MEGA_ROUND: 5,                // 메가 슬라임 조합 가능 라운드 (이 라운드부터)
  MEGA_MUL: 1.2,
  MEGA_ATK: 2.4,
  MEGA_MAX_TARGETS: 5,
  GROUP2_TAKEN: 0.9,            // 동일 원소 2개 이상: 받는 피해 -10%
  GROUP3_ATK: 1.2,              // 동일 원소 3개 이상: 공격 +20%
  COLUMN_ATK: 1.2,              // 같은 가로줄 동일 원소 3개: 공격 +20%
};

// ㄹ자 경로 (최상단 5x5): (0,0)->(4,0) ↓ (4,1)->(0,1) ↓ ...
// 경로 모양 (5x5 전 칸을 한 번씩 지나는 한붓그리기)
//  rows: 가로 ㄹ자 / cols: 세로 ㄹ자 / spiral: 바깥->가운데 나선 / rowsRev: 아래->위 가로 ㄹ자 / colsRev: 오른쪽->왼쪽 세로 ㄹ자
export function buildPath(kind = 'rows') {
  const p = [], W = CFG.W, H = CFG.H;
  if (kind === 'cols' || kind === 'colsRev') {
    for (let i = 0; i < W; i++) {
      const x = kind === 'cols' ? i : W - 1 - i;
      for (let j = 0; j < H; j++) p.push([x, i % 2 === 0 ? j : H - 1 - j]);
    }
  } else if (kind === 'spiral') {
    let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
    while (x0 <= x1 && y0 <= y1) {
      for (let x = x0; x <= x1; x++) p.push([x, y0]);
      for (let y = y0 + 1; y <= y1; y++) p.push([x1, y]);
      if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) p.push([x, y1]);
      if (x0 < x1) for (let y = y1 - 1; y > y0; y--) p.push([x0, y]);
      x0++; y0++; x1--; y1--;
    }
  } else {
    for (let j = 0; j < H; j++) {
      const y = kind === 'rowsRev' ? H - 1 - j : j;
      for (let i = 0; i < W; i++) p.push([j % 2 === 0 ? i : W - 1 - i, y]);
    }
  }
  return p;
}

// 상태이상 정의
export const STATUS = {
  burn:     { label: '화상', kind: 'dot',  color: '#ff6a3d' },
  poison:   { label: '독',   kind: 'dot',  color: '#8fd14f' },
  corrode:  { label: '부식', kind: 'dot',  color: '#f2d21b' },
  radiate:  { label: '피폭', kind: 'dot',  color: '#c27bff' },
  freeze:   { label: '빙결', kind: 'lock', color: '#7fe3ff' },
  stun:     { label: '기절', kind: 'lock', color: '#aaa' },
  slow:     { label: '감속', kind: 'slow', color: '#5aa8ff' },
  suffocate:{ label: '질식', kind: 'atkdown', color: '#9cb8d9' },
  defdown:  { label: '방깎', kind: 'defdown', color: '#d98a4a' },
  float:    { label: '부양', kind: 'float', color: '#ffe9a8' },
  explode:  { label: '폭발', kind: 'explode', color: '#ff9d2e' },
  chain:    { label: '연쇄', kind: 'explode', color: '#ffe14d' }, // 전기: 옆 칸 고블린에게도 피해
};

// 속성 8종 (초기 컨셉: 원소를 모티브로 한 속성 슬라임)
export const ATTRS = {
  fire:   { label: '불',   icon: '🔥', color: '#ff6a3d' },
  water:  { label: '물',   icon: '💧', color: '#3aa0ff' },
  elec:   { label: '전기', icon: '⚡', color: '#ffd84d' },
  ice:    { label: '얼음', icon: '❄', color: '#7fe3ff' },
  wind:   { label: '바람', icon: '🌪', color: '#bfe6d0' },
  earth:  { label: '대지', icon: '⛰', color: '#b5893d' },
  poison: { label: '독',   icon: '☠', color: '#8fd14f' },
  rad:    { label: '방사', icon: '☢', color: '#c27bff' },
};

// 원소·속성 슬라임. attr = 소속 속성. FIRE/WATER/ELEC는 원소가 아닌 순수 속성 슬라임
export const ELEMENTS = [
  { sym: 'FIRE',  label: '불',   name: '불',   attr: 'fire',  color: '#ff6a3d', hp: 26, atk: 6, def: 0, unlock: 1, st: { name: 'burn', every: 1, dur: 3, mul: 0.7 } },
  { sym: 'WATER', label: '물',   name: '물',   attr: 'water', color: '#3aa0ff', hp: 34, atk: 4, def: 1, unlock: 1, st: { name: 'slow', every: 1, dur: 2 } },
  { sym: 'ELEC',  label: '전기', name: '전기', attr: 'elec',  color: '#ffd84d', hp: 24, atk: 5, def: 0, unlock: 1, st: { name: 'chain', every: 1, mul: 0.5 } },
  { sym: 'O',  attr: 'wind', name: '산소',   color: '#4fa3ff', hp: 30, atk: 4, def: 1, unlock: 1, st: { name: 'suffocate', every: 1, dur: 2 } },
  { sym: 'H',  attr: 'fire', name: '수소',   color: '#bfe6ff', hp: 25, atk: 6, def: 0, unlock: 1, st: { name: 'burn', every: 1, dur: 3, mul: 0.6 } },
  { sym: 'C',  attr: 'earth', name: '탄소',   color: '#5b6070', hp: 40, atk: 5, def: 2, unlock: 1, st: { name: 'stun', every: 3, dur: 1 } },
  { sym: 'N',  attr: 'ice', name: '질소',   color: '#5fd4ff', hp: 28, atk: 3, def: 1, unlock: 1, st: { name: 'freeze', every: 2, dur: 1 } },
  { sym: 'Fe', attr: 'earth', name: '철',     color: '#b5651d', hp: 60, atk: 3, def: 4, unlock: 1, st: { name: 'defdown', every: 1, dur: 3, val: 1.5, cap: 8 } },
  { sym: 'He', attr: 'wind', name: '헬륨',   color: '#ffe9a8', hp: 20, atk: 4, def: 0, unlock: 3, st: { name: 'float', every: 2, dur: 2 } },
  { sym: 'Na', attr: 'elec', name: '나트륨', color: '#ff9d2e', hp: 22, atk: 5, def: 1, unlock: 3, st: { name: 'explode', every: 3, mul: 1.2 } },
  { sym: 'Cl', attr: 'poison', name: '염소',   color: '#8fd14f', hp: 30, atk: 4, def: 1, unlock: 5, st: { name: 'poison', every: 1, dur: 4, mul: 0.5 } },
  { sym: 'S',  attr: 'fire', name: '황',     color: '#f2d21b', hp: 35, atk: 4, def: 2, unlock: 5, st: { name: 'corrode', every: 1, dur: 3, mul: 0.5 } },
  { sym: 'U',  attr: 'rad', name: '우라늄', color: '#a64dff', hp: 40, atk: 8, def: 2, unlock: 7, st: { name: 'radiate', every: 1, dur: 3, mul: 0.5, aoe: 0.3 } },
];

// 화합물 족보 (재료는 원소 슬라임 개수 기준)
export const RECIPES = [
  { key: 'H2O',   label: 'H₂O',   name: '물',     need: { H: 2, O: 1 },        hp: 40, atk: 6, def: 2, color: '#3aa0ff', st: { name: 'slow', every: 1, dur: 2 } },
  { key: 'CO2',   label: 'CO₂',   name: '이산화탄소', need: { C: 1, O: 2 },     hp: 38, atk: 6, def: 2, color: '#8a93a8', st: { name: 'suffocate', every: 1, dur: 3 } },
  { key: 'NaCl',  label: 'NaCl',  name: '소금',   need: { Na: 1, Cl: 1 },      hp: 45, atk: 6, def: 3, color: '#e9eef5', st: { name: 'slow', every: 1, dur: 3 } },
  { key: 'NH3',   label: 'NH₃',   name: '암모니아', need: { N: 1, H: 3 },      hp: 40, atk: 7, def: 1, color: '#4fd1b0', st: { name: 'poison', every: 1, dur: 4, mul: 0.6 } },
  { key: 'Fe2O3', label: 'Fe₂O₃', name: '녹',     need: { Fe: 2, O: 3 },       hp: 70, atk: 6, def: 5, color: '#a8452a', st: { name: 'defdown', every: 1, dur: 4, val: 2.5, cap: 10 } },
  { key: 'H2SO4', label: 'H₂SO₄', name: '황산',   need: { H: 2, S: 1, O: 4 },  hp: 55, atk: 10, def: 3, color: '#e6c800', st: { name: 'corrode', every: 1, dur: 4, mul: 0.8 } },
];

// 속성 합성 (촉매 1개 + 서로 다른 속성 슬라임 2마리). pair 순서 무관
export const FUSIONS = [
  { key: 'STEAM',  label: '수증기',   pair: ['water', 'fire'],   color: '#d8e4ee', hp: 40, atk: 6,  def: 1, st: [{ name: 'slow', every: 1, dur: 2 }, { name: 'suffocate', every: 1, dur: 2 }] },
  { key: 'PLASMA', label: '플라즈마', pair: ['elec', 'fire'],    color: '#ff5fd2', hp: 34, atk: 11, def: 0, pierce: true, st: [{ name: 'burn', every: 1, dur: 2, mul: 0.5 }] },
  { key: 'SHOCK',  label: '감전수',   pair: ['water', 'elec'],   color: '#5fd4ff', hp: 38, atk: 7,  def: 1, st: [{ name: 'chain', every: 1, mul: 0.6 }, { name: 'slow', every: 2, dur: 1 }] },
  { key: 'FROST',  label: '서리',     pair: ['ice', 'water'],    color: '#c9f3ff', hp: 40, atk: 5,  def: 2, st: [{ name: 'freeze', every: 1, dur: 2 }] },
  { key: 'STORM',  label: '화염폭풍', pair: ['wind', 'fire'],    color: '#ff9d2e', hp: 34, atk: 8,  def: 0, st: [{ name: 'burn', every: 1, dur: 3, mul: 0.6, aoe: 0.4 }] },
  { key: 'MUD',    label: '진흙',     pair: ['earth', 'water'],  color: '#8a6a3a', hp: 60, atk: 5,  def: 4, st: [{ name: 'slow', every: 1, dur: 3 }, { name: 'defdown', every: 1, dur: 3, val: 1.5, cap: 8 }] },
  { key: 'MIASMA', label: '독안개',   pair: ['poison', 'wind'],  color: '#9fd14f', hp: 34, atk: 6,  def: 1, st: [{ name: 'poison', every: 1, dur: 4, mul: 0.6, aoe: 0.4 }] },
  { key: 'FUSION', label: '핵융합',   pair: ['rad', 'fire'],     color: '#e05cff', hp: 45, atk: 14, def: 2, pierce: true, decay: true, st: [{ name: 'radiate', every: 1, dur: 3, mul: 0.7, aoe: 0.5 }] },
];

export const GOBLINS = {
  normal:  { name: '일반', desc: '슬라임을 공격하지 않음',   ch: '일', hp: 20,  atk: 0,  def: 0, spd: 1, leak: 1,  color: '#6cbf4b', weak: [], resist: [] },
  fighter: { name: '전투', desc: '높은 체력·방어',   ch: '전', hp: 45,  atk: 5,  def: 2, spd: 1, leak: 2,  color: '#c96a3a', weak: ['elec'], resist: ['earth'] },
  mage:    { name: '마법', desc: '3번에 1번 슬라임 봉인',   ch: '마', hp: 25,  atk: 3,  def: 0, spd: 1, leak: 2,  color: '#8f6bd6', weak: ['earth'], resist: ['fire'] },
  rider:   { name: '기마', desc: '2칸씩 이동',   ch: '기', hp: 22,  atk: 4,  def: 1, spd: 2, leak: 2,  color: '#d6b13c', weak: ['water', 'ice'], resist: ['wind'] },
  archer:  { name: '궁수', desc: '앞 2칸 슬라임 저격',   ch: '궁', hp: 18,  atk: 4,  def: 0, spd: 1, leak: 2,  range: 2, color: '#4fb39a', weak: ['wind'], resist: ['water'] },
  captain: { name: '대장', desc: '주변 고블린 공격·방어 강화',   ch: '대', hp: 40,  atk: 5,  def: 2, spd: 1, leak: 3,  aura: true, color: '#d64a4a', weak: ['poison'], resist: ['elec'] },
  giant:   { name: '초대형', desc: '2칸 크기, 슬라임 2마리 동시 공격, 느림', ch: '초', hp: 200, atk: 10, def: 4, spd: 0.5, leak: 10, multi: 2, size: 2, color: '#7a5a3a', weak: ['rad', 'elec'], resist: ['ice'] }, // 2틱에 1칸, 2칸 크기
  smart:   { name: '지능형', desc: '함정 1회 회피, 상태이상 정화', ch: '지', hp: 30,  atk: 4,  def: 1, spd: 1, leak: 3,  evade: 1, cleanse: true, color: '#3ab0d6', weak: ['water'], resist: ['poison'] },
  // ---- 개편 추가 4종 ----
  gasmask: { name: '방독', desc: '독·질식 면역', ch: '독', hp: 34,  atk: 4,  def: 1, spd: 1, leak: 2,  immune: ['poison', 'suffocate'], color: '#5f7a4a', weak: ['fire'], resist: ['poison', 'wind'] }, // 독·질식 면역
  armored: { name: '중갑', desc: '방어 6 (관통 슬라임에 약함)', ch: '갑', hp: 70,  atk: 4,  def: 6, spd: 1, leak: 3,  color: '#8e96a3', weak: ['elec', 'water'], resist: ['earth', 'fire'] }, // 방어 6 (관통 슬라임에 약함)
  shaman:  { name: '주술사', desc: '2초마다 주변 고블린 8% 회복', ch: '주', hp: 26, atk: 2,  def: 0, spd: 1, leak: 2,  heal: 0.08, color: '#4b4f7a', weak: ['rad'], resist: ['ice'] }, // 2틱마다 앞뒤 2칸 고블린 최대HP 8% 회복
  cook:    { name: '요리사', desc: '쓰러지면 주변 고블린 40% 회복 + 공격 +20%', ch: '요', hp: 38, atk: 3,  def: 1, spd: 1, leak: 2,  feast: 0.4, color: '#d9c2a0', weak: ['water'], resist: ['fire'] },  // 쓰러지면 앞뒤 2칸 고블린 40% 회복 + 공격 +20%
};

// 라운드별 편성 [종류, 마릿수]. 목록을 번갈아 섞어 1초에 1마리씩 출발한다.
// 1~4라운드: 경로 한 바퀴(25칸 = 25초) 안에 전원 출발 (최대 25마리)
// 5~10라운드: 두 바퀴(50초) 동안 계속 출발 (26~50마리)
export const ROUND_TABLE = [
  [['normal', 10]],                                                                                      // 10
  [['normal', 12], ['gasmask', 2]],                                                                      // 14
  [['normal', 10], ['fighter', 6], ['gasmask', 2]],                                                      // 18
  [['normal', 10], ['fighter', 8], ['armored', 2], ['cook', 2]],                                         // 22
  [['normal', 12], ['fighter', 6], ['rider', 8], ['shaman', 2], ['armored', 2]],                         // 30 (두 바퀴 시작)
  [['normal', 10], ['fighter', 8], ['archer', 8], ['rider', 4], ['cook', 3], ['gasmask', 3]],            // 36
  [['fighter', 10], ['mage', 8], ['archer', 6], ['rider', 6], ['shaman', 4], ['armored', 6]],            // 40
  [['normal', 8], ['fighter', 10], ['archer', 6], ['mage', 6], ['captain', 4], ['cook', 4], ['armored', 6]], // 44
  [['fighter', 10], ['rider', 8], ['mage', 6], ['captain', 4], ['smart', 8], ['shaman', 6], ['gasmask', 6]], // 48
  [['normal', 12], ['fighter', 10], ['armored', 6], ['captain', 4], ['smart', 8], ['shaman', 4], ['cook', 2], ['giant', 4]], // 50
];

// ---------- 챕터 (5개 x 10라운드) ----------
const ROUND_COUNTS = [10, 14, 18, 22, 30, 36, 40, 44, 48, 50];
// 고블린 첫 등장 라운드 (챕터가 올라갈수록 unlockShift만큼 앞당겨짐)
const FIRST_ROUND = { normal: 1, gasmask: 2, fighter: 3, armored: 4, cook: 4, rider: 5, shaman: 5, archer: 6, mage: 7, captain: 8, smart: 9 };

// 주력(focus) 고블린은 가중치 3, 일반 고블린은 초반에만 많이. 큰 나머지 방식으로 정확히 ROUND_COUNTS를 맞춘다
function genRounds({ focus = [], giants = 4, unlockShift = 0 }) {
  return ROUND_COUNTS.map((total, i) => {
    const r = i + 1;
    const giantN = r === 10 ? giants : r >= 8 && unlockShift >= 3 ? 1 : 0;
    const types = Object.keys(FIRST_ROUND).filter(k => Math.max(1, FIRST_ROUND[k] - unlockShift) <= r);
    const w = types.map(k => (focus.includes(k) ? 3 : k === 'normal' ? Math.max(0.3, 2 - r * 0.25) : 1));
    const sum = w.reduce((a, b) => a + b, 0), n = total - giantN;
    const raw = w.map(x => (x / sum) * n), cnt = raw.map(Math.floor);
    let left = n - cnt.reduce((a, b) => a + b, 0);
    raw.map((x, k) => [x - Math.floor(x), k]).sort((a, b) => b[0] - a[0]).forEach(([, k]) => { if (left > 0) { cnt[k]++; left--; } });
    const row = types.map((k, j) => [k, cnt[j]]).filter(([, c]) => c > 0);
    if (giantN) row.push(['giant', giantN]);
    return row;
  });
}

export const CHAPTERS = [
  { id: 1, name: '고블린 숲',   path: 'rows',    pathLabel: 'ㄹ자 (가로)',          hpMul: 1.0, atkMul: 1.0, boost: {},                         unlockAll: false, color: '#2f3a50', rounds: ROUND_TABLE },
  { id: 2, name: '화산 동굴',   path: 'cols',    pathLabel: 'ㄹ자 (세로)',          hpMul: 1.6, atkMul: 1.15, boost: { fire: 1.25, ice: 0.75 },    unlockAll: true,  color: '#4a2f2c', rounds: genRounds({ focus: ['armored', 'fighter', 'cook'], giants: 4, unlockShift: 1 }) },
  { id: 3, name: '얼음 설원',   path: 'spiral',  pathLabel: '나선 (바깥→가운데)',   hpMul: 1.7, atkMul: 1.3, boost: { ice: 1.25, fire: 0.75 },     unlockAll: true,  color: '#2b4157', rounds: genRounds({ focus: ['rider', 'archer', 'smart'], giants: 5, unlockShift: 2 }) },
  { id: 4, name: '독 늪',       path: 'rowsRev', pathLabel: 'ㄹ자 (아래→위)',       hpMul: 4.0, atkMul: 1.45, boost: { poison: 1.25, water: 0.85 }, unlockAll: true,  color: '#2d4030', rounds: genRounds({ focus: ['gasmask', 'shaman', 'mage'], giants: 5, unlockShift: 3 }) },
  { id: 5, name: '고블린 왕성', path: 'colsRev', pathLabel: 'ㄹ자 (오른쪽→왼쪽)',   hpMul: 4.4, atkMul: 1.6, boost: { elec: 1.15, rad: 1.15 },     unlockAll: true,  color: '#3d2f4c', rounds: genRounds({ focus: ['captain', 'smart', 'armored', 'shaman'], giants: 8, unlockShift: 4 }) },
];
