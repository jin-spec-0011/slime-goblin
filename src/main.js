// UI · 렌더링 · 입력 (Canvas 2D)
import { CFG, STATUS, RECIPES, ELEMENTS, GOBLINS, ATTRS, FUSIONS, CHAPTERS, JOKES } from './data.js';
import { drawSlimeArt, drawGoblinArt, loadAssets, walkFrames, walkFrameMs } from './sprites.js';
import {
  loadProfile, saveProfile, modsOf, UPGRADES, upgradeCost, isMaxed, buyUpgrade, buyResearch, researchCost, RESEARCH_PER,
  DECK_POOL, DECK_SIZE, toggleDeck, stoneGain, prestige, PRESTIGE_MIN_FLOOR, offlineReward, fmt,
} from './meta.js';
import {
  autoPlay, setMods, createGame, step, placeFromQueue, moveSlime, combine, makeMega, recipeHint, skipPrep,
  getCell, slimeCount, PATH, lvMult,
} from './engine.js';

const $ = id => document.getElementById(id);
const EL = Object.fromEntries(ELEMENTS.map(e => [e.sym, e]));
const LS_BEST = 'esd.bestRound';
const LS_UNLOCK = 'esd.unlockedChapter'; // 열린 최고 챕터 번호
const lsBest = n => `esd.best.${n}`;     // 챕터별 최고 기록 (라운드 수, 11 = 클리어)
const unlocked = () => Math.min(CHAPTERS.length + 1, Math.max(1, +(lsGet(LS_UNLOCK) || 1))); // 6 = 무한의 탑 열림
const TOWER_ID = CHAPTERS.length + 1;
// ---------- 성장 프로필 (골드·결정·현자의 돌·강화·연구·덱) ----------
const STORE = { getItem: k => lsGet(k), setItem: (k, v) => lsSet(k, v) };
const PROF = loadProfile(STORE);
let lastSave = 0;
function saveProf(force = false) {
  const now = performance.now();
  if (!force && now - lastSave < 2000) return;
  lastSave = now; PROF.lastSeen = Date.now(); saveProfile(STORE, PROF);
}
// 게임에서 번 골드·결정을 프로필에 반영 (변화분만), 분당 골드 기록 (오프라인 보상 계산용)
function commitEarnings(realDt) {
  const g = ui.g, dg = g.gold - ui.commitGold, dc = g.crystals - ui.commitCrys;
  if (dg > 0) { PROF.gold += dg; PROF.totalGold += dg; ui.commitGold = g.gold; ui.sessionGold += dg; }
  if (dc > 0) { PROF.crystals += dc; ui.commitCrys = g.crystals; }
  if (realDt) ui.sessionSec += realDt / 1000;
  if (ui.sessionSec > 60) PROF.goldRate = (ui.sessionGold / ui.sessionSec) * 60;
  saveProf();
}
export const APP_VERSION = 'v2.0.0'; // sw.js VERSION과 함께 올린다

const ui = {
  g: null, speed: 1, paused: false, acc: 0, last: 0,
  sel: null,            // {t:'q', id} | {t:'c', x,y,z}
  combo: false, comboList: [],
  floats: [],           // 데미지 숫자 표시
  anim: new Map(),      // 고블린 id -> {from, to, t0, flip} 칸 이동 보간
  hpPrev: new Map(),    // 고블린 id -> 직전 HP (피격 번쩍임 판정)
  hitUntil: new Map(),  // 고블린 id -> 번쩍임 끝 시각
  puffs: [],            // 처치 먼지 효과
  drag: null,           // 드래그 상태
  msg: '',
};

// ---------- 저장 ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 무시 */ } }

// ---------- 캔버스 (통합 전장 1장) ----------
const boardCv = $('boardCv');
const bctx = boardCv.getContext('2d');
// 판 위 여백: 2칸 크기 오우거가 맨 윗줄에 있어도 머리가 잘리지 않도록 (칸 높이 기준 배수)
const BOARD_PAD = 1.1; // 2칸 크기 오우거가 맨 윗줄에서도 머리가 들어가도록 1칸 이상
const BOARD_ASPECT = (CFG.H + BOARD_PAD) / CFG.W;
const MEGA_ALPHA = 0.25; // 메가 슬라임 겹침 표시 불투명도 (이전 0.6)

function fitCanvas(cv, aspect) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = cv.clientWidth || 300;
  cv.style.height = Math.round(w * aspect) + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * aspect * dpr);
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
// 화면 높이에 맞춰 판을 축소 (최소 높이 보장)
function resize() {
  fitCanvas(boardCv, BOARD_ASPECT);
  const over = document.documentElement.scrollHeight - window.innerHeight;
  if (over > 0) {
    const h0 = boardCv.clientHeight;
    const f = Math.max(Math.min(h0, 300), h0 - over) / h0;
    fitCanvas(boardCv, BOARD_ASPECT * f);
  }
}
window.addEventListener('resize', resize);

const dims = cv => {
  const w = cv.clientWidth, h = cv.clientHeight, ch = h / (CFG.H + BOARD_PAD);
  return { w, h, cw: w / CFG.W, ch, pad: ch * BOARD_PAD };
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// 도트 슬라임: 셀 크기에 맞는 최대 정수배로 그림
function pixelText(ctx, text, x, y, size, fill, align = 'center') {
  ctx.font = `bold ${size}px "Courier New", monospace`; ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,21,31,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

function hpBar(ctx, x, y, w, ratio, col) {
  ctx.fillStyle = '#1b2130'; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, 4);
}

// ---------- 전장 ----------
// 경로가 챕터마다 바뀌므로 새 게임마다 다시 만든다
let PATH_IDX = new Map();
const rebuildPathIdx = () => { PATH_IDX = new Map(PATH.map(([x, y], i) => [`${x},${y}`, i])); };

// 원소 배지: 고블린이 갇혀 슬라임 그림의 원소 글자가 가려질 때 칸 오른쪽 위에 표시
function elemBadge(ctx, sl, X, Y, cw) {
  const txt = sl.label, fs = txt.length > 3 ? 10 : 12;
  ctx.font = `bold ${fs}px sans-serif`;
  const bw = Math.max(22, ctx.measureText(txt).width + 10), bh = fs + 8;
  const bx = X + cw - bw - 4, by = Y + 4;
  ctx.fillStyle = sl.color; ctx.strokeStyle = '#10151f'; ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
  pixelText(ctx, txt, bx + bw / 2, by + bh - 5, fs, '#ffffff');
}

// 속성 아이콘: 칸 오른쪽 위 (합성 슬라임은 2개). 고블린이 갇히면 원소 배지가 이 자리를 덮는다
function attrIcons(ctx, sl, X, Y, cw) {
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  const n = Math.min(2, sl.attrs.length);
  sl.attrs.slice(0, 2).forEach((a, i) => {
    const cx = X + cw - 12 - (n - 1 - i) * 17;
    ctx.fillStyle = 'rgba(16,21,31,.75)'; ctx.beginPath(); ctx.arc(cx, Y + 12, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(ATTRS[a].icon, cx, Y + 16);
  });
}

function lvTag(ctx, sl, X, Y) {
  const txt = `Lv${sl.lv}${sl.kind === 'compound' ? '★' : sl.kind === 'fusion' ? '✦' : sl.kind === 'joke' ? '♪' : sl.kind === 'mixture' ? '◇' : ''}`;
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,21,31,.85)'; ctx.strokeText(txt, X + 5, Y + 14);
  ctx.fillStyle = sl.lv >= 5 ? '#ffb347' : sl.kind === 'compound' ? '#ffd34d' : sl.kind === 'fusion' ? '#ff9de2' : sl.kind === 'mixture' ? '#c9b6ff' : '#e6ecf7';
  ctx.fillText(txt, X + 5, Y + 14);
}

function goblinStatus(ctx, gb, x, y) {
  let k = 0;
  for (const [n, e] of Object.entries(gb.st)) if (e.t > 0) {
    ctx.fillStyle = STATUS[n].color; ctx.fillRect(Math.round(x), Math.round(y + k * 6), 5, 5); k++;
  }
}

function drawBoard() {
  const g = ui.g, ctx = bctx, { w, h, cw, ch, pad } = dims(boardCv);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = g.ch.color; ctx.fillRect(0, 0, w, h); // 챕터별 바탕색
  ctx.fillStyle = '#28324a'; ctx.fillRect(0, 0, w, pad);
  // 입구가 맨 윗줄이면 그 칸 위에 진입 표시 (맨 아래 입구는 칸 안 '입구' 표시만)
  if (PATH[0][1] === 0) pixelText(ctx, '▼ 고블린 진입', Math.min(w - 50, Math.max(50, PATH[0][0] * cw + cw / 2)), pad - 6, 10, '#9fe08a');
  pixelText(ctx, g.tower ? `♾ 무한의 탑 ${g.round}층` : `${g.chapter}. ${g.ch.name}`, w - 6, 16, 12, '#ffd34d', 'right');
  ctx.save(); ctx.translate(0, pad); // 이하 좌표는 판(5x5) 기준
  // 칸 이동 보간: 틱마다 바뀐 경로 위치(idx)를 짧은 시간 동안 부드럽게 이동
  // 일반: 틱의 60% 동안 이동. 느린 고블린(spd<1, 초대형): 다음 이동까지 쉬지 않고 천천히 걷도록 1/spd 틱에 걸쳐 이동
  const now = performance.now(), tickMs = CFG.TICK_MS / ui.speed;
  const moveMsOf = gb => (gb.spd < 1 ? (tickMs / gb.spd) * 0.95 : Math.min(900, tickMs * 0.6));
  const isBig = gb => (GOBLINS[gb.type].size || 1) > 1;
  const bigs = []; // 2칸 크기 고블린은 다른 칸에 가려지지 않도록 마지막에 그림
  const badges = []; // 원소 배지는 모든 고블린 위에 그림
  const live = new Set();
  const inside = new Map(), walking = [];
  for (const gb of g.goblins) {
    live.add(gb.id);
    const prev = ui.hpPrev.get(gb.id);
    if (prev !== undefined && gb.hp < prev - 0.01) ui.hitUntil.set(gb.id, now + 140);
    ui.hpPrev.set(gb.id, gb.hp);
    let a = ui.anim.get(gb.id);
    if (!a) { a = { from: gb.idx, to: gb.idx, t0: 0, flip: false }; ui.anim.set(gb.id, a); }
    if (a.to !== gb.idx) { a.from = a.to; a.to = gb.idx; a.t0 = now; }
    const p = a.t0 ? Math.min(1, (now - a.t0) / moveMsOf(gb)) : 1;
    const pos = a.from + (a.to - a.from) * p;
    const i0 = Math.floor(pos), i1 = Math.min(PATH.length - 1, Math.ceil(pos)), f = pos - i0;
    const [x0, y0] = PATH[i0], [x1, y1] = PATH[i1];
    if (x1 !== x0) a.flip = x1 < x0;
    const moving = p < 1;
    if (gb.pit && !moving) {
      if (!inside.has(gb.idx)) inside.set(gb.idx, []);
      inside.get(gb.idx).push(gb);
    } else {
      walking.push({ gb, fx: x0 + (x1 - x0) * f, fy: y0 + (y1 - y0) * f, moving, flip: a.flip });
    }
  }
  for (const id of ui.anim.keys()) if (!live.has(id)) { ui.anim.delete(id); ui.hpPrev.delete(id); ui.hitUntil.delete(id); }
  // 걷기 프레임: 배속에 맞춰 재생 속도도 빨라짐. 느린 고블린은 이동 시간이 길어 자연스럽게 천천히 걷는다
  // 절차적 움직임 (걷기 프레임이 없는 고블린): 걷기=통통 튐+기울기+착지 찌그러짐, 정지=숨쉬기, 갇힘=버둥거림
  const motion = (gb, state) => {
    const frozen = !!(gb.st.freeze && gb.st.freeze.t > 0);
    const hit = (ui.hitUntil.get(gb.id) || 0) > now;
    if (frozen) return { hit };
    const seed = (gb.id % 7) * 0.9;
    if (state === 'trapped') return { tilt: Math.sin(now / 85 + seed) * 0.13, dx: Math.sin(now / 55 + seed) * 1.2, hit };
    if (walkFrames(gb.type)) return { hit };
    if (state === 'walk') {
      const ph = (now * ui.speed * Math.min(1, gb.spd)) / 115 + seed, s1 = Math.abs(Math.sin(ph));
      return { bob: s1 * 5, tilt: Math.sin(ph) * 0.09, squash: (1 - s1) * 0.07, hit };
    }
    return { squash: (Math.sin(now / 480 + seed) + 1) * 0.018, hit };
  };
  const frameOf = (gb, moving) => (moving && walkFrames(gb.type) ? Math.floor((now * ui.speed * Math.min(1, gb.spd * 1.6)) / walkFrameMs(gb.type)) % walkFrames(gb.type) : 0);

  // 칸 바닥
  for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
    const X = x * cw, Y = y * ch, i = PATH_IDX.get(`${x},${y}`);
    ctx.fillStyle = (x + y) % 2 ? '#4b5672' : '#525e7b';
    roundRect(ctx, X + 2, Y + 2, cw - 4, ch - 4, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${x + 1},${y + 1}`, X + cw - 5, Y + ch - 5);
    if (i === 0) { ctx.fillStyle = '#9fe08a'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('입구', X + cw - 5, Y + 13); }
    if (i === PATH.length - 1) { ctx.fillStyle = '#ff8a8a'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('거점', X + cw - 5, Y + 13); }
  }
  // ㄹ자 경로선
  ctx.strokeStyle = 'rgba(255,211,77,.3)'; ctx.lineWidth = 3; ctx.setLineDash([5, 6]);
  ctx.beginPath();
  PATH.forEach(([x, y], i) => { const px = x * cw + cw / 2, py = y * ch + ch / 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke(); ctx.setLineDash([]);
  // 메가 슬라임 (3x3 구역)
  for (const m of g.megas) {
    // 구역 안 슬라임이 잘 보이도록 메가 그림은 연하게(MEGA_ALPHA), 구역은 노란 테두리로 표시
    ctx.fillStyle = 'rgba(255,211,77,0.07)'; ctx.fillRect(m.zx * cw, m.zy * ch, cw * 3, ch * 3);
    ctx.globalAlpha = MEGA_ALPHA;
    drawSlimeArt(ctx, m, (m.zx + 1.5) * cw, (m.zy + 3) * ch - 8, cw * 2.9, ch * 2.8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(m.zx * cw + 1, m.zy * ch + 1, cw * 3 - 2, ch * 3 - 2); ctx.setLineDash([]);
    pixelText(ctx, `${m.name} ${Math.max(0, Math.round(m.hp))}/${m.maxhp}`, (m.zx + 1.5) * cw, m.zy * ch + 15, 12, '#ffd34d');
  }
  // 슬라임 + 슬라임 안에 갇힌 고블린
  for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
    const X = x * cw, Y = y * ch, sl = getCell(g, x, y, 0);
    const trapped = inside.get(PATH_IDX.get(`${x},${y}`)) || [];
    const isSel = ui.sel?.t === 'c' && ui.sel.x === x && ui.sel.y === y;
    const inCombo = ui.comboList.some(p => p.x === x && p.y === y);
    if (sl && trapped.length) {
      // C. 칸 분할: 위 띠 = 갇힌 고블린(아이콘·이름·체력바), 아래 = 슬라임 (서로 가리지 않음)
      const gb = trapped[0], stripH = Math.round(ch * 0.3), sx = X + 4, sy = Y + 4, sw = cw - 8;
      const art = drawSlimeArt(ctx, sl, X + cw / 2, Y + ch - 8, cw * 0.96, ch - stripH - 8);
      if (art.label) pixelText(ctx, art.label, X + cw / 2, art.rect.y + art.rect.h * 0.86, Math.round(Math.min(cw, ch) * (art.label.length > 3 ? 0.14 : art.label.length > 2 ? 0.16 : 0.19)), '#ffffff');
      lvTag(ctx, sl, X, Y + stripH + 2);
      if (sl.sealed > 0) pixelText(ctx, '봉인', X + cw - 6, Y + stripH + 16, 10, '#c27bff', 'right');
      hpBar(ctx, X + 8, Y + ch - 8, cw - 16, sl.hp / sl.maxhp, '#6be08a');
      ctx.fillStyle = 'rgba(58,36,46,0.95)'; roundRect(ctx, sx, sy, sw, stripH, 6); ctx.fill();
      const frozen = !!(gb.st.freeze && gb.st.freeze.t > 0), mo = motion(gb, 'trapped');
      const iconSize = stripH - 2;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, stripH); ctx.clip(); // 아이콘이 띠 밖으로 나가지 않게
      drawGoblinArt(ctx, gb.type, frozen, sx + iconSize / 2 + 2, sy + stripH, iconSize, { ...mo, tilt: (mo.tilt || 0) * 0.5, dx: (mo.dx || 0) * 0.5 });
      ctx.restore();
      const tx = sx + iconSize + 5, tw = sw - iconSize - 9;
      ctx.font = `bold ${Math.max(9, Math.round(stripH * 0.36))}px sans-serif`; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd6d6';
      ctx.fillText(GOBLINS[gb.type].name + (trapped.length > 1 ? ` +${trapped.length - 1}` : ''), tx, sy + stripH * 0.45);
      hpBar(ctx, tx, sy + stripH * 0.62, tw, gb.hp / gb.maxhp, '#ff5a5a');
      goblinStatus(ctx, gb, sx + sw - 7, sy + 2);
      ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2.5; roundRect(ctx, X + 2, Y + 2, cw - 4, ch - 4, 7); ctx.stroke();
    } else if (sl) {
      const art = drawSlimeArt(ctx, sl, X + cw / 2, Y + ch - 10, cw * 0.94, ch - 18);
      if (art.label) pixelText(ctx, art.label, X + cw / 2, art.rect.y + art.rect.h * 0.86, Math.round(Math.min(cw, ch) * (art.label.length > 3 ? 0.15 : art.label.length > 2 ? 0.17 : 0.21)), '#ffffff');
      lvTag(ctx, sl, X, Y);
      attrIcons(ctx, sl, X, Y, cw);
      if (sl.sealed > 0) pixelText(ctx, '봉인', X + cw - 6, Y + 14, 10, '#c27bff', 'right');
      hpBar(ctx, X + 8, Y + ch - 8, cw - 16, sl.hp / sl.maxhp, '#6be08a');
    } else if (trapped.length) {
      // 메가 구역 안에 갇힌 고블린
      for (const gb of trapped) {
        if (isBig(gb)) { bigs.push({ gb, trappedIn: null, x, y, moving: false, flip: ui.anim.get(gb.id)?.flip }); continue; }
        drawGoblinArt(ctx, gb.type, false, X + cw / 2, Y + ch - 8, Math.min(cw, ch) * 0.7, motion(gb, 'trapped'));
        hpBar(ctx, X + 8, Y + 18, cw - 16, gb.hp / gb.maxhp, '#ff5a5a');
        ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2.5; roundRect(ctx, X + 2, Y + 2, cw - 4, ch - 4, 7); ctx.stroke();
      }
    }
    if (isSel || inCombo) { ctx.strokeStyle = inCombo ? '#6be08a' : '#ffd34d'; ctx.lineWidth = 3; roundRect(ctx, X + 3, Y + 3, cw - 6, ch - 6, 7); ctx.stroke(); }
  }
  // 걷는 고블린 (도착한 칸에 슬라임이 있으면 칸 오른쪽 위로 비켜서 지나감)
  for (const wk of walking) {
    const { gb } = wk;
    if (isBig(gb)) { bigs.push({ gb, trappedIn: null, x: wk.fx, y: wk.fy, moving: wk.moving, flip: wk.flip }); continue; }
    const cx0 = Math.round(wk.fx), cy0 = Math.round(wk.fy);
    const idxHere = PATH_IDX.get(`${cx0},${cy0}`);
    const occupied = !wk.moving && (!!getCell(g, cx0, cy0, 0) || inside.has(idxHere));
    const frozen = !!(gb.st.freeze && gb.st.freeze.t > 0);
    const size = Math.min(cw, ch) * (occupied ? 0.55 : 0.82);
    const cx = wk.fx * cw + (occupied ? cw * 0.72 : cw / 2), bottom = wk.fy * ch + (occupied ? ch * 0.62 : ch - 8);
    const rc = drawGoblinArt(ctx, gb.type, frozen, cx, bottom, size, { frame: frameOf(gb, wk.moving), flip: wk.flip, ...motion(gb, wk.moving ? 'walk' : 'idle') });
    hpBar(ctx, cx - size * 0.4, Math.max(wk.fy * ch + 3, rc.y - 6), size * 0.8, gb.hp / gb.maxhp, '#ff5a5a');
    goblinStatus(ctx, gb, cx + size * 0.42, rc.y);
  }
  // 2칸 크기 고블린 (초대형 오우거): 발은 현재 칸 바닥, 몸은 위 칸까지. 맨 윗줄에서는 판 밖으로 잘리지 않게 아래로 보정
  for (const bg of bigs) {
    const { gb } = bg, cells = GOBLINS[gb.type].size || 2;
    const size = Math.min(cw, ch) * cells;
    const frozen = !!(gb.st.freeze && gb.st.freeze.t > 0);
    let cx = bg.x * cw + cw / 2; const bottom = bg.y * ch + ch - 4;
    const rc = drawGoblinArt(ctx, gb.type, frozen, cx, bottom, size, { frame: frameOf(gb, bg.moving), flip: !!bg.flip, clampW: w, ...motion(gb, bg.moving ? 'walk' : 'idle') });
    cx = rc.x + rc.w / 2; // 판 가장자리 보정된 몸 위치 기준으로 체력바 정렬
    hpBar(ctx, cx - size * 0.3, Math.max(2 - pad, rc.y - 6), size * 0.6, gb.hp / gb.maxhp, '#ff5a5a');
    goblinStatus(ctx, gb, cx + size * 0.32, Math.max(2 - pad, rc.y));
  }
  // 처치 먼지 효과: 회색 원이 퍼지며 사라짐
  ui.puffs = ui.puffs.filter(p => now - p.t0 < 450);
  for (const p of ui.puffs) {
    const [px, py] = PATH[Math.min(p.idx, PATH.length - 1)], a = (now - p.t0) / 450;
    ctx.globalAlpha = 1 - a; ctx.fillStyle = '#d8dde8';
    for (let k = 0; k < 6; k++) {
      const ang = k * Math.PI / 3 + p.seed, r = 4 + a * cw * 0.35;
      ctx.beginPath(); ctx.arc(px * cw + cw / 2 + Math.cos(ang) * r, py * ch + ch * 0.6 + Math.sin(ang) * r * 0.6, 3.5 * (1 - a) + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (const [sl, X, Y] of badges) elemBadge(ctx, sl, X, Y, cw);
  drawFloats(ctx, cw, ch);
  ctx.restore();
}

function drawFloats(ctx, cw, ch) {
  const now = performance.now();
  ui.floats = ui.floats.filter(f => now - f.t0 < 900);
  for (const f of ui.floats) {
    const [x, y] = PATH[Math.min(f.idx, PATH.length - 1)];
    const a = (now - f.t0) / 900;
    ctx.globalAlpha = 1 - a;
    pixelText(ctx, f.text, x * cw + cw / 2 + f.dx, y * ch + ch * 0.5 - a * 18, 14, f.col);
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD / 큐 ----------
function paintCardArt(cv, sym) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3), w = 46, h = 36;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const e = EL[sym];
  drawSlimeArt(c, { kind: 'element', key: sym, els: [sym], color: e.color, color2: null, label: e.label || sym }, w / 2, h, w, h);
}

function renderQueue() {
  const box = $('queue'); const g = ui.g;
  $('qCount').textContent = `${g.queue.length}/${CFG.QUEUE_MAX}`;
  const ids = g.queue.map(q => q.id).join(',');
  if (box.dataset.ids !== ids) {
    box.dataset.ids = ids; box.textContent = '';
    for (const q of g.queue) {
      const c = document.createElement('div');
      c.className = 'card'; c.dataset.id = q.id; c.style.borderColor = EL[q.sym].color;
      c.setAttribute('role', 'button'); c.setAttribute('aria-label', `${EL[q.sym].name} 슬라임 카드`);
      // 덱 카드도 필드와 같은 그리기 함수(drawSlimeArt)로 그려 두 그림이 항상 같게 한다
      const art = document.createElement('canvas'); art.className = 'cardart';
      paintCardArt(art, q.sym);
      const sp = document.createElement('span'); sp.textContent = EL[q.sym].name;
      const ic = document.createElement('b'); ic.className = 'attr'; ic.textContent = ATTRS[EL[q.sym].attr].icon;
      c.append(art, sp, ic);
      c.addEventListener('pointerdown', e => beginDrag(e, { t: 'q', id: q.id }));
      box.appendChild(c);
    }
  }
  for (const c of box.children) c.classList.toggle('sel', ui.sel?.t === 'q' && ui.sel.id === +c.dataset.id);
}

function renderHud() {
  const g = ui.g;
  $('hRound').textContent = g.tower ? `탑${g.round}` : `${g.chapter}-${g.round}`;
  $('mGold').textContent = fmt(PROF.gold); $('mCrys').textContent = fmt(PROF.crystals); $('mStone').textContent = fmt(PROF.stones);
  $('hBase').textContent = g.baseHp;
  $('hBase').style.color = g.baseHp <= 5 ? 'var(--danger)' : '';
  $('hCount').textContent = `${slimeCount(g)}/${CFG.CAP}`;
  $('hCat').textContent = g.catalysts;
  $('hPhase').textContent = g.phase === 'prep' ? `준비 ${g.prepLeft}` : g.phase === 'run' ? `전투 ${g.spawnList.length + g.goblins.length}` : '종료';
  $('hTick').style.width = `${Math.min(100, (((g.tick % CFG.DROP_EVERY) + ui.acc / CFG.TICK_MS) / CFG.DROP_EVERY) * 100)}%`;
  $('bStart').disabled = g.phase !== 'prep';
  $('bCombo').classList.toggle('on', ui.combo);
  $('bCombo').textContent = ui.megaMode ? '취소' : ui.combo ? '조합 실행' : '조합';
  $('bMega').classList.toggle('on', !!ui.megaMode);
  $('bMega').disabled = !g.tower && g.round < CFG.MEGA_ROUND;
  $('bSpeed').textContent = `×${ui.speed}`;
  $('bPause').textContent = ui.paused ? '재개' : '정지';
  $('bPause').classList.toggle('on', ui.paused);
  $('bAuto').classList.toggle('on', !!ui.auto); $('bAuto').setAttribute('aria-pressed', String(!!ui.auto));
}

function setInfo(html) { $('info').innerHTML = html; }

function slimeInfo(sl) {
  const sts = sl.status.map(s => STATUS[s.name].label).join(', ');
  const kind = { element: '원소', compound: '화학 족보 150%', fusion: `속성 합성 ${Math.round(CFG.FUSION_MUL * 100)}%`, joke: `비밀 족보 ${Math.round(CFG.JOKE_MUL * 100)}%`, mixture: '혼합물 70%' }[sl.kind];
  const at = sl.attrs.map(a => ATTRS[a].icon + ATTRS[a].label).join('+');
  return `<b>${sl.name} ${sl.label} Lv${sl.lv}</b> · ${at} · ${kind}${sl.pierce ? ' · 방어 관통' : ''} · HP ${Math.ceil(sl.hp)}/${sl.maxhp} · 공격 ${sl.atk.toFixed(1)} · 방어 ${sl.def.toFixed(1)} · 효과: ${sts}`;
}

function refreshInfo() {
  const g = ui.g;
  if (ui.megaMode) { setInfo(`<b>메가 모드</b> · Lv5 같은 원소 3개 선택 (${ui.comboList.length}/3) 후 메가 버튼`); return; }
  if (ui.combo) {
    const h = recipeHint(g, ui.comboList);
    setInfo(`<b>조합 모드</b> (촉매 ${g.catalysts}) · 선택 ${ui.comboList.length}개 · ${h.text}`);
    return;
  }
  if (ui.sel?.t === 'c') { const sl = getCell(g, ui.sel.x, ui.sel.y, ui.sel.z); if (sl) { setInfo(slimeInfo(sl) + ' · 다른 칸을 탭하면 이동/겹치기'); return; } }
  if (ui.sel?.t === 'q') { const q = g.queue.find(v => v.id === ui.sel.id); if (q) { setInfo(`<b>${EL[q.sym].name}(${q.sym})</b> 선택됨 · 판의 칸을 탭해 배치 (같은 원소 위 = 겹치기)`); return; } }
  setInfo(ui.msg || g.log[g.log.length - 1] || '');
}

// ---------- 입력 ----------
function cellAt(cv, clientX, clientY) {
  const r = cv.getBoundingClientRect(), { cw, ch, pad } = dims(cv);
  const x = Math.floor((clientX - r.left) / cw), y = Math.floor((clientY - r.top - pad) / ch);
  if (x < 0 || y < 0 || x >= CFG.W || y >= CFG.H) return null;
  return { x, y, z: 0 };
}

function flash(res) { ui.msg = res.msg; if (!res.ok && navigator.vibrate) { try { navigator.vibrate(30); } catch { /* 미지원 */ } } }

function applyDrop(src, cell) {
  const g = ui.g;
  if (src.t === 'q') {
    const qi = g.queue.findIndex(q => q.id === src.id);
    if (qi < 0) return { ok: false, msg: '이미 사용된 슬라임입니다.' };
    return placeFromQueue(g, qi, cell.x, cell.y, cell.z);
  }
  return moveSlime(g, src, cell);
}

function tapCell(cell) {
  const g = ui.g;
  if (ui.combo) {
    if (!getCell(g, cell.x, cell.y, cell.z)) return;
    const i = ui.comboList.findIndex(p => p.x === cell.x && p.y === cell.y && p.z === cell.z);
    if (i >= 0) ui.comboList.splice(i, 1); else ui.comboList.push(cell);
    return;
  }
  if (ui.sel) {
    const same = ui.sel.t === 'c' && ui.sel.x === cell.x && ui.sel.y === cell.y && ui.sel.z === cell.z;
    if (same) { ui.sel = null; return; }
    const res = applyDrop(ui.sel, cell); flash(res);
    if (res.ok) ui.sel = null;
    else if (getCell(g, cell.x, cell.y, cell.z)) ui.sel = { t: 'c', ...cell };
    return;
  }
  if (getCell(g, cell.x, cell.y, cell.z)) ui.sel = { t: 'c', ...cell };
}

function beginDrag(e, src) {
  if (ui.combo && src.t === 'q') return;
  e.preventDefault();
  ui.drag = { src, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, pid: e.pointerId };
  try { e.target.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 미지원 */ }
}

function onMove(e) {
  const d = ui.drag; if (!d || e.pointerId !== d.pid) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) {
    d.moved = true;
    const sym = d.src.t === 'q' ? ui.g.queue.find(q => q.id === d.src.id)?.sym : getCell(ui.g, d.src.x, d.src.y, d.src.z)?.label;
    if (!sym) { ui.drag = null; return; }
    const gh = document.createElement('div'); gh.className = 'card ghost';
    const key = d.src.t === 'q' ? sym : getCell(ui.g, d.src.x, d.src.y, d.src.z).key;
    const im = document.createElement('img'); im.src = `assets/slime_${key}.png`; im.alt = '';
    im.onerror = () => { im.remove(); gh.textContent = sym; };
    gh.appendChild(im); document.body.appendChild(gh); d.ghost = gh;
  }
  if (d.ghost) { d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px'; }
}

function onUp(e) {
  const d = ui.drag; if (!d || e.pointerId !== d.pid) return;
  ui.drag = null;
  if (d.ghost) d.ghost.remove();
  if (!d.moved) {
    if (d.src.t === 'q') ui.sel = ui.sel?.t === 'q' && ui.sel.id === d.src.id ? null : d.src;
    else tapCell(d.src);
  } else {
    const cell = cellAt(boardCv, e.clientX, e.clientY);
    if (cell) { const res = applyDrop(d.src, cell); flash(res); if (res.ok) ui.sel = null; }
  }
  render();
}

boardCv.addEventListener('pointerdown', e => {
  const cell = cellAt(boardCv, e.clientX, e.clientY); if (!cell) return;
  if (ui.combo) { e.preventDefault(); tapCell(cell); render(); return; }
  if (getCell(ui.g, cell.x, cell.y, cell.z)) beginDrag(e, { t: 'c', ...cell });
  else { e.preventDefault(); tapCell(cell); render(); }
});
window.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', e => { if (ui.drag?.ghost) ui.drag.ghost.remove(); ui.drag = null; void e; });

// ---------- 버튼 ----------
$('bStart').onclick = () => { flash(skipPrep(ui.g)); ui.acc = CFG.TICK_MS; render(); };
$('bSpeed').onclick = () => { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; render(); };
$('bPause').onclick = () => { ui.paused = !ui.paused; render(); };
$('bCombo').onclick = () => {
  if (ui.megaMode) { ui.megaMode = false; ui.combo = false; ui.comboList = []; render(); return; }
  if (!ui.combo) { ui.combo = true; ui.comboList = []; ui.sel = null; render(); return; }
  if (ui.comboList.length) { const r = combine(ui.g, ui.comboList); flash(r); if (r.joke) discoverJoke(r.joke); }
  ui.combo = false; ui.comboList = []; render();
};
$('bMega').onclick = () => {
  if (!ui.combo) { ui.combo = true; ui.comboList = []; ui.sel = null; ui.msg = ''; ui.megaMode = true; render(); return; }
  if (ui.megaMode) { flash(makeMega(ui.g, ui.comboList)); ui.combo = false; ui.megaMode = false; ui.comboList = []; render(); }
};
$('bHelp').onclick = () => showHelp();
// ---------- 자동 조합 모드 (방치형): 끄기 전까지 매 틱 최적 행동 실행 ----------
ui.auto = lsGet('esd.auto') === '1';
function runAuto() {
  const done = autoPlay(ui.g);
  for (const d of done) {
    ui.msg = `🤖 ${d.msg}`;
    if (d.joke) discoverJoke(d.joke, true); // 자동 모드에서는 팝업 없이 기록만
  }
  return done.length;
}
$('bAuto').onclick = () => {
  ui.auto = !ui.auto; lsSet('esd.auto', ui.auto ? '1' : '0');
  ui.combo = false; ui.megaMode = false; ui.comboList = []; ui.sel = null;
  ui.msg = ui.auto ? '🤖 자동 조합 ON: 끌 때까지 최적의 조합·배치를 계속합니다' : '자동 조합 OFF';
  if (ui.auto) runAuto();
  render();
};
// 팝업 버튼은 열 때마다 동작을 지정한다 (ok: 확인 버튼, alt: 보조 버튼)
let modalOk = null, modalAlt = null;
const closeModal = () => $('modal').classList.add('hidden');
let lastModalFire = 0;
function bindModalBtn(id, take) {
  const fire = e => {
    if (e) e.preventDefault();
    if (performance.now() - lastModalFire < 350 || $('modal').classList.contains('hidden')) return; // pointerup+click 중복 방지
    lastModalFire = performance.now();
    closeModal(); const f = take(); if (f) f();
  };
  $(id).addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') fire(e); });
  $(id).addEventListener('click', () => fire());
}
// 유령 클릭 방지: 팝업 버튼이 손 뗄 때 실행된 직후, 휴대폰이 같은 자리에 보내는 click이
// 새로 열린 팝업의 다른 버튼(예: 챕터 선택)을 누르지 않도록 잠깐 모든 click을 막는다
document.addEventListener('click', e => {
  if (performance.now() - lastModalFire < 450) { e.stopPropagation(); e.preventDefault(); }
}, true);
bindModalBtn('mOk', () => { const f = modalOk; modalOk = null; return f; });
bindModalBtn('mAlt', () => { const f = modalAlt; modalAlt = null; return f; });

function showModal(title, html, opts = {}) {
  $('mTitle').textContent = title; $('mBody').innerHTML = html;
  $('mOk').textContent = opts.okText || '확인';
  $('mAlt').textContent = opts.altText || '';
  $('mOk').classList.toggle('hidden', opts.noOk === true);
  $('mAlt').classList.toggle('hidden', !opts.altText);
  modalOk = opts.onOk || null; modalAlt = opts.onAlt || null;
  $('modal').classList.remove('hidden');
}

// ---------- 강화 화면 (강화 / 연구 / 환생) ----------
function showUpgrades(tab = 'up', after = null) {
  const tabs = `<div class="tabs">${[['up', '⬆ 강화'], ['res', '💎 연구'], ['pre', '🔮 환생']].map(([k, l]) => `<button class="btn ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'up') {
    body = `<p style="color:var(--sub)">💰 ${fmt(PROF.gold)} 보유 · 강화는 진행 중인 게임에도 바로 적용됩니다.</p>` + Object.entries(UPGRADES).map(([k, u]) => {
      const lv = PROF.upgrades[k], max = isMaxed(k, lv), cost = upgradeCost(k, lv);
      return `<div class="uprow"><span class="ic">${u.icon}</span><span class="tx"><b>${u.name} Lv${lv}${u.max !== undefined ? `/${u.max}` : ''}</b><span>현재 ${u.desc(lv)}${max ? '' : ` → ${u.desc(lv + 1)}`}</span></span>
        <button class="btn ${max || PROF.gold < cost ? 'cant' : ''}" data-buy="${k}">${max ? '최대' : `💰 ${fmt(cost)}`}</button></div>`;
    }).join('');
  } else if (tab === 'res') {
    body = `<p style="color:var(--sub)">💎 ${fmt(PROF.crystals)} 보유 · 속성 연구 1레벨당 그 속성 슬라임 공격 +${Math.round(RESEARCH_PER * 100)}%. 원소 결정은 챕터 클리어, 탑 5층마다, 비밀 족보 첫 발견으로 얻습니다.</p>` +
      Object.entries(ATTRS).map(([a, at]) => {
        const lv = PROF.research[a], cost = researchCost(lv);
        return `<div class="uprow"><span class="ic">${at.icon}</span><span class="tx"><b>${at.label} 연구 Lv${lv}</b><span>공격 +${Math.round(lv * RESEARCH_PER * 100)}%</span></span>
          <button class="btn ${PROF.crystals < cost ? 'cant' : ''}" data-res="${a}">💎 ${cost}</button></div>`;
      }).join('');
  } else {
    const gain = stoneGain(PROF);
    body = `<p>환생하면 <b>골드와 골드 강화가 초기화</b>되고, 대신 <b>현자의 돌</b>을 받습니다. 현자의 돌 1개당 골드 획득 +20%, 슬라임 공격 +5% (영구).</p>
      <p>유지되는 것: 속성 연구, 원소 결정, 덱, 챕터 진행, 비밀 족보, 탑 최고 기록</p>
      <p>현재 🔮 ${PROF.stones}개 (골드 x${(1 + 0.2 * PROF.stones).toFixed(1)}, 공격 x${(1 + 0.05 * PROF.stones).toFixed(2)}) · 탑 최고 ${PROF.towerBest}층 · 환생 ${PROF.prestiges}회</p>
      <p style="font-size:16px">지금 환생하면: <b>🔮 +${gain}</b> ${gain ? '' : `<span style="color:var(--sub)">(${PROF.towerBest < PRESTIGE_MIN_FLOOR ? `탑 ${PRESTIGE_MIN_FLOOR}층 필요` : '탑 최고 기록을 더 올려야 함'})</span>`}</p>
      <button class="btn ${gain ? '' : 'cant'}" id="doPrestige" style="width:100%;min-height:48px">🔮 환생하기</button>`;
  }
  showModal('성장', tabs + body, { okText: '닫기', onOk: after });
  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { closeModal(); showUpgrades(b.dataset.tab, after); };
  const reopen = (r, t2) => { ui.msg = r.msg; if (r.ok) { saveProf(true); setMods(ui.g, modsOf(PROF)); } closeModal(); showUpgrades(t2, after); };
  for (const b of document.querySelectorAll('[data-buy]')) b.onclick = () => reopen(buyUpgrade(PROF, b.dataset.buy), 'up');
  for (const b of document.querySelectorAll('[data-res]')) b.onclick = () => reopen(buyResearch(PROF, b.dataset.res), 'res');
  const pb = document.getElementById('doPrestige');
  if (pb) pb.onclick = () => {
    const r = prestige(PROF); ui.msg = r.msg;
    if (r.ok) { saveProf(true); closeModal(); showModal('🔮 환생 완료', `<p>현자의 돌 <b>+${r.gain}</b> (총 ${PROF.stones}개)</p><p>모든 골드 획득 x${(1 + 0.2 * PROF.stones).toFixed(1)}, 슬라임 공격 x${(1 + 0.05 * PROF.stones).toFixed(2)}</p>`, { okText: '새로 시작', onOk: () => { newGame(1); showChapterSelect(); } }); }
  };
}

// ---------- 덱 편성 ----------
function showDeck() {
  const cards = DECK_POOL.map(sym => {
    const e = ELEMENTS.find(x => x.sym === sym), on = PROF.deck.includes(sym);
    return `<button class="deckcard ${on ? 'on' : ''}" data-sym="${sym}"><img src="assets/slime_${sym}.png" alt="">${e.label || e.name}<small>${ATTRS[e.attr].icon}${ATTRS[e.attr].label}</small></button>`;
  }).join('');
  showModal(`덱 편성 (${PROF.deck.length}/${DECK_SIZE})`, `<p style="color:var(--sub)">지급받을 슬라임을 최대 ${DECK_SIZE}종 고르세요. 종류가 적을수록 같은 슬라임이 자주 나와 겹치기·조합이 잘 됩니다. 도전할 챕터 고블린의 약점 속성을 노리세요.</p><div class="deckgrid">${cards}</div>`, { okText: '완료' });
  for (const b of document.querySelectorAll('[data-sym]')) b.onclick = () => {
    const r = toggleDeck(PROF, b.dataset.sym);
    if (!r.ok) { ui.msg = r.msg; $('mTitle').textContent = r.msg; return; }
    saveProf(true); ui.g.deck = PROF.deck.slice(); closeModal(); showDeck();
  };
}
$('bUpg').onclick = () => showUpgrades('up');
$('bDeck').onclick = () => showDeck();

// 챕터 선택 화면
function showChapterSelect(canClose = false) {
  const open = unlocked();
  const atl = b => Object.entries(b).map(([a, v]) => `${ATTRS[a].icon}${ATTRS[a].label} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`).join(' · ') || '없음';
  const rows = CHAPTERS.map(c => {
    const best = +(lsGet(lsBest(c.id)) || 0), locked = c.id > open;
    const rec = best > CFG.ROUNDS ? '✅ 클리어' : best ? `최고 ${best}라운드` : '기록 없음';
    return `<button class="chbtn" data-ch="${c.id}" ${locked ? 'disabled' : ''} style="border-color:${c.color}">
      <b>${locked ? '🔒' : c.id}. ${c.name}</b><span>${c.pathLabel} · 환경 ${atl(c.boost)}</span><span>${locked ? `챕터 ${c.id - 1} 클리어 시 열림` : rec}</span></button>`;
  }).join('');
  const towerOpen = open > CHAPTERS.length;
  const towerRow = `<button class="chbtn" data-ch="${TOWER_ID}" ${towerOpen ? '' : 'disabled'} style="border-color:#c27bff">
      <b>${towerOpen ? '♾' : '🔒'} 무한의 탑</b><span>층마다 강해지는 끝없는 도전 · 골드 대량 획득</span><span>${towerOpen ? `최고 ${PROF.towerBest}층` : '챕터 5 클리어 시 열림'}</span></button>`;
  showModal('챕터 선택', `<div class="chlist">${rows}${towerRow}</div>`, canClose ? { okText: '닫기' } : { noOk: true });
  for (const b of document.querySelectorAll('.chbtn')) b.onclick = () => { closeModal(); newGame(+b.dataset.ch); };
}

// ---------- 비밀 족보 발견 기록 ----------
const LS_JOKES = 'esd.jokes';
const foundJokes = () => { try { return new Set(JSON.parse(lsGet(LS_JOKES) || '[]')); } catch { return new Set(); } };
function discoverJoke(key, quiet = false) {
  const found = foundJokes(), j = JOKES.find(x => x.key === key); if (!j) return;
  const isNew = !found.has(key); found.add(key); lsSet(LS_JOKES, JSON.stringify([...found]));
  if (isNew) { PROF.crystals += quiet ? 1 : 2; saveProf(true); } // 첫 발견 보상: 직접 2, 자동 1
  if (!isNew) return;
  if (quiet) { ui.msg = `🎉 비밀 족보 발견! ${j.label} ${j.name} (${found.size}/${JOKES.length})`; return; }
  const fx = j.onCreate?.baseHp ? `<p>🛟 거점 체력 +${j.onCreate.baseHp}!</p>` : j.onCreate?.catalysts ? `<p>🎁 선물: 촉매 +${j.onCreate.catalysts}!</p>` : '';
  showModal('🎉 비밀 족보 발견!', `<div style="text-align:center"><img src="assets/slime_${j.key}.png" alt="" style="width:132px;image-rendering:pixelated">
    <p style="font-size:20px;margin:6px 0"><b>${j.label}</b> · ${j.name}</p><p>${needText(j.need)}</p>
    <p>효과: ${j.st.map(s => STATUS[s.name].label).join('·')}${j.healAura ? '·주변 슬라임 회복' : ''}</p>${fx}
    <p style="color:var(--sub)">발견한 비밀 족보 ${found.size} / ${JOKES.length}</p></div>`, { okText: '좋아!' });
}
const symLabel = k => ELEMENTS.find(e => e.sym === k)?.label || k;
const needText = need => Object.entries(need).map(([k, v]) => (v > 1 ? `${symLabel(k)}×${v}` : symLabel(k))).join(' + ');

function showHelp(after = null) {
  const rec = RECIPES.map(r => `<tr><td>${r.label} ${r.name}</td><td>${Object.entries(r.need).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(' + ')}</td><td>${STATUS[r.st.name].label}</td></tr>`).join('');
  const els = ELEMENTS.map(e => `<tr><td>${e.label || e.sym} ${e.label ? '' : e.name}</td><td>${ATTRS[e.attr].icon} ${ATTRS[e.attr].label}</td><td>${STATUS[e.st.name].label}</td><td>R${e.unlock}</td></tr>`).join('');
  const fj = foundJokes();
  const jokeRows = () => JOKES.map(j => fj.has(j.key)
    ? `<tr><td><b>${j.label}</b> ${j.name}</td><td>${needText(j.need)}</td><td>${j.st.map(s => STATUS[s.name].label).join('·')}${j.onCreate?.baseHp ? '·거점+' + j.onCreate.baseHp : ''}${j.onCreate?.catalysts ? '·촉매+' + j.onCreate.catalysts : ''}${j.healAura ? '·회복' : ''}</td></tr>`
    : `<tr><td>???</td><td>???</td><td>💡 ${j.hint}</td></tr>`).join('');
  const fus = FUSIONS.map(f => `<tr><td>${ATTRS[f.pair[0]].icon}${ATTRS[f.pair[0]].label} + ${ATTRS[f.pair[1]].icon}${ATTRS[f.pair[1]].label}</td><td><b>${f.label}</b></td><td>${f.st.map(s => STATUS[s.name].label).join('·')}${f.pierce ? '·관통' : ''}</td></tr>`).join('');
  const atl = arr => arr.map(a => ATTRS[a].icon + ATTRS[a].label).join(' ') || '-';
  const gbs = Object.entries(GOBLINS).map(([k, d]) => `<tr><td><img class="gimg" src="assets/goblin_${k}.png" alt=""> ${d.name}<br><small>${d.desc || ''}</small></td><td>${atl(d.weak || [])}</td><td>${atl(d.resist || [])}</td><td>-${d.leak}</td></tr>`).join('');
  showModal(`게임 방법 · ${APP_VERSION}`, `
    <p>고블린은 전장의 <b>점선 경로</b>를 따라 이동합니다(챕터마다 모양이 다름). 슬라임이 있는 칸에 들어가면 <b>슬라임 안에 갇혀</b> 대결하고, 슬라임이 없으면 통과합니다. 한 슬라임에는 고블린 1마리만 갇히고, 뒤 고블린은 지나갑니다.</p>
    <p>고블린은 <b>1초에 1칸</b> 이동하고 1초마다 1마리씩 출발합니다(초대형은 2초에 1칸). 슬라임은 <b>3초마다 1마리</b> 지급되며, 처음에는 <b>필드 빈칸에 랜덤 배치</b>됩니다. 필드 25칸이 모두 차면 그때부터 덱에 쌓입니다(최대 ${CFG.QUEUE_MAX}장). 필드의 슬라임은 끌어서 옮기거나, 같은 슬라임 위에 놓아 겹칠 수 있습니다(Lv+1, 최대 5).</p>
    <p><b>속성</b>: 모든 슬라임은 8속성 중 하나입니다(🔥불 💧물 ⚡전기 ❄얼음 🌪바람 ⛰대지 ☠독 ☢방사). 고블린마다 <b>약점 속성(피해 ×${CFG.WEAK_MUL}, 주황 숫자)</b>과 <b>내성 속성(×${CFG.RESIST_MUL}, 회색 숫자)</b>이 있습니다.</p>
    <p><b>조합</b>(촉매 1개): ① 화학 족보 정확히 일치 → 화합물 150% ② <b>서로 다른 속성 2마리 → 속성 합성 ${Math.round(CFG.FUSION_MUL * 100)}%</b> ③ 그 외 → 혼합물 70%.</p>
    <p><b>메가</b>: ${CFG.MEGA_ROUND}라운드부터 사용 가능. Lv5 같은 원소 3개 → 3×3 구역, 최대 5마리 동시 공격.</p>
    <p>보너스: 같은 <b>속성</b> 2개↑ 받는 피해 -10%, 3개↑ 공격 +20%, 같은 가로줄에 같은 속성 3개 공격 +20%.</p>
    <table><tr><th>속성 합성</th><th>결과</th><th>효과</th></tr>${fus}</table>
    <p><b>비밀 족보</b> (${foundJokes().size}/${JOKES.length} 발견): 말도 안 되지만 위트 있는 '화학식'. 조합 모드에서 정확히 맞추면 다른 규칙보다 우선합니다. 같은 원소끼리도 됩니다.</p>
    <table><tr><th>비밀 족보</th><th>재료</th><th>힌트·효과</th></tr>${jokeRows()}</table>
    <table><tr><th>슬라임</th><th>속성</th><th>효과</th><th>해금</th></tr>${els}</table>
    <table><tr><th>화합물</th><th>족보</th><th>효과</th></tr>${rec}</table>
    <p><b>🤖 자동</b>: 켜 두면 끌 때까지 매초 필드·덱 전체를 분석해 가장 이득이 큰 행동(겹치기, 카드 배치, 비밀 족보·화학 족보·속성 합성, 메가)을 자동으로 합니다. 이번 라운드 고블린의 약점·내성과 경로 앞쪽 칸을 우선 고려합니다.</p>
    <p><b>⬆ 성장</b>: 고블린을 잡으면 💰골드, 챕터 클리어·탑 5층마다 💎원소 결정을 얻습니다. 골드로 <b>강화</b>(공격·체력·지급 속도·촉매·거점·시작 슬라임), 결정으로 <b>속성 연구</b>를 하세요. <b>덱</b>에서 지급받을 슬라임 8종을 고릅니다. 챕터 5를 깨면 <b>무한의 탑</b>이 열리고, 탑 ${PRESTIGE_MIN_FLOOR}층부터 <b>환생</b>으로 🔮현자의 돌(영구 배율)을 받을 수 있습니다. 앱을 닫아 둔 시간만큼 <b>오프라인 보상</b>이 쌓입니다(최대 8시간). 보스 라운드를 자동 없이 직접 깨면 보상 1.5배.</p>
    <p><b>챕터</b>: 5개 챕터 × 10라운드. 챕터마다 경로 모양, 환경 효과(속성 강화·약화), 주력 고블린이 다릅니다. 챕터를 클리어하면 다음 챕터가 열립니다. 상단의 <b>챕터-라운드</b>를 누르면 챕터를 고를 수 있습니다.</p>
    <table><tr><th>고블린</th><th>약점</th><th>내성</th><th>거점</th></tr>${gbs}</table>`, { onOk: after });
}

// ---------- 루프 ----------
function collectFx() {
  const now = performance.now();
  for (const f of ui.g.fx) {
    if (f.k === 'dmg') {
      const weak = f.who === 'g' && f.aff > 1, resist = f.who === 'g' && f.aff < 1;
      ui.floats.push({ idx: f.idx, text: (f.who === 'g' ? '-' : '▼') + f.v + (weak ? '!' : ''), t0: now, dx: (Math.random() - 0.5) * 18,
        col: f.who !== 'g' ? '#ff7b7b' : weak ? '#ff8a1e' : resist ? '#9aa4b8' : '#ffd34d' });
    }
    if (f.k === 'kill') ui.puffs.push({ idx: f.idx, t0: now, seed: Math.random() * 6 });
    if (f.k === 'heal') ui.floats.push({ idx: f.idx, text: '+' + f.v, col: '#7dff9a', t0: now, dx: (Math.random() - 0.5) * 18 });
    if (f.k === 'leak') ui.floats.push({ idx: f.idx, text: `거점 -${f.v}`, col: '#ff4040', t0: now, dx: 0 });
  }
}

function checkEnd() {
  const g = ui.g; if (ui.endShown) return;
  if (g.phase === 'over' || g.phase === 'won') {
    ui.endShown = true;
    commitEarnings(0); saveProf(true);
    const earned = `<p>획득: 💰 ${fmt(g.gold)} · 💎 ${g.crystals}</p>`;
    if (g.tower) {
      const prev = PROF.towerBest; PROF.towerBest = Math.max(PROF.towerBest, g.round); saveProf(true);
      showModal(`무한의 탑 ${g.round}층`, `<p>도달 <b>${g.round}층</b> · 최고 기록 <b>${PROF.towerBest}층</b>${g.round > prev ? ' (신기록!)' : ''}</p>${earned}
        <p style="color:var(--sub)">강화로 더 높이 오르세요. ${PROF.towerBest >= PRESTIGE_MIN_FLOOR ? `환생하면 현자의 돌 ${stoneGain(PROF)}개를 받습니다.` : `${PRESTIGE_MIN_FLOOR}층부터 환생할 수 있습니다.`}</p>`,
        { okText: '다시 도전', onOk: () => newGame(TOWER_ID), altText: '⬆ 강화', onAlt: () => showUpgrades('up', () => newGame(TOWER_ID)) });
      return;
    }
    const won = g.phase === 'won', n = g.chapter;
    const best = Math.max(+(lsGet(lsBest(n)) || 0), won ? CFG.ROUNDS + 1 : g.round);
    lsSet(lsBest(n), String(best));
    const next = won ? n + 1 : 0; // 챕터 5 다음은 무한의 탑
    if (next && unlocked() < next) lsSet(LS_UNLOCK, String(next));
    const body = `<p>챕터 ${n} <b>${g.ch.name}</b> · 도달 라운드 <b>${g.round}</b> · 처치 <b>${g.kills}</b> · 남은 거점 <b>${g.baseHp}</b></p>
      <p>최고 기록: ${best > CFG.ROUNDS ? '클리어' : `라운드 ${best}`}</p>
      ${earned}${next > CHAPTERS.length ? '<p>🔓 <b>무한의 탑</b>이 열렸습니다!</p>' : next ? `<p>🔓 챕터 ${next} <b>${CHAPTERS[next - 1].name}</b>이(가) 열렸습니다!</p>` : ''}`;
    if (won) showModal(`챕터 ${n} 클리어!`, body, { okText: next > CHAPTERS.length ? '무한의 탑 도전' : `챕터 ${next} 시작`, onOk: () => newGame(next), altText: '⬆ 강화', onAlt: () => showUpgrades('up', () => showChapterSelect()) });
    else showModal('거점 함락', body + '<p style="color:var(--sub)">번 골드로 강화하고 다시 도전하세요.</p>', { okText: '다시 하기', onOk: () => newGame(n), altText: '⬆ 강화', onAlt: () => showUpgrades('up', () => newGame(n)) });
  }
}

function render() { renderHud(); renderQueue(); drawBoard(); refreshInfo(); }

function frame(t) {
  const dt = Math.min(250, t - (ui.last || t)); ui.last = t;
  const g = ui.g;
  const modalOpen = !$('modal').classList.contains('hidden'); // 팝업이 열려 있으면 시간 정지
  if (!ui.paused && !modalOpen && g.phase !== 'over' && g.phase !== 'won' && !document.hidden) {
    ui.acc += dt * ui.speed;
    while (ui.acc >= CFG.TICK_MS) {
      ui.acc -= CFG.TICK_MS; step(g); collectFx(); ui.msg = '';
      if (ui.auto) runAuto();
      if (ui.sel?.t === 'q' && !g.queue.some(q => q.id === ui.sel.id)) ui.sel = null;
      if (ui.sel?.t === 'c' && !getCell(g, ui.sel.x, ui.sel.y, ui.sel.z)) ui.sel = null;
      ui.comboList = ui.comboList.filter(p => getCell(g, p.x, p.y, p.z));
    }
  }
  commitEarnings(!ui.paused && !modalOpen && !document.hidden ? dt : 0);
  render(); checkEnd();
  requestAnimationFrame(frame);
}

function newGame(chapter = ui.g?.chapter || 1) {
  const tower = chapter >= TOWER_ID;
  ui.g = createGame((Date.now() ^ (Math.random() * 1e9)) >>> 0, { chapter: tower ? 1 : chapter, tower: tower ? 1 : 0, mods: modsOf(PROF), deck: PROF.deck.slice() });
  ui.commitGold = 0; ui.commitCrys = 0;
  rebuildPathIdx(); ui.anim.clear(); ui.hpPrev.clear(); ui.hitUntil.clear(); ui.puffs = [];
  $('queue').dataset.ids = '';
  ui.sel = null; ui.combo = false; ui.megaMode = false; ui.comboList = []; ui.acc = 0; ui.endShown = false; ui.msg = ''; ui.floats = [];
}

// 디버그/테스트용 접근점
window.__esd = { ui, lvMult };

// 예전 단일 챕터 기록(esd.bestRound)은 챕터 1 기록으로 이어받는다
if (lsGet(LS_BEST) && !lsGet(lsBest(1))) lsSet(lsBest(1), lsGet(LS_BEST));
newGame(Math.min(unlocked(), 1)); resize();
loadAssets().then(() => { $('queue').dataset.ids = ''; render(); });
ui.sessionGold = 0; ui.sessionSec = 0;
const off = offlineReward(PROF);
const afterIntro = () => {
  if (off.gold > 0) {
    PROF.gold += off.gold; saveProf(true);
    showModal('💤 오프라인 보상', `<p>자리를 비운 <b>${Math.floor(off.sec / 3600)}시간 ${Math.floor((off.sec % 3600) / 60)}분</b> 동안 슬라임들이 일했습니다.</p><p style="font-size:20px">💰 +${fmt(off.gold)}</p><p style="color:var(--sub)">최근 분당 골드의 50%, 최대 8시간</p>`, { okText: '받기', onOk: () => showChapterSelect() });
  } else showChapterSelect();
};
if (!lsGet('esd.seenHelp')) { lsSet('esd.seenHelp', '1'); showHelp(afterIntro); }
else afterIntro();
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProf(true); });
window.addEventListener('pagehide', () => saveProf(true));
// HUD의 챕터-라운드를 누르면 챕터 선택 (진행 중이면 포기 확인)
$('hRound').parentElement.style.cursor = 'pointer';
$('hRound').parentElement.onclick = () => {
  const g = ui.g;
  if (g.phase === 'run' || g.round > 1) showModal('챕터 선택', '<p>진행 중인 게임을 포기하고 챕터 선택으로 갈까요?</p>', { okText: '계속하기', altText: '챕터 선택', onAlt: () => showChapterSelect(true) });
  else showChapterSelect(true);
};
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 등록 실패', err)));
}
