// 모든 밸런스 수치는 이 파일에서만 조정한다.
export const CFG = {
  W: 5, H: 5, D: 1,            // 판 가로·세로, 층 수(판 통합으로 1층)
  CAP: 25,                      // 배치 상한 (판 칸 수)
  TICK_MS: 1000,                // 1틱 = 1초: 고블린 1칸 이동 / 1마리 출발
  DROP_EVERY: 4,                // 슬라임 카드 지급 주기(틱) = 4초 (지급 속도 강화로 최대 2초)
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
  HP_GROWTH: 1.03,              // 라운드별 고블린 HP 성장
  ATK_GROWTH: 0.08,
  COMPOUND_MUL: 1.5,
  MIXTURE_MUL: 0.7,
  FUSION_MUL: 1.3,
  JOKE_MUL: 1.4,                // 비밀 족보(말장난) 슬라임 능력치 배율              // 속성 합성 슬라임 능력치 배율
  WEAK_MUL: 1.5,                // 고블린 약점 속성 피해 배율
  RESIST_MUL: 0.5,              // 고블린 내성 속성 피해 배율
  TRAP_FATIGUE_AFTER: 30,       // 포획 피로 시작(갇힌 초): 교착 해소용이므로 늦게
  TRAP_FATIGUE_STEP: 0.005,     // 포획 피로: 매초 최대 체력의 0.5%씩 누적 증가
  MEGA_ROUND: 5,
  TOWER_GROWTH: 1.14,           // 무한의 탑: 층마다 고블린 체력 x1.14 (공격은 제곱근)
  TOWER_GOLD_GROWTH: 1.1,       // 무한의 탑: 층마다 골드 x1.1
  TOWER_PREP: 6,
  GOLD_SCALE: 0.3,              // 골드 획득 전체 배율 (성장 속도 조절)                // 무한의 탑: 층 사이 준비(초)                // 메가 슬라임 조합 가능 라운드 (이 라운드부터)
  MEGA_MUL: 1.2,
  MEGA_ATK: 2.4,
  GOBLIN_ATK_MUL: 1.3,          // 오우거를 제외한 고블린 공격력 배율 (v2.5.2 +30%)
  GIANT_STOMP_MUL: 2,           // 오우거 짓밟기: 메가 구역에서 메가를 직접 공격할 때 피해 배율
  GIANT_TAP: 0.3,               // 오우거가 Lv1~4 슬라임을 밟고 지나갈 때 주는 피해 (공격력 배율)
  COMBO_MEGA_ATK: 1.0,          // 조합 메가(화학·비밀 족보·속성 합성 Lv5 x3) 공격 배율 · 동시에 1마리만
  COMBO_MEGA_HP: 0.15,          // 조합 메가 체력 배율 (원소 메가 공식 대비)
  COMBO_MEGA_MAX: 1,
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
// noDrop: 지급되지 않음. 물(WATER)은 v2.4.0부터 H₂O 화학 족보로만 얻고, H₂O가 물 슬라임 역할을 대신한다
export const ELEMENTS = [
  { sym: 'FIRE',  label: '불',   name: '불',   attr: 'fire',  color: '#ff6a3d', hp: 26, atk: 6, def: 0, unlock: 1, st: { name: 'burn', every: 1, dur: 3, mul: 0.7 } },
  { sym: 'WATER', label: '물',   name: '물',   attr: 'water', color: '#3aa0ff', hp: 34, atk: 4, def: 1, unlock: 1, noDrop: true, st: { name: 'slow', every: 1, dur: 2 } },
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
  { key: 'H2O',   label: 'H₂O',   name: '물',     attr: 'water', actsAs: 'WATER', need: { H: 2, O: 1 },        hp: 40, atk: 6, def: 2, color: '#3aa0ff', st: { name: 'slow', every: 1, dur: 2 } },
  { key: 'CO2',   label: 'CO₂',   name: '이산화탄소', need: { C: 1, O: 2 },     hp: 38, atk: 6, def: 2, color: '#8a93a8', st: { name: 'suffocate', every: 1, dur: 3 } },
  { key: 'NaCl',  label: 'NaCl',  name: '소금',   need: { Na: 1, Cl: 1 },      hp: 45, atk: 6, def: 3, color: '#e9eef5', st: { name: 'slow', every: 1, dur: 3 } },
  { key: 'NH3',   label: 'NH₃',   name: '암모니아', need: { N: 1, H: 3 },      hp: 40, atk: 7, def: 1, color: '#4fd1b0', st: { name: 'poison', every: 1, dur: 4, mul: 0.6 } },
  { key: 'Fe2O3', label: 'Fe₂O₃', name: '녹',     need: { Fe: 2, O: 3 },       hp: 70, atk: 6, def: 5, color: '#a8452a', st: { name: 'defdown', every: 1, dur: 4, val: 2.5, cap: 10 } },
  { key: 'H2SO4', label: 'H₂SO₄', name: '황산',   need: { H: 2, S: 1, O: 4 },  hp: 55, atk: 10, def: 3, color: '#e6c800', st: { name: 'corrode', every: 1, dur: 4, mul: 0.8 } },
  // ---- 확장 8종 ----
  { key: 'HCl',   label: 'HCl',   name: '염산',     need: { H: 1, Cl: 1 },       hp: 36, atk: 9, def: 1, color: '#c8f04a', st: { name: 'corrode', every: 1, dur: 3, mul: 0.7 } },
  { key: 'CH4',   label: 'CH₄',   name: '메탄',     need: { C: 1, H: 4 },        hp: 38, atk: 8, def: 1, color: '#9cc8ff', st: { name: 'explode', every: 2, mul: 1.0 } },
  { key: 'NO2',   label: 'NO₂',   name: '이산화질소', need: { N: 1, O: 2 },       hp: 38, atk: 7, def: 1, color: '#c8763a', st: { name: 'poison', every: 1, dur: 3, mul: 0.6, aoe: 0.3 } },
  { key: 'SO2',   label: 'SO₂',   name: '이산화황', need: { S: 1, O: 2 },        hp: 38, atk: 7, def: 1, color: '#e8dc6a', st: { name: 'suffocate', every: 1, dur: 3 } },
  { key: 'FeS',   label: 'FeS',   name: '황화철',   need: { Fe: 1, S: 1 },       hp: 66, atk: 6, def: 5, color: '#c8a838', st: { name: 'defdown', every: 1, dur: 3, val: 2, cap: 10 } },
  { key: 'UO2',   label: 'UO₂',   name: '이산화우라늄', need: { U: 1, O: 2 },    hp: 50, atk: 11, def: 3, color: '#4a5a3a', st: { name: 'radiate', every: 1, dur: 3, mul: 0.8, aoe: 0.4 } },
  { key: 'NaOH',  label: 'NaOH',  name: '가성소다', need: { Na: 1, O: 1, H: 1 }, hp: 44, atk: 9, def: 2, color: '#eef0ff', st: { name: 'corrode', every: 1, dur: 4, mul: 0.7 } },
  { key: 'H2O2',  label: 'H₂O₂',  name: '과산화수소', need: { H: 2, O: 2 },      hp: 40, atk: 8, def: 1, color: '#bfe8ff', st: { name: 'burn', every: 1, dur: 3, mul: 0.6 } },
];

// 비밀 족보: 말도 안 되지만 위트 있는 '화학식'. 정확히 일치하면 화학 족보·속성 합성보다 우선
// 같은 원소끼리도 가능(HeHe 등). onCreate: 만드는 순간 효과, healAura: 주변 슬라임 회복
export const JOKES = [
  { key: 'HEHE',   label: 'HeHe',   name: '헤헤',       need: { He: 2 },               hint: '웃음소리가 나는 기체 둘',     color: '#fff1a8', hp: 36, atk: 6,  def: 1, st: [{ name: 'stun', every: 2, dur: 1 }, { name: 'suffocate', every: 1, dur: 2 }] },
  { key: 'NANA',   label: 'NaNa',   name: '바나나',     need: { Na: 2 },               hint: '나... 나...?',               color: '#ffe14a', hp: 38, atk: 7,  def: 1, st: [{ name: 'stun', every: 2, dur: 1 }, { name: 'slow', every: 1, dur: 2 }] },
  { key: 'SUN',    label: 'SUN',    name: '태양',       need: { S: 1, U: 1, N: 1 },    hint: '하늘에 떠 있는 세 글자',       color: '#ffb020', hp: 44, atk: 12, def: 1, st: [{ name: 'burn', every: 1, dur: 3, mul: 0.7, aoe: 0.4 }, { name: 'radiate', every: 1, dur: 2, mul: 0.4 }] },
  { key: 'SOS',    label: 'SOS',    name: '구조 신호',  need: { S: 2, O: 1 },          hint: '살려주세요!',                  color: '#ff5a5a', hp: 60, atk: 4,  def: 4, onCreate: { baseHp: 3 }, st: [{ name: 'slow', every: 1, dur: 2 }] },
  { key: 'HOHOHO', label: 'HOHOHO', name: '산타',       need: { H: 3, O: 3 },          hint: '빨간 옷 할아버지의 웃음',      color: '#e03a3a', hp: 48, atk: 7,  def: 2, onCreate: { catalysts: 2 }, st: [{ name: 'freeze', every: 2, dur: 1 }] },
  { key: 'CHUU',   label: 'CHUU',   name: '츄',         need: { C: 1, H: 1, U: 2 },    hint: '쪽!',                          color: '#ff8ac8', hp: 40, atk: 8,  def: 1, st: [{ name: 'suffocate', every: 1, dur: 3 }, { name: 'stun', every: 4, dur: 1 }] },
  { key: 'CON',    label: 'CON',    name: '팝콘',       need: { C: 1, O: 1, N: 1 },    hint: '영화관 간식의 재료',           color: '#fff6d8', hp: 36, atk: 9,  def: 1, st: [{ name: 'explode', every: 2, mul: 1.0 }] },
  { key: 'HUSH',   label: 'HUSH',   name: '쉿',         need: { H: 2, U: 1, S: 1 },    hint: '도서관에서는 조용히',          color: '#3a4a8a', hp: 42, atk: 7,  def: 2, st: [{ name: 'stun', every: 2, dur: 1 }] },
  { key: 'COOKER', label: '전기밥솥', name: '전기밥솥', need: { FIRE: 1, WATER: 1, ELEC: 1 }, hint: '불·물·전기로 밥을 짓는 기계', color: '#e8eef8', hp: 70, atk: 4, def: 4, healAura: 0.04, st: [{ name: 'slow', every: 2, dur: 1 }] },
  { key: 'NADIVE', label: 'Na+물',  name: '나트륨 다이빙', need: { Na: 1, WATER: 1 },   hint: '절대 물에 넣지 마시오',        color: '#4aa8ff', hp: 30, atk: 10, def: 0, st: [{ name: 'explode', every: 2, mul: 2.0 }] },
  { key: 'FEFEFE', label: 'FeFeFe', name: '철벽',       need: { Fe: 3 },               hint: '철철철',                       color: '#6a7080', hp: 110, atk: 4, def: 9, st: [{ name: 'defdown', every: 1, dur: 3, val: 2, cap: 10 }] },
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
  // ---- 확장 20종: 8속성의 모든 두 속성 쌍(28쌍)이 결과를 갖도록 ----
  { key: 'FROSTFIRE', label: '얼음불꽃', pair: ['fire', 'ice'],     color: '#7fd8ff', hp: 36, atk: 9,  def: 1, st: [{ name: 'burn', every: 1, dur: 2, mul: 0.5 }, { name: 'freeze', every: 3, dur: 1 }] },
  { key: 'LAVA',      label: '용암',     pair: ['fire', 'earth'],   color: '#ff5a1f', hp: 62, atk: 8,  def: 4, st: [{ name: 'burn', every: 1, dur: 3, mul: 0.6 }, { name: 'defdown', every: 1, dur: 3, val: 1.5, cap: 8 }] },
  { key: 'NAPALM',    label: '네이팜',   pair: ['fire', 'poison'],  color: '#ff7a2a', hp: 34, atk: 9,  def: 0, st: [{ name: 'burn', every: 1, dur: 3, mul: 0.6, aoe: 0.3 }, { name: 'poison', every: 1, dur: 3, mul: 0.4 }] },
  { key: 'RAINSTORM', label: '폭풍우',   pair: ['water', 'wind'],   color: '#5a6f8f', hp: 40, atk: 6,  def: 1, st: [{ name: 'slow', every: 1, dur: 2 }, { name: 'suffocate', every: 2, dur: 2 }] },
  { key: 'ACIDRAIN',  label: '산성비',   pair: ['water', 'poison'], color: '#b8e04a', hp: 38, atk: 7,  def: 1, st: [{ name: 'corrode', every: 1, dur: 3, mul: 0.6, aoe: 0.3 }] },
  { key: 'HEAVYWATER',label: '중수',     pair: ['water', 'rad'],    color: '#3a5fd0', hp: 46, atk: 9,  def: 2, st: [{ name: 'radiate', every: 1, dur: 3, mul: 0.6 }, { name: 'slow', every: 2, dur: 1 }] },
  { key: 'AURORA',    label: '오로라',   pair: ['elec', 'ice'],     color: '#6fffd0', hp: 38, atk: 8,  def: 1, st: [{ name: 'chain', every: 1, mul: 0.5 }, { name: 'freeze', every: 2, dur: 1 }] },
  { key: 'THUNDER',   label: '뇌운',     pair: ['elec', 'wind'],    color: '#4a4f6a', hp: 36, atk: 10, def: 0, st: [{ name: 'chain', every: 1, mul: 0.8 }] },
  { key: 'MAGNET',    label: '자석',     pair: ['elec', 'earth'],   color: '#c94040', hp: 58, atk: 7,  def: 4, st: [{ name: 'stun', every: 2, dur: 1 }, { name: 'defdown', every: 1, dur: 3, val: 1.5, cap: 8 }] },
  { key: 'NEURO',     label: '신경독',   pair: ['elec', 'poison'],  color: '#c8ff4a', hp: 34, atk: 8,  def: 0, st: [{ name: 'stun', every: 3, dur: 1 }, { name: 'poison', every: 1, dur: 4, mul: 0.6 }] },
  { key: 'GAMMA',     label: '감마선',   pair: ['elec', 'rad'],     color: '#7aff5a', hp: 34, atk: 13, def: 0, pierce: true, st: [{ name: 'radiate', every: 1, dur: 2, mul: 0.5 }] },
  { key: 'BLIZZARD',  label: '눈보라',   pair: ['ice', 'wind'],     color: '#e6f6ff', hp: 40, atk: 6,  def: 1, st: [{ name: 'freeze', every: 2, dur: 1 }, { name: 'slow', every: 1, dur: 2 }] },
  { key: 'PERMAFROST',label: '영구동토', pair: ['ice', 'earth'],    color: '#a8c8d8', hp: 72, atk: 5,  def: 6, st: [{ name: 'freeze', every: 3, dur: 1 }, { name: 'defdown', every: 1, dur: 3, val: 1, cap: 6 }] },
  { key: 'TOXICICE',  label: '독고드름', pair: ['ice', 'poison'],   color: '#9fe89a', hp: 38, atk: 7,  def: 1, st: [{ name: 'poison', every: 1, dur: 4, mul: 0.6 }, { name: 'freeze', every: 3, dur: 1 }] },
  { key: 'CRYO',      label: '핵동결',   pair: ['ice', 'rad'],      color: '#c0f0ff', hp: 44, atk: 10, def: 2, st: [{ name: 'freeze', every: 2, dur: 1 }, { name: 'radiate', every: 1, dur: 2, mul: 0.5 }] },
  { key: 'SANDSTORM', label: '모래폭풍', pair: ['wind', 'earth'],   color: '#d8b46a', hp: 46, atk: 7,  def: 2, st: [{ name: 'stun', every: 3, dur: 1 }, { name: 'defdown', every: 1, dur: 2, val: 1, cap: 6 }] },
  { key: 'FALLOUT',   label: '낙진',     pair: ['wind', 'rad'],     color: '#8a8f6a', hp: 40, atk: 9,  def: 1, st: [{ name: 'radiate', every: 1, dur: 3, mul: 0.5, aoe: 0.5 }] },
  { key: 'SWAMP',     label: '독늪',     pair: ['earth', 'poison'], color: '#5f7a3a', hp: 56, atk: 6,  def: 3, st: [{ name: 'poison', every: 1, dur: 4, mul: 0.5 }, { name: 'slow', every: 1, dur: 2 }] },
  { key: 'ORE',       label: '우라늄광석', pair: ['earth', 'rad'],  color: '#5a5f6a', hp: 70, atk: 9,  def: 5, st: [{ name: 'radiate', every: 1, dur: 3, mul: 0.5 }] },
  { key: 'MUTAGEN',   label: '돌연변이', pair: ['poison', 'rad'],   color: '#a64dff', hp: 42, atk: 11, def: 1, decay: true, st: [{ name: 'poison', every: 1, dur: 3, mul: 0.6 }, { name: 'radiate', every: 1, dur: 3, mul: 0.6, aoe: 0.3 }] },
];

export const GOBLINS = {
  normal:  { name: '일반', desc: '슬라임을 공격하지 않음',   ch: '일', hp: 20,  atk: 0,  def: 0, spd: 1, leak: 1,  color: '#6cbf4b', weak: [], resist: [] },
  fighter: { name: '전투', desc: '높은 체력·방어',   ch: '전', hp: 45,  atk: 5,  def: 2, spd: 1, leak: 2,  color: '#c96a3a', weak: ['elec'], resist: ['earth'] },
  mage:    { name: '마법', desc: '3번에 1번 슬라임 봉인',   ch: '마', hp: 25,  atk: 3,  def: 0, spd: 1, leak: 2,  color: '#8f6bd6', weak: ['earth'], resist: ['fire'] },
  rider:   { name: '기마', desc: '2칸씩 이동',   ch: '기', hp: 22,  atk: 4,  def: 1, spd: 2, leak: 2,  color: '#d6b13c', weak: ['water', 'ice'], resist: ['wind'] },
  archer:  { name: '궁수', desc: '앞 2칸 슬라임 저격',   ch: '궁', hp: 18,  atk: 4,  def: 0, spd: 1, leak: 2,  range: 2, color: '#4fb39a', weak: ['wind'], resist: ['water'] },
  captain: { name: '대장', desc: '주변 고블린 공격·방어 강화',   ch: '대', hp: 40,  atk: 5,  def: 2, spd: 1, leak: 3,  aura: true, color: '#d64a4a', weak: ['poison'], resist: ['elec'] },
  giant:   { name: '초대형', desc: '2칸 크기, Lv5 슬라임만 멈춰서 공격 (Lv1~4는 밟고 지나가며 피해도 받지 않음), 메가 구역에서는 메가를 2배 피해로 짓밟음, 속성 상성 없음, 빙결·기절 면역, 피폭 내성 50%, 느림', ch: '초', hp: 400, atk: 20, def: 4, spd: 0.5, leak: 10, multi: 2, size: 2, fatigue: 0.2, lv5Only: true, megaStomp: true, chAnchor: true, stRes: { radiate: 0.5 }, immune: ['freeze', 'stun'], color: '#7a5a3a', weak: [], resist: [] }, // 속성 상성 없음 (v2.4.3) · 2틱에 1칸, 2칸 크기
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
// 초대형(오우거): 5라운드부터 매 라운드 등장, 챕터 N이면 N마리 (최대 GIANT_MAX)
export const GIANT_FROM = 5, GIANT_MAX = 5;
export const giantsFor = (chapter, round) => (round >= GIANT_FROM ? Math.min(GIANT_MAX, chapter) : 0);

export const ROUND_TABLE = [
  [['normal', 10]],                                                                                      // 10
  [['normal', 12], ['gasmask', 2]],                                                                      // 14
  [['normal', 10], ['fighter', 6], ['gasmask', 2]],                                                      // 18
  [['normal', 10], ['fighter', 8], ['armored', 2], ['cook', 2]],                                         // 22
  [['normal', 11], ['fighter', 6], ['rider', 8], ['shaman', 2], ['armored', 2], ['giant', 1]],           // 30 (두 바퀴 시작 · 오우거 등장)
  [['normal', 9], ['fighter', 8], ['archer', 8], ['rider', 4], ['cook', 3], ['gasmask', 3], ['giant', 1]], // 36
  [['fighter', 9], ['mage', 8], ['archer', 6], ['rider', 6], ['shaman', 4], ['armored', 6], ['giant', 1]], // 40
  [['normal', 7], ['fighter', 10], ['archer', 6], ['mage', 6], ['captain', 4], ['cook', 4], ['armored', 6], ['giant', 1]], // 44
  [['fighter', 9], ['rider', 8], ['mage', 6], ['captain', 4], ['smart', 8], ['shaman', 6], ['gasmask', 6], ['giant', 1]], // 48
  [['normal', 15], ['fighter', 10], ['armored', 6], ['captain', 4], ['smart', 8], ['shaman', 4], ['cook', 2], ['giant', 1]], // 50
];

// ---------- 챕터 (5개 x 10라운드) ----------
const ROUND_COUNTS = [10, 14, 18, 22, 30, 36, 40, 44, 48, 50];
// 고블린 첫 등장 라운드 (챕터가 올라갈수록 unlockShift만큼 앞당겨짐)
const FIRST_ROUND = { normal: 1, gasmask: 2, fighter: 3, armored: 4, cook: 4, rider: 5, shaman: 5, archer: 6, mage: 7, captain: 8, smart: 9 };

// 주력(focus) 고블린은 가중치 3, 일반 고블린은 초반에만 많이. 큰 나머지 방식으로 정확히 ROUND_COUNTS를 맞춘다
function genRounds({ focus = [], chapter, unlockShift = 0 }) {
  return ROUND_COUNTS.map((total, i) => {
    const r = i + 1;
    const giantN = giantsFor(chapter, r);
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
  { id: 1, name: '고블린 숲',   path: 'rows',    pathLabel: 'ㄹ자 (가로)',          hpMul: 2.01, atkMul: 1.35, boost: {},                         goldMul: 1.0, unlockAll: false, color: '#2f3a50', rounds: ROUND_TABLE },
  { id: 2, name: '화산 동굴',   path: 'cols',    pathLabel: 'ㄹ자 (세로)',          hpMul: 1.83, atkMul: 1.31, boost: { fire: 1.25, ice: 0.75 },    goldMul: 1.5, unlockAll: true,  color: '#4a2f2c', rounds: genRounds({ focus: ['armored', 'fighter', 'cook'], chapter: 2, unlockShift: 1 }) },
  { id: 3, name: '얼음 설원',   path: 'spiral',  pathLabel: '나선 (바깥→가운데)',   hpMul: 3.49, atkMul: 1.63, boost: { ice: 1.25, fire: 0.75 },     goldMul: 2.2, unlockAll: true,  color: '#2b4157', rounds: genRounds({ focus: ['rider', 'archer', 'smart'], chapter: 3, unlockShift: 2 }) },
  { id: 4, name: '독 늪',       path: 'rowsRev', pathLabel: 'ㄹ자 (아래→위)',       hpMul: 4.24, atkMul: 1.73, boost: { poison: 1.25, water: 0.85 }, goldMul: 3.2, unlockAll: true,  color: '#2d4030', rounds: genRounds({ focus: ['gasmask', 'shaman', 'mage'], chapter: 4, unlockShift: 3 }) },
  { id: 5, name: '고블린 왕성', path: 'colsRev', pathLabel: 'ㄹ자 (오른쪽→왼쪽)',   hpMul: 5.87, atkMul: 1.89, boost: { elec: 1.15, rad: 1.15 },     goldMul: 4.5, unlockAll: true,  color: '#3d2f4c', rounds: genRounds({ focus: ['captain', 'smart', 'armored', 'shaman'], chapter: 5, unlockShift: 4 }) },
];

// 무한의 탑: 챕터 5 클리어 후 열림. 층마다 고블린이 강해지고 끝이 없다 (편성은 engine.towerRound)
export const TOWER = { id: 6, name: '무한의 탑', path: 'spiral', pathLabel: '나선 (층마다 강해짐)', hpMul: 1.05, atkMul: 1.01, boost: {}, goldMul: 6, unlockAll: true, color: '#3a2830', rounds: [] };
