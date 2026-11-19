// 모든 밸런스 수치는 이 파일에서만 조정한다.
export const CFG = {
  W: 5, H: 5, D: 1,            // 판 가로·세로, 층 수(판 통합으로 1층)
  CAP: 25,                      // 배치 상한 (판 칸 수)
  TICK_MS: 3000,                // 1틱 = 3초 (슬라임 1개 지급)
  QUEUE_MAX: 10,                // 덱(손패) 최대 장수
  BASE_HP: 20,
  MAX_LV: 5,
  LV_STEP: 0.6,                 // 능력치 = 기본 x (1 + 0.6 x (Lv-1))
  ROUNDS: 10,
  FIRST_PREP: 8,                // 게임 시작 준비 틱
  PREP_TICKS: 4,                // 라운드 사이 준비 틱
  START_SLIMES: 6,
  ROUND_BONUS_SLIMES: 3,
  CATALYST_START: 2,
  HP_GROWTH: 1.5,              // 라운드별 고블린 HP 성장
  ATK_GROWTH: 0.08,
  COMPOUND_MUL: 1.5,
  MIXTURE_MUL: 0.7,
  MEGA_MUL: 1.2,
  MEGA_ATK: 2.4,
  MEGA_MAX_TARGETS: 5,
  GROUP2_TAKEN: 0.9,            // 동일 원소 2개 이상: 받는 피해 -10%
  GROUP3_ATK: 1.2,              // 동일 원소 3개 이상: 공격 +20%
  COLUMN_ATK: 1.2,              // 같은 가로줄 동일 원소 3개: 공격 +20%
};

// ㄹ자 경로 (최상단 5x5): (0,0)->(4,0) ↓ (4,1)->(0,1) ↓ ...
export function buildPath() {
  const p = [];
  for (let y = 0; y < CFG.H; y++) {
    for (let i = 0; i < CFG.W; i++) p.push([y % 2 === 0 ? i : CFG.W - 1 - i, y]);
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
};

export const ELEMENTS = [
  { sym: 'O',  name: '산소',   color: '#4fa3ff', hp: 30, atk: 4, def: 1, unlock: 1, st: { name: 'suffocate', every: 1, dur: 2 } },
  { sym: 'H',  name: '수소',   color: '#bfe6ff', hp: 25, atk: 6, def: 0, unlock: 1, st: { name: 'burn', every: 1, dur: 3, mul: 0.6 } },
  { sym: 'C',  name: '탄소',   color: '#5b6070', hp: 40, atk: 5, def: 2, unlock: 1, st: { name: 'stun', every: 3, dur: 1 } },
  { sym: 'N',  name: '질소',   color: '#5fd4ff', hp: 28, atk: 3, def: 1, unlock: 1, st: { name: 'freeze', every: 2, dur: 1 } },
  { sym: 'Fe', name: '철',     color: '#b5651d', hp: 60, atk: 3, def: 4, unlock: 1, st: { name: 'defdown', every: 1, dur: 3, val: 1.5, cap: 8 } },
  { sym: 'He', name: '헬륨',   color: '#ffe9a8', hp: 20, atk: 4, def: 0, unlock: 3, st: { name: 'float', every: 2, dur: 2 } },
  { sym: 'Na', name: '나트륨', color: '#ff9d2e', hp: 22, atk: 5, def: 1, unlock: 3, st: { name: 'explode', every: 3, mul: 1.2 } },
  { sym: 'Cl', name: '염소',   color: '#8fd14f', hp: 30, atk: 4, def: 1, unlock: 5, st: { name: 'poison', every: 1, dur: 4, mul: 0.5 } },
  { sym: 'S',  name: '황',     color: '#f2d21b', hp: 35, atk: 4, def: 2, unlock: 5, st: { name: 'corrode', every: 1, dur: 3, mul: 0.5 } },
  { sym: 'U',  name: '우라늄', color: '#a64dff', hp: 40, atk: 8, def: 2, unlock: 7, st: { name: 'radiate', every: 1, dur: 3, mul: 0.5, aoe: 0.3 } },
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

export const GOBLINS = {
  normal:  { name: '일반',   ch: '일', hp: 20,  atk: 0,  def: 0, spd: 1, leak: 1,  color: '#6cbf4b' },
  fighter: { name: '전투',   ch: '전', hp: 45,  atk: 5,  def: 2, spd: 1, leak: 2,  color: '#c96a3a' },
  mage:    { name: '마법',   ch: '마', hp: 25,  atk: 3,  def: 0, spd: 1, leak: 2,  color: '#8f6bd6' },
  rider:   { name: '기마',   ch: '기', hp: 22,  atk: 4,  def: 1, spd: 2, leak: 2,  color: '#d6b13c' },
  archer:  { name: '궁수',   ch: '궁', hp: 18,  atk: 4,  def: 0, spd: 1, leak: 2,  range: 2, color: '#4fb39a' },
  captain: { name: '대장',   ch: '대', hp: 40,  atk: 5,  def: 2, spd: 1, leak: 3,  aura: true, color: '#d64a4a' },
  giant:   { name: '초대형', ch: '초', hp: 200, atk: 10, def: 4, spd: 0.5, leak: 10, multi: 2, size: 2, color: '#7a5a3a' }, // 2틱에 1칸, 2칸 크기
  smart:   { name: '지능형', ch: '지', hp: 30,  atk: 4,  def: 1, spd: 1, leak: 3,  evade: 1, cleanse: true, color: '#3ab0d6' },
};

// 라운드별 편성 [종류, 마릿수]. 목록을 번갈아 섞어 스폰한다.
export const ROUND_TABLE = [
  [['normal', 6]],
  [['normal', 10]],
  [['normal', 8], ['fighter', 3]],
  [['normal', 8], ['fighter', 6]],
  [['normal', 8], ['fighter', 4], ['rider', 4]],
  [['normal', 6], ['fighter', 5], ['archer', 4]],
  [['fighter', 6], ['mage', 4], ['archer', 4], ['rider', 4]],
  [['fighter', 8], ['archer', 4], ['mage', 3], ['captain', 2]],
  [['fighter', 8], ['rider', 5], ['mage', 3], ['captain', 3], ['smart', 4]],
  [['normal', 10], ['fighter', 10], ['captain', 2], ['smart', 4], ['giant', 2]],
];
