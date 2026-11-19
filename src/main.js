// UI · 렌더링 · 입력 (Canvas 2D)
import { CFG, STATUS, RECIPES, ELEMENTS, GOBLINS } from './data.js';
import { slimeSprite, goblinSprite, drawSprite } from './sprites.js';
import {
  createGame, step, placeFromQueue, moveSlime, combine, makeMega, recipeHint, skipPrep,
  getCell, columnSlimes, megaAt, slimeCount, PATH, lvMult,
} from './engine.js';

const $ = id => document.getElementById(id);
const EL = Object.fromEntries(ELEMENTS.map(e => [e.sym, e]));
const LS_BEST = 'esd.bestRound';

const ui = {
  g: null, floor: 0, speed: 1, paused: false, acc: 0, last: 0,
  sel: null,            // {t:'q', id} | {t:'c', x,y,z}
  combo: false, comboList: [],
  floats: [],           // 데미지 숫자 표시
  drag: null,           // 드래그 상태
  msg: '',
};

// ---------- 저장 ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 무시 */ } }

// ---------- 캔버스 ----------
const pathCv = $('pathCv'), pitCv = $('pitCv');
const pctx = pathCv.getContext('2d'), kctx = pitCv.getContext('2d');
const PATH_ASPECT = 0.7, PIT_ASPECT = 0.68;

function fitCanvas(cv, aspect) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = cv.clientWidth || 300;
  cv.style.height = Math.round(w * aspect) + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * aspect * dpr);
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
// 화면 높이에 맞춰 두 캔버스를 비례 축소 (모바일 한 화면 유지, 최소 높이 보장)
function resize() {
  fitCanvas(pathCv, PATH_ASPECT); fitCanvas(pitCv, PIT_ASPECT);
  const over = document.documentElement.scrollHeight - window.innerHeight;
  if (over > 0) {
    const h0 = pathCv.clientHeight + pitCv.clientHeight;
    const f = Math.max(Math.min(h0, 520), h0 - over) / h0; // 도트가 뭉개지지 않도록 최소 높이 보장
    fitCanvas(pathCv, PATH_ASPECT * f); fitCanvas(pitCv, PIT_ASPECT * f);
  }
}
window.addEventListener('resize', resize);

const dims = cv => ({ w: cv.clientWidth, h: cv.clientHeight, cw: cv.clientWidth / CFG.W, ch: cv.clientHeight / CFG.H });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// 도트 슬라임: 셀 크기에 맞는 최대 정수배로 그림
function drawBlob(ctx, cx, cy, r, sl) {
  return drawSprite(ctx, slimeSprite(sl.color, sl.color2), cx, cy + r * 0.75, r * 2.3, r * 1.9);
}

function pixelText(ctx, text, x, y, size, fill, align = 'center') {
  ctx.font = `bold ${size}px "Courier New", monospace`; ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,21,31,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

function hpBar(ctx, x, y, w, ratio, col) {
  ctx.fillStyle = '#1b2130'; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, 4);
}

// ---------- 경로 맵 ----------
function drawPath() {
  const g = ui.g, { w, h, cw, ch } = dims(pathCv);
  pctx.clearRect(0, 0, w, h);
  pctx.fillStyle = '#2f3a50'; pctx.fillRect(0, 0, w, h);
  // 칸
  PATH.forEach(([x, y], i) => {
    const col = columnSlimes(g, x, y), mega = megaAt(g, x, y);
    pctx.fillStyle = col.length || mega ? '#4a3b33' : '#56627d';
    roundRect(pctx, x * cw + 2, y * ch + 2, cw - 4, ch - 4, 6); pctx.fill();
    // 함정 표시: 기둥 슬라임 수
    for (let k = 0; k < col.length; k++) {
      pctx.fillStyle = col[k].color;
      pctx.beginPath(); pctx.arc(x * cw + 9 + k * 9, y * ch + ch - 9, 3.5, 0, Math.PI * 2); pctx.fill();
    }
    pctx.fillStyle = 'rgba(255,255,255,.3)'; pctx.font = '9px sans-serif'; pctx.textAlign = 'right';
    pctx.fillText(`${x + 1},${y + 1}`, x * cw + cw - 5, y * ch + ch - 5);
    if (i === 0) { pctx.fillStyle = '#9fe08a'; pctx.textAlign = 'right'; pctx.fillText('입구', x * cw + cw - 5, y * ch + 12); }
    if (i === PATH.length - 1) { pctx.fillStyle = '#ff8a8a'; pctx.textAlign = 'right'; pctx.fillText('거점', x * cw + cw - 5, y * ch + 12); }
  });
  // ㄹ자 경로선
  pctx.strokeStyle = 'rgba(255,211,77,.35)'; pctx.lineWidth = 3; pctx.setLineDash([5, 5]);
  pctx.beginPath();
  PATH.forEach(([x, y], i) => { const px = x * cw + cw / 2, py = y * ch + ch / 2; i ? pctx.lineTo(px, py) : pctx.moveTo(px, py); });
  pctx.stroke(); pctx.setLineDash([]);
  // 메가 구역
  for (const m of g.megas) {
    pctx.strokeStyle = '#ffd34d'; pctx.lineWidth = 2; pctx.setLineDash([6, 4]);
    pctx.strokeRect(m.zx * cw + 1, m.zy * ch + 1, cw * 3 - 2, ch * 3 - 2); pctx.setLineDash([]);
  }
  // 고블린 (도트). 같은 칸에 구덩이 고블린과 지나가는 고블린이 겹치면 좌/우로 나눠 그림
  const byIdx = new Map();
  for (const gb of g.goblins) { if (!byIdx.has(gb.idx)) byIdx.set(gb.idx, []); byIdx.get(gb.idx).push(gb); }
  for (const [idx, list] of byIdx) {
    const [x, y] = PATH[idx];
    list.forEach((gb, i) => {
      const off = list.length > 1 ? (gb.pit ? -0.2 : 0.2) * cw + (i > 1 ? 4 : 0) : 0;
      const cx = x * cw + cw / 2 + off, size = Math.min(cw * (list.length > 1 ? 0.55 : 0.85), ch * 0.95) * (gb.type === 'giant' ? 1.25 : 1);
      const bottom = y * ch + ch - 6;
      const spr = goblinSprite(gb.type, !!(gb.st.freeze && gb.st.freeze.t > 0)); let rc;
      if (gb.pit) {
        // 구덩이: 어두운 구멍 + 하반신이 가려진 고블린
        pctx.fillStyle = '#120d0a';
        pctx.beginPath(); pctx.ellipse(cx, bottom - size * 0.28, size * 0.48, size * 0.16, 0, 0, Math.PI * 2); pctx.fill();
        // 구멍 선(holeY) 아래는 가려서 허리천·다리만 잠긴 것처럼 보이게 함
        const holeY = bottom - size * 0.28, sprH = goblinSprite(gb.type).height;
        const k = Math.min(size / 20, size / sprH);
        pctx.save(); pctx.beginPath(); pctx.rect(cx - size, holeY - size * 2, size * 2, size * 2); pctx.clip();
        rc = drawSprite(pctx, spr, cx, holeY + sprH * k * 0.3, size, size);
        pctx.restore();
        pctx.strokeStyle = '#ff4040'; pctx.lineWidth = 2;
        pctx.beginPath(); pctx.ellipse(cx, bottom - size * 0.28, size * 0.48, size * 0.16, 0, 0, Math.PI * 2); pctx.stroke();
      } else {
        rc = drawSprite(pctx, spr, cx, bottom - 2, size, size);
      }
      pixelText(pctx, gb.ch, cx, Math.max(y * ch + 10, rc.y - 1), 10, '#ffffff');
      hpBar(pctx, cx - size * 0.45, bottom + 1, size * 0.9, gb.hp / gb.maxhp, '#ff5a5a');
      let k = 0;
      for (const [n, e] of Object.entries(gb.st)) if (e.t > 0) {
        pctx.fillStyle = STATUS[n].color; pctx.fillRect(Math.round(cx + size * 0.38), Math.round(y * ch + 6 + k * 6), 5, 5); k++;
      }
    });
  }
  drawFloats(pctx, cw, ch);
}

function drawFloats(ctx, cw, ch) {
  const now = performance.now();
  ui.floats = ui.floats.filter(f => now - f.t0 < 900);
  ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
  for (const f of ui.floats) {
    const [x, y] = PATH[Math.min(f.idx, PATH.length - 1)];
    const a = (now - f.t0) / 900;
    ctx.globalAlpha = 1 - a;
    ctx.fillStyle = f.col; ctx.fillText(f.text, x * cw + cw / 2 + f.dx, y * ch + ch * 0.55 - a * 16);
  }
  ctx.globalAlpha = 1;
}

// ---------- 구덩이 ----------
function drawPit() {
  const g = ui.g, z = ui.floor, { w, h, cw, ch } = dims(pitCv);
  kctx.clearRect(0, 0, w, h);
  kctx.fillStyle = z === 0 ? '#323c52' : z === 1 ? '#2b3446' : '#252d3c'; kctx.fillRect(0, 0, w, h);
  const pitCols = new Set(g.goblins.filter(gb => gb.pit).map(gb => PATH[gb.idx].join(',')));
  for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
    const sl = getCell(g, x, y, z);
    const X = x * cw, Y = y * ch;
    kctx.fillStyle = 'rgba(255,255,255,.07)'; roundRect(kctx, X + 2, Y + 2, cw - 4, ch - 4, 6); kctx.fill();
    if (pitCols.has(`${x},${y}`)) { kctx.strokeStyle = '#ff4040'; kctx.lineWidth = 2.5; roundRect(kctx, X + 2, Y + 2, cw - 4, ch - 4, 6); kctx.stroke(); }
    const isSel = ui.sel?.t === 'c' && ui.sel.x === x && ui.sel.y === y && ui.sel.z === z;
    const inCombo = ui.comboList.some(p => p.x === x && p.y === y && p.z === z);
    if (isSel || inCombo) { kctx.strokeStyle = inCombo ? '#6be08a' : '#ffd34d'; kctx.lineWidth = 3; roundRect(kctx, X + 3, Y + 3, cw - 6, ch - 6, 6); kctx.stroke(); }
    if (!sl) continue;
    const r = Math.min(cw, ch) * 0.34;
    const rc = drawBlob(kctx, X + cw / 2, Y + ch / 2 + 4, r, sl);
    pixelText(kctx, sl.label, X + cw / 2, rc.y + rc.h * 0.72, Math.round(r * (sl.label.length > 3 ? 0.5 : 0.7)), '#ffffff');
    kctx.font = 'bold 11px sans-serif'; kctx.textAlign = 'left';
    kctx.fillStyle = sl.lv >= 5 ? '#ffb347' : sl.kind === 'compound' ? '#ffd34d' : sl.kind === 'mixture' ? '#c9b6ff' : '#e6ecf7';
    kctx.fillText(`Lv${sl.lv}${sl.kind === 'compound' ? '★' : sl.kind === 'mixture' ? '◇' : ''}`, X + 6, Y + 15);
    if (sl.sealed > 0) { kctx.fillStyle = '#c27bff'; kctx.textAlign = 'right'; kctx.fillText('봉인', X + cw - 6, Y + 15); }
    hpBar(kctx, X + 8, Y + ch - 10, cw - 16, sl.hp / sl.maxhp, '#6be08a');
  }
  for (const m of g.megas) {
    kctx.strokeStyle = '#ffd34d'; kctx.lineWidth = 2; kctx.setLineDash([6, 4]);
    kctx.strokeRect(m.zx * cw + 1, m.zy * ch + 1, cw * 3 - 2, ch * 3 - 2); kctx.setLineDash([]);
    kctx.globalAlpha = z === 0 ? 0.55 : 0.25;
    drawSprite(kctx, slimeSprite(m.color), (m.zx + 1.5) * cw, (m.zy + 3) * ch - 6, cw * 2.8, ch * 2.6);
    kctx.globalAlpha = 1;
    if (z === 0) {
      kctx.fillStyle = 'rgba(255,211,77,.9)'; kctx.font = 'bold 12px sans-serif'; kctx.textAlign = 'center';
      kctx.fillText(`${m.name} ${Math.max(0, Math.round(m.hp))}/${m.maxhp}`, (m.zx + 1.5) * cw, m.zy * ch + 14);
    }
  }
}

// ---------- HUD / 큐 ----------
function chipStyle(el, sym) { el.style.background = EL[sym].color; }

function renderQueue() {
  const box = $('queue'); const g = ui.g;
  $('qCount').textContent = `${g.queue.length}/${CFG.QUEUE_MAX}`;
  const ids = g.queue.map(q => q.id).join(',');
  if (box.dataset.ids !== ids) {
    box.dataset.ids = ids; box.textContent = '';
    for (const q of g.queue) {
      const c = document.createElement('div');
      c.className = 'chip'; c.textContent = q.sym; c.dataset.id = q.id; chipStyle(c, q.sym);
      c.setAttribute('role', 'button'); c.setAttribute('aria-label', `${EL[q.sym].name} 슬라임`);
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
  $('flLabel').textContent = `FLOOR ${ui.floor + 1} / ${CFG.D}${ui.floor === 0 ? ' (최상층)' : ''}`;
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
  if (ui.sel?.t === 'q') { const q = g.queue.find(v => v.id === ui.sel.id); if (q) { setInfo(`<b>${EL[q.sym].name}(${q.sym})</b> 선택됨 · 구덩이 칸을 탭해 배치 (같은 원소 위 = 겹치기)`); return; } }
  setInfo(ui.msg || g.log[g.log.length - 1] || '');
}

// ---------- 입력 ----------
function cellAt(cv, clientX, clientY) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((clientX - r.left) / (r.width / CFG.W)), y = Math.floor((clientY - r.top) / (r.height / CFG.H));
  if (x < 0 || y < 0 || x >= CFG.W || y >= CFG.H) return null;
  return { x, y, z: ui.floor };
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
    const gh = document.createElement('div'); gh.className = 'chip ghost'; gh.textContent = sym;
    gh.style.background = d.src.t === 'q' ? EL[sym].color : getCell(ui.g, d.src.x, d.src.y, d.src.z).color;
    document.body.appendChild(gh); d.ghost = gh;
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
    const cell = cellAt(pitCv, e.clientX, e.clientY);
    if (cell) { const res = applyDrop(d.src, cell); flash(res); if (res.ok) ui.sel = null; }
  }
  render();
}

pitCv.addEventListener('pointerdown', e => {
  const cell = cellAt(pitCv, e.clientX, e.clientY); if (!cell) return;
  if (ui.combo) { e.preventDefault(); tapCell(cell); render(); return; }
  if (getCell(ui.g, cell.x, cell.y, cell.z)) beginDrag(e, { t: 'c', ...cell });
  else { e.preventDefault(); tapCell(cell); render(); }
});
window.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', e => { if (ui.drag?.ghost) ui.drag.ghost.remove(); ui.drag = null; void e; });

// ---------- 버튼 ----------
$('flPrev').onclick = () => { ui.floor = (ui.floor + CFG.D - 1) % CFG.D; render(); };
$('flNext').onclick = () => { ui.floor = (ui.floor + 1) % CFG.D; render(); };
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
  const gbs = Object.values(GOBLINS).map(d => `<tr><td>${d.ch} ${d.name}</td><td>${d.atk ? '공격' : '공격 안 함'}</td><td>-${d.leak}</td></tr>`).join('');
  showModal('게임 방법', `
    <p>고블린은 위 <b>ㄹ자 경로</b>로 이동합니다. 슬라임이 있는 칸에 들어가면 <b>구덩이에 빠져</b> 최상층 슬라임부터 대결하고, 슬라임이 없으면 통과합니다.</p>
    <p>슬라임은 <b>3초마다 1개</b> 지급됩니다. 같은 원소를 겹치면 Lv+1(최대 5). <b>조합</b>(촉매 1개 소모): 족보 일치 시 화합물 150%, 불일치 시 혼합물 70%.</p>
    <p><b>메가</b>: 보스 라운드(10) 전용. Lv5 같은 원소 3개 → 3×3 구역, 최대 5마리 동시 공격.</p>
    <p>보너스: 같은 원소 2개↑ 받는 피해 -10%, 3개↑ 공격 +20%, 한 기둥에 같은 원소 3개 공격 +20%.</p>
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

function render() { renderHud(); renderQueue(); drawPath(); drawPit(); refreshInfo(); }

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
if (!lsGet('esd.seenHelp')) { lsSet('esd.seenHelp', '1'); showHelp(); }
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 등록 실패', err)));
}
