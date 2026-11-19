// UI · 렌더링 · 입력 (Canvas 2D)
import { CFG, STATUS, RECIPES, ELEMENTS, GOBLINS } from './data.js';
import { drawSlimeArt, drawGoblinArt, loadAssets, walkFrames } from './sprites.js';
import {
  createGame, step, placeFromQueue, moveSlime, combine, makeMega, recipeHint, skipPrep,
  getCell, slimeCount, PATH, lvMult,
} from './engine.js';

const $ = id => document.getElementById(id);
const EL = Object.fromEntries(ELEMENTS.map(e => [e.sym, e]));
const LS_BEST = 'esd.bestRound';

const ui = {
  g: null, speed: 1, paused: false, acc: 0, last: 0,
  sel: null,            // {t:'q', id} | {t:'c', x,y,z}
  combo: false, comboList: [],
  floats: [],           // 데미지 숫자 표시
  anim: new Map(),      // 고블린 id -> {from, to, t0, flip} 칸 이동 보간
  drag: null,           // 드래그 상태
  msg: '',
};

// ---------- 저장 ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 무시 */ } }

// ---------- 캔버스 (통합 전장 1장) ----------
const boardCv = $('boardCv');
const bctx = boardCv.getContext('2d');
const BOARD_ASPECT = 1.0;

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

const dims = cv => ({ w: cv.clientWidth, h: cv.clientHeight, cw: cv.clientWidth / CFG.W, ch: cv.clientHeight / CFG.H });

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
const PATH_IDX = new Map(PATH.map(([x, y], i) => [`${x},${y}`, i]));

function lvTag(ctx, sl, X, Y) {
  const txt = `Lv${sl.lv}${sl.kind === 'compound' ? '★' : sl.kind === 'mixture' ? '◇' : ''}`;
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,21,31,.85)'; ctx.strokeText(txt, X + 5, Y + 14);
  ctx.fillStyle = sl.lv >= 5 ? '#ffb347' : sl.kind === 'compound' ? '#ffd34d' : sl.kind === 'mixture' ? '#c9b6ff' : '#e6ecf7';
  ctx.fillText(txt, X + 5, Y + 14);
}

function goblinStatus(ctx, gb, x, y) {
  let k = 0;
  for (const [n, e] of Object.entries(gb.st)) if (e.t > 0) {
    ctx.fillStyle = STATUS[n].color; ctx.fillRect(Math.round(x), Math.round(y + k * 6), 5, 5); k++;
  }
}

function drawBoard() {
  const g = ui.g, ctx = bctx, { w, h, cw, ch } = dims(boardCv);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#2f3a50'; ctx.fillRect(0, 0, w, h);
  // 칸 이동 보간: 틱마다 바뀐 경로 위치(idx)를 짧은 시간 동안 부드럽게 이동
  const now = performance.now(), moveMs = Math.min(900, (CFG.TICK_MS / ui.speed) * 0.6);
  const live = new Set();
  const inside = new Map(), walking = [];
  for (const gb of g.goblins) {
    live.add(gb.id);
    let a = ui.anim.get(gb.id);
    if (!a) { a = { from: gb.idx, to: gb.idx, t0: 0, flip: false }; ui.anim.set(gb.id, a); }
    if (a.to !== gb.idx) { a.from = a.to; a.to = gb.idx; a.t0 = now; }
    const p = a.t0 ? Math.min(1, (now - a.t0) / moveMs) : 1;
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
  for (const id of ui.anim.keys()) if (!live.has(id)) ui.anim.delete(id);
  const frameOf = (gb, moving) => (moving && walkFrames(gb.type) ? Math.floor(now / 95) % walkFrames(gb.type) : 0);

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
    ctx.globalAlpha = 0.6;
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
    if (sl) {
      const art = drawSlimeArt(ctx, sl, X + cw / 2, Y + ch - 10, cw * 0.94, ch - 18);
      for (const gb of trapped) {
        // 고블린을 슬라임 몸 안에 작게 그리고, 그 위에 슬라임을 반투명으로 덮어 "갇힌" 느낌
        const frozen = !!(gb.st.freeze && gb.st.freeze.t > 0);
        const size = Math.min(art.rect.w, art.rect.h) * (gb.type === 'giant' ? 0.95 : 0.78);
        drawGoblinArt(ctx, gb.type, frozen, X + cw / 2, art.rect.y + art.rect.h - 2, size);
        ctx.globalAlpha = 0.45; drawSlimeArt(ctx, sl, X + cw / 2, Y + ch - 10, cw * 0.94, ch - 18); ctx.globalAlpha = 1;
        hpBar(ctx, X + 8, Y + 18, cw - 16, gb.hp / gb.maxhp, '#ff5a5a');
        goblinStatus(ctx, gb, X + cw - 10, Y + 24);
        ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2.5; roundRect(ctx, X + 2, Y + 2, cw - 4, ch - 4, 7); ctx.stroke();
      }
      if (art.label) pixelText(ctx, art.label, X + cw / 2, art.rect.y + art.rect.h * 0.75, Math.round(Math.min(cw, ch) * (art.label.length > 3 ? 0.15 : 0.2)), '#ffffff');
      lvTag(ctx, sl, X, Y);
      if (sl.sealed > 0) pixelText(ctx, '봉인', X + cw - 6, Y + 14, 10, '#c27bff', 'right');
      hpBar(ctx, X + 8, Y + ch - 8, cw - 16, sl.hp / sl.maxhp, '#6be08a');
    } else if (trapped.length) {
      // 메가 구역 안에 갇힌 고블린
      for (const gb of trapped) {
        drawGoblinArt(ctx, gb.type, false, X + cw / 2, Y + ch - 8, Math.min(cw, ch) * 0.7);
        hpBar(ctx, X + 8, Y + 18, cw - 16, gb.hp / gb.maxhp, '#ff5a5a');
        ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2.5; roundRect(ctx, X + 2, Y + 2, cw - 4, ch - 4, 7); ctx.stroke();
      }
    }
    if (isSel || inCombo) { ctx.strokeStyle = inCombo ? '#6be08a' : '#ffd34d'; ctx.lineWidth = 3; roundRect(ctx, X + 3, Y + 3, cw - 6, ch - 6, 7); ctx.stroke(); }
  }
  // 걷는 고블린 (도착한 칸에 슬라임이 있으면 칸 오른쪽 위로 비켜서 지나감)
  for (const wk of walking) {
    const { gb } = wk;
    const cx0 = Math.round(wk.fx), cy0 = Math.round(wk.fy);
    const idxHere = PATH_IDX.get(`${cx0},${cy0}`);
    const occupied = !wk.moving && (!!getCell(g, cx0, cy0, 0) || inside.has(idxHere));
    const frozen = !!(gb.st.freeze && gb.st.freeze.t > 0);
    const size = Math.min(cw, ch) * (occupied ? 0.55 : 0.82) * (gb.type === 'giant' ? 1.25 : 1);
    const cx = wk.fx * cw + (occupied ? cw * 0.72 : cw / 2), bottom = wk.fy * ch + (occupied ? ch * 0.62 : ch - 8);
    const rc = drawGoblinArt(ctx, gb.type, frozen, cx, bottom, size, { frame: frameOf(gb, wk.moving), flip: wk.flip });
    hpBar(ctx, cx - size * 0.4, Math.max(wk.fy * ch + 3, rc.y - 6), size * 0.8, gb.hp / gb.maxhp, '#ff5a5a');
    goblinStatus(ctx, gb, cx + size * 0.42, rc.y);
  }
  drawFloats(ctx, cw, ch);
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
      const im = document.createElement('img'); im.src = `assets/slime_${q.sym}.png`; im.alt = '';
      const sp = document.createElement('span'); sp.textContent = EL[q.sym].name;
      c.append(im, sp);
      c.addEventListener('pointerdown', e => beginDrag(e, { t: 'q', id: q.id }));
      box.appendChild(c);
    }
  }
  for (const c of box.children) c.classList.toggle('sel', ui.sel?.t === 'q' && ui.sel.id === +c.dataset.id);
}

function renderHud() {
  const g = ui.g;
  $('hRound').textContent = `${g.round}/${CFG.ROUNDS}`;
  $('hBase').textContent = g.baseHp;
  $('hBase').style.color = g.baseHp <= 5 ? 'var(--danger)' : '';
  $('hCount').textContent = `${slimeCount(g)}/${CFG.CAP}`;
  $('hCat').textContent = g.catalysts;
  $('hPhase').textContent = g.phase === 'prep' ? `준비 ${g.prepLeft}` : g.phase === 'run' ? `전투 ${g.spawnList.length + g.goblins.length}` : '종료';
  $('hTick').style.width = `${Math.min(100, (ui.acc / CFG.TICK_MS) * 100)}%`;
  $('bStart').disabled = g.phase !== 'prep';
  $('bCombo').classList.toggle('on', ui.combo);
  $('bCombo').textContent = ui.megaMode ? '취소' : ui.combo ? '조합 실행' : '조합';
  $('bMega').classList.toggle('on', !!ui.megaMode);
  $('bMega').disabled = g.round !== CFG.ROUNDS;
  $('bSpeed').textContent = `×${ui.speed}`;
  $('bPause').textContent = ui.paused ? '재개' : '정지';
  $('bPause').classList.toggle('on', ui.paused);
}

function setInfo(html) { $('info').innerHTML = html; }

function slimeInfo(sl) {
  const sts = sl.status.map(s => STATUS[s.name].label).join(', ');
  const kind = { element: '원소', compound: '화합물 150%', mixture: '혼합물 70%' }[sl.kind];
  return `<b>${sl.name} ${sl.label} Lv${sl.lv}</b> · ${kind} · HP ${Math.ceil(sl.hp)}/${sl.maxhp} · 공격 ${sl.atk.toFixed(1)} · 방어 ${sl.def.toFixed(1)} · 효과: ${sts}`;
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
  const r = cv.getBoundingClientRect();
  const x = Math.floor((clientX - r.left) / (r.width / CFG.W)), y = Math.floor((clientY - r.top) / (r.height / CFG.H));
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
  if (ui.comboList.length) flash(combine(ui.g, ui.comboList));
  ui.combo = false; ui.comboList = []; render();
};
$('bMega').onclick = () => {
  if (!ui.combo) { ui.combo = true; ui.comboList = []; ui.sel = null; ui.msg = ''; ui.megaMode = true; render(); return; }
  if (ui.megaMode) { flash(makeMega(ui.g, ui.comboList)); ui.combo = false; ui.megaMode = false; ui.comboList = []; render(); }
};
$('bHelp').onclick = () => showHelp();
$('mOk').onclick = () => { $('modal').classList.add('hidden'); if (ui.endShown) newGame(); };
$('mAlt').onclick = () => { $('modal').classList.add('hidden'); newGame(); };

function showModal(title, html, alt = false) {
  $('mTitle').textContent = title; $('mBody').innerHTML = html;
  $('mAlt').classList.toggle('hidden', !alt); $('modal').classList.remove('hidden');
}

function showHelp() {
  const rec = RECIPES.map(r => `<tr><td>${r.label} ${r.name}</td><td>${Object.entries(r.need).map(([k, v]) => v > 1 ? `${k}×${v}` : k).join(' + ')}</td><td>${STATUS[r.st.name].label}</td></tr>`).join('');
  const els = ELEMENTS.map(e => `<tr><td>${e.sym} ${e.name}</td><td>${STATUS[e.st.name].label}</td><td>R${e.unlock}</td></tr>`).join('');
  const gbs = Object.entries(GOBLINS).map(([k, d]) => `<tr><td><img class="gimg" src="assets/goblin_${k}.png" alt=""> ${d.name}</td><td>${d.atk ? '공격' : '공격 안 함'}</td><td>-${d.leak}</td></tr>`).join('');
  showModal('게임 방법', `
    <p>고블린은 전장을 <b>ㄹ자 경로</b>로 이동합니다. 슬라임이 있는 칸에 들어가면 <b>슬라임 안에 갇혀</b> 대결하고, 슬라임이 없으면 통과합니다. 한 슬라임에는 고블린 1마리만 갇히고, 뒤 고블린은 지나갑니다.</p>
    <p>슬라임 카드는 <b>3초마다 1장</b> 덱에 들어옵니다(최대 ${CFG.QUEUE_MAX}장). 같은 원소를 겹치면 Lv+1(최대 5). <b>조합</b>(촉매 1개 소모): 족보 일치 시 화합물 150%, 불일치 시 혼합물 70%.</p>
    <p><b>메가</b>: 보스 라운드(10) 전용. Lv5 같은 원소 3개 → 3×3 구역, 최대 5마리 동시 공격.</p>
    <p>보너스: 같은 원소 2개↑ 받는 피해 -10%, 3개↑ 공격 +20%, 같은 가로줄에 같은 원소 3개 공격 +20%.</p>
    <table><tr><th>원소</th><th>효과</th><th>해금</th></tr>${els}</table>
    <table><tr><th>화합물</th><th>족보</th><th>효과</th></tr>${rec}</table>
    <table><tr><th>고블린</th><th>슬라임</th><th>거점</th></tr>${gbs}</table>`);
}

// ---------- 루프 ----------
function collectFx() {
  const now = performance.now();
  for (const f of ui.g.fx) {
    if (f.k === 'dmg') ui.floats.push({ idx: f.idx, text: (f.who === 'g' ? '-' : '▼') + f.v, col: f.who === 'g' ? '#ffd34d' : '#ff7b7b', t0: now, dx: (Math.random() - 0.5) * 18 });
    if (f.k === 'leak') ui.floats.push({ idx: f.idx, text: `거점 -${f.v}`, col: '#ff4040', t0: now, dx: 0 });
  }
}

function checkEnd() {
  const g = ui.g; if (ui.endShown) return;
  if (g.phase === 'over' || g.phase === 'won') {
    ui.endShown = true;
    const best = Math.max(+(lsGet(LS_BEST) || 0), g.phase === 'won' ? CFG.ROUNDS + 1 : g.round);
    lsSet(LS_BEST, String(best));
    showModal(g.phase === 'won' ? '챕터 1 클리어!' : '거점 함락',
      `<p>도달 라운드 <b>${g.round}</b> · 처치 <b>${g.kills}</b> · 남은 거점 <b>${g.baseHp}</b></p><p>최고 기록: ${best > CFG.ROUNDS ? '클리어' : `라운드 ${best}`}</p>`);
  }
}

function render() { renderHud(); renderQueue(); drawBoard(); refreshInfo(); }

function frame(t) {
  const dt = Math.min(250, t - (ui.last || t)); ui.last = t;
  const g = ui.g;
  if (!ui.paused && g.phase !== 'over' && g.phase !== 'won' && !document.hidden) {
    ui.acc += dt * ui.speed;
    while (ui.acc >= CFG.TICK_MS) {
      ui.acc -= CFG.TICK_MS; step(g); collectFx(); ui.msg = '';
      if (ui.sel?.t === 'q' && !g.queue.some(q => q.id === ui.sel.id)) ui.sel = null;
      if (ui.sel?.t === 'c' && !getCell(g, ui.sel.x, ui.sel.y, ui.sel.z)) ui.sel = null;
      ui.comboList = ui.comboList.filter(p => getCell(g, p.x, p.y, p.z));
    }
  }
  render(); checkEnd();
  requestAnimationFrame(frame);
}

function newGame() {
  ui.g = createGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  ui.sel = null; ui.combo = false; ui.megaMode = false; ui.comboList = []; ui.acc = 0; ui.endShown = false; ui.msg = ''; ui.floats = [];
}

// 디버그/테스트용 접근점
window.__esd = { ui, lvMult };

newGame(); resize();
loadAssets().then(() => render());
if (!lsGet('esd.seenHelp')) { lsSet('esd.seenHelp', '1'); showHelp(); }
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 등록 실패', err)));
}
