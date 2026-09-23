/* ================================================
   MatchIt! — Game Logic (game.js)
   - Fetches data from Google Sheet (CSV)
   - Matching game: Image cards ↔ Label cards
   - Tracks score, timer, attempts
   - Drag & Drop: Mouse + Touch support
   ================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  data: [],          // [{ id, imageUrl, label }]
  selectedImg: null, // currently selected image card index
  selectedLbl: null, // currently selected label card index
  matched: new Set(),
  tries: 0,
  score: 0,
  timerInterval: null,
  timerStart: null,
  elapsedSec: 0,
  locked: false,     // prevent clicks during animation

  // Drag & Drop state
  drag: {
    active: false,
    type: null,      // 'img' | 'lbl'
    imgIdx: null,    // dragging an image card
    lblPos: null,    // dragging a label card
    ghost: null,     // touch ghost DOM element
    touchId: null,   // active touch identifier
  },
};

// ── Demo Data ───────────────────────────────────────────────────────────────
const RELIABLE_DEMO = [
  { imageUrl: 'https://picsum.photos/seed/cat/300/200',    label: '🐱 แมว' },
  { imageUrl: 'https://picsum.photos/seed/dog/300/200',    label: '🐶 สุนัข' },
  { imageUrl: 'https://picsum.photos/seed/bird/300/200',   label: '🐦 นก' },
  { imageUrl: 'https://picsum.photos/seed/fish/300/200',   label: '🐠 ปลา' },
  { imageUrl: 'https://picsum.photos/seed/rabbit/300/200', label: '🐰 กระต่าย' },
  { imageUrl: 'https://picsum.photos/seed/tiger/300/200',  label: '🐯 เสือ' },
];

// ── Utility ─────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function $(id) { return document.getElementById(id); }

// ── Timer ───────────────────────────────────────────────────────────────────
function startTimer() {
  stopTimer();
  state.timerStart = Date.now();
  state.timerInterval = setInterval(() => {
    state.elapsedSec = Math.floor((Date.now() - state.timerStart) / 1000);
    $('timer-val').textContent = formatTime(state.elapsedSec);
  }, 1000);
}
function stopTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
}

// ── Convert Google Sheet URL → CSV Export URL ──────────────────────────────
function toCSVUrl(rawUrl, sheetName) {
  rawUrl = rawUrl.trim();
  sheetName = (sheetName || 'Sheet1').trim();

  // Already a CSV export URL
  if (rawUrl.includes('/export?') || rawUrl.includes('format=csv')) return rawUrl;

  // Published CSV url (pub?output=csv)
  if (rawUrl.includes('pub?') || rawUrl.includes('pubhtml')) {
    return rawUrl.replace('pubhtml', 'pub').replace('output=html', 'output=csv')
      + (rawUrl.includes('output=') ? '' : '&output=csv');
  }

  // Standard spreadsheet URL  → extract ID
  const match = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('ไม่พบ Spreadsheet ID ใน URL กรุณาตรวจสอบ URL อีกครั้ง');

  const id = match[1];
  // Also carry through the gid (sheet tab) if present in the URL
  const gidMatch = rawUrl.match(/[#&?]gid=(\d+)/);
  let url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  if (gidMatch) url += `&gid=${gidMatch[1]}`;
  return url;
}

// ── Parse CSV (supports quoted fields) ─────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

// ── Read config tab from the same spreadsheet ─────────────────────────────────
// Config tab format: 2 columns — key | value
// Supported keys: game_sheet, title
async function fetchConfig(rawUrl) {
  try {
    const csvUrl = toCSVUrl(rawUrl, 'config');
    const resp = await fetch(csvUrl);
    if (!resp.ok) return {};
    const rows = parseCSV(await resp.text());
    const cfg = {};
    const startRow = (rows[0] && rows[0][0] && rows[0][0].toLowerCase() === 'key') ? 1 : 0;
    for (let i = startRow; i < rows.length; i++) {
      const k = (rows[i][0] || '').trim().toLowerCase();
      const v = (rows[i][1] || '').trim();
      if (k) cfg[k] = v;
    }
    return cfg;
  } catch (_) {
    return {}; // config tab is optional — silently ignore
  }
}

// ── Fetch & Parse Google Sheet ──────────────────────────────────────────────
async function fetchSheetData(csvUrl) {
  const resp = await fetch(csvUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ไม่สามารถดึงข้อมูลได้ กรุณาตรวจสอบ URL และการแชร์ชีต`);
  const text = await resp.text();
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('ชีตมีข้อมูลน้อยเกินไป (ต้องมีอย่างน้อย 1 header row + 1 data row)');

  // Find columns (header row)
  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const imgIdx = headers.findIndex(h => h.includes('image') || h.includes('img') || h.includes('รูป') || h.includes('url'));
  const lblIdx = headers.findIndex(h => h.includes('label') || h.includes('name') || h.includes('text') || h.includes('word') || h.includes('คำ') || h.includes('ชื่อ'));

  // Fallback: assume col 0 = image_url, col 1 = label
  const ci = imgIdx >= 0 ? imgIdx : 0;
  const cl = lblIdx >= 0 ? lblIdx : 1;

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const imageUrl = row[ci] || '';
    const label = row[cl] || '';
    if (imageUrl && label) {
      data.push({ id: i - 1, imageUrl, label });
    }
  }
  if (data.length < 2) throw new Error('พบข้อมูลที่ใช้ได้น้อยเกินไป ต้องมีทั้ง image_url และ label');
  return data;
}

// ── Show/Hide Panels ────────────────────────────────────────────────────────
function showPanel(name) {
  ['setup-panel', 'game-panel', 'win-panel'].forEach(id => {
    $(id).style.display = id.includes(name) ? '' : 'none';
  });
}

// ── Load Sheet (button click) ───────────────────────────────────────────────
async function loadSheet() {
  const url = $('sheet-url').value.trim();
  if (!url) { showError('กรุณาใส่ URL ของ Google Sheet'); return; }

  clearError();
  showLoading(true);
  $('btn-load').disabled = true;

  try {
    // อ่าน config tab ก่อน (ถ้าไม่มี config tab ก็ใช้ค่า default)
    const cfg = await fetchConfig(url);
    const sheetName = cfg.game_sheet
                   || $('sheet-name').value.trim()
                   || 'Sheet1';
    $('sheet-name').value = sheetName;

    const csvUrl = toCSVUrl(url, sheetName);
    const data = await fetchSheetData(csvUrl);
    // ✅ บันทึก URL และชื่อ Sheet ลง localStorage
    localStorage.setItem('matchit_sheet_url', url);
    localStorage.setItem('matchit_sheet_name', sheetName);
    startGame(data);
  } catch (err) {
    showError('❌ ' + (err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล'));
  } finally {
    showLoading(false);
    $('btn-load').disabled = false;
  }
}

// ── Load Demo ───────────────────────────────────────────────────────────────
function loadDemo() {
  clearError();
  startGame(RELIABLE_DEMO.map((d, i) => ({ ...d, id: i })));
}

// ── Start Game ──────────────────────────────────────────────────────────────
function startGame(data) {
  state.data = data;
  state.matched = new Set();
  state.tries = 0; state.score = 0;
  state.selectedImg = null; state.selectedLbl = null;
  state.locked = false; state.elapsedSec = 0;
  state.drag = { active: false, type: null, imgIdx: null, lblPos: null, ghost: null, touchId: null };

  $('score-val').textContent = '0';
  $('timer-val').textContent = '0:00';
  $('tries-val').textContent = '0';

  renderBoard();
  showPanel('game');
  startTimer();
}

// ── Build a single Image Card element ──────────────────────────────────────
function buildImageCard(item, idx) {
  const card = document.createElement('div');
  card.className = 'match-card card-image';
  card.id = `img-card-${idx}`;
  card.dataset.idx = idx;
  card.draggable = true;
  card.innerHTML = `
    <span class="card-num">${idx + 1}</span>
    <img src="${escapeHtml(item.imageUrl)}"
         alt="${escapeHtml(item.label)}"
         loading="lazy"
         draggable="false"
         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22120%22><rect fill=%22%23334155%22 width=%22200%22 height=%22120%22/><text x=%2250%%22 y=%2250%%22 fill=%22%2394a3b8%22 font-size=%2228%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>🖼️</text></svg>'"
    />
    <div class="drag-hint"><span class="drag-hint-icon">⇄</span></div>
  `;
  card.addEventListener('click',      () => { if (!state.drag.active) onImageClick(idx); });
  card.addEventListener('dragstart',  e  => onImgDragStart(e, idx));
  card.addEventListener('dragend',    e  => onDragEnd(e));
  card.addEventListener('dragover',   e  => { e.preventDefault(); });
  card.addEventListener('dragenter',  e  => onDropEnter(e, card));
  card.addEventListener('dragleave',  e  => onDropLeave(e, card));
  card.addEventListener('drop',       e  => onImgDrop(e, idx));
  card.addEventListener('touchstart', e  => onTouchStart(e, 'img', idx), { passive: false });
  card.addEventListener('touchmove',  e  => onTouchMove(e),              { passive: false });
  card.addEventListener('touchend',   e  => onTouchEnd(e),               { passive: false });
  return card;
}

// ── Build a single Label Card element ──────────────────────────────────────
function buildLabelCard(dataIdx, pos, isMatched = false) {
  const item = state.data[dataIdx];
  const card = document.createElement('div');
  card.className = 'match-card card-label' + (isMatched ? ' matched locked' : '');
  card.id = `lbl-card-${pos}`;
  card.dataset.pos = pos;
  card.dataset.dataIdx = dataIdx;
  card.draggable = !isMatched;
  card.innerHTML = `
    <span class="card-label-icon">${getEmoji(item.label)}</span>
    <span class="card-label-text">${escapeHtml(item.label)}</span>
    <span class="card-check">✓</span>
  `;
  if (!isMatched) {
    card.addEventListener('click',      () => { if (!state.drag.active) onLabelClick(pos); });
    card.addEventListener('dragstart',  e  => onLblDragStart(e, pos));
    card.addEventListener('dragend',    e  => onDragEnd(e));
    card.addEventListener('dragover',   e  => { e.preventDefault(); });
    card.addEventListener('dragenter',  e  => onDropEnter(e, card));
    card.addEventListener('dragleave',  e  => onDropLeave(e, card));
    card.addEventListener('drop',       e  => onLblDrop(e, pos));
    card.addEventListener('touchstart', e  => onTouchStart(e, 'lbl', pos), { passive: false });
    card.addEventListener('touchmove',  e  => onTouchMove(e),               { passive: false });
    card.addEventListener('touchend',   e  => onTouchEnd(e),                { passive: false });
  }
  return card;
}

// ── Render Board ─────────────────────────────────────────────────────────────
function renderBoard() {
  const imgList = $('list-images');
  const lblList = $('list-labels');
  imgList.innerHTML = '';
  lblList.innerHTML = '';

  state.data.forEach((item, idx) => imgList.appendChild(buildImageCard(item, idx)));

  state.labelOrder = shuffle(state.data.map((_, i) => i));
  state.labelOrder.forEach((dataIdx, pos) => lblList.appendChild(buildLabelCard(dataIdx, pos, false)));

  updateProgress();
  updateConnectorSVG();
}

// ── Shuffle ───────────────────────────────────────────────────────────────────
function shuffleCards() {
  const lblList = $('list-labels');
  state.selectedImg = null; state.selectedLbl = null;
  clearAllSelections();

  const unmatched = state.data.map((_, i) => i).filter(i => !state.matched.has(i));
  const shuffledUnmatched = shuffle(unmatched);
  const newLabelOrder = [...state.labelOrder];
  const unmatchedPositions = state.labelOrder
    .map((di, pos) => (!state.matched.has(di) ? pos : -1))
    .filter(p => p >= 0);
  unmatchedPositions.forEach((pos, i) => { newLabelOrder[pos] = shuffledUnmatched[i]; });
  state.labelOrder = newLabelOrder;

  lblList.innerHTML = '';
  state.labelOrder.forEach((dataIdx, pos) => {
    lblList.appendChild(buildLabelCard(dataIdx, pos, state.matched.has(dataIdx)));
  });
  updateConnectorSVG();
}

// ── Click Handlers ───────────────────────────────────────────────────────────
function onImageClick(idx) {
  if (state.locked) return;
  if (state.matched.has(idx)) return;

  // Toggle selection
  if (state.selectedImg === idx) {
    state.selectedImg = null;
    getImgCard(idx).classList.remove('selected');
    updateConnectorSVG();
    return;
  }

  // Deselect old
  if (state.selectedImg !== null) getImgCard(state.selectedImg).classList.remove('selected');

  state.selectedImg = idx;
  getImgCard(idx).classList.add('selected');
  updateConnectorSVG();

  // If label already selected → attempt match
  if (state.selectedLbl !== null) attemptMatch();
}

function onLabelClick(pos) {
  if (state.locked) return;
  const dataIdx = state.labelOrder[pos];
  if (state.matched.has(dataIdx)) return;

  // Toggle
  if (state.selectedLbl === pos) {
    state.selectedLbl = null;
    getLblCard(pos).classList.remove('selected');
    updateConnectorSVG();
    return;
  }

  if (state.selectedLbl !== null) getLblCard(state.selectedLbl).classList.remove('selected');

  state.selectedLbl = pos;
  getLblCard(pos).classList.add('selected');
  updateConnectorSVG();

  if (state.selectedImg !== null) attemptMatch();
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Drag & Drop: Mouse ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function onImgDragStart(e, idx) {
  if (state.locked || state.matched.has(idx)) { e.preventDefault(); return; }
  state.drag.active = true; state.drag.type = 'img'; state.drag.imgIdx = idx; state.drag.lblPos = null;
  clearAllSelections(); state.selectedImg = null; state.selectedLbl = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `img:${idx}`);
  const ghost = createDragGhost('img', idx);
  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
  setTimeout(() => ghost.remove(), 0);
  getImgCard(idx).classList.add('dragging');
}

function onLblDragStart(e, pos) {
  if (state.locked || state.matched.has(state.labelOrder[pos])) { e.preventDefault(); return; }
  state.drag.active = true; state.drag.type = 'lbl'; state.drag.lblPos = pos; state.drag.imgIdx = null;
  clearAllSelections(); state.selectedImg = null; state.selectedLbl = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', `lbl:${pos}`);
  const ghost = createDragGhost('lbl', pos);
  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
  setTimeout(() => ghost.remove(), 0);
  getLblCard(pos).classList.add('dragging');
}

// Dropped image card ON a label card
function onLblDrop(e, targetPos) {
  e.preventDefault(); clearDropOver();
  if (!state.drag.active || state.drag.type !== 'img') return;
  const imgIdx = state.drag.imgIdx;
  resetDragState();
  state.selectedImg = imgIdx; state.selectedLbl = targetPos;
  attemptMatch();
}

// Dropped label card ON an image card
function onImgDrop(e, targetImgIdx) {
  e.preventDefault(); clearDropOver();
  if (!state.drag.active || state.drag.type !== 'lbl') return;
  const lblPos = state.drag.lblPos;
  resetDragState();
  state.selectedImg = targetImgIdx; state.selectedLbl = lblPos;
  attemptMatch();
}

function onDragEnd(e) {
  clearDropOver();
  resetDragState();
}

function onDropEnter(e, card) {
  e.preventDefault();
  if (!state.drag.active) return;
  const valid =
    (state.drag.type === 'img' && card.classList.contains('card-label')) ||
    (state.drag.type === 'lbl' && card.classList.contains('card-image'));
  if (valid && !card.classList.contains('matched')) card.classList.add('drag-over');
}

function onDropLeave(e, card) {
  if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
}

function clearDropOver() {
  document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
}

function resetDragState() {
  document.querySelectorAll('.dragging').forEach(c => c.classList.remove('dragging'));
  state.drag.active = false; state.drag.type = null;
  state.drag.imgIdx = null; state.drag.lblPos = null;
}

function createDragGhost(type, id) {
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.cssText = 'position:fixed;top:-200px;left:0;z-index:99999;pointer-events:none;';
  if (type === 'img') {
    const img = getImgCard(id)?.querySelector('img');
    ghost.innerHTML = `<div class="drag-ghost-img"><img src="${img?.src || ''}" /></div>`;
  } else {
    const dataIdx = state.labelOrder[id];
    const item = state.data[dataIdx];
    ghost.innerHTML = `<div class="drag-ghost-lbl">${getEmoji(item.label)} ${escapeHtml(item.label)}</div>`;
  }
  document.body.appendChild(ghost);
  return ghost;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Drag & Drop: Touch ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function onTouchStart(e, type, id) {
  if (state.locked) return;
  if (type === 'img' && state.matched.has(id)) return;
  if (type === 'lbl' && state.matched.has(state.labelOrder[id])) return;
  const touch = e.touches[0];
  state.drag.touchId = touch.identifier;
  const ghost = document.createElement('div');
  ghost.className = 'touch-ghost';
  ghost.style.left = (touch.clientX - 60) + 'px';
  ghost.style.top  = (touch.clientY - 40) + 'px';
  if (type === 'img') {
    const img = getImgCard(id)?.querySelector('img');
    ghost.innerHTML = `<img src="${img?.src || ''}" style="width:120px;height:80px;object-fit:cover;border-radius:8px;" />`;
    state.drag.imgIdx = id;
  } else {
    const item = state.data[state.labelOrder[id]];
    ghost.innerHTML = `<span style="font-size:1.1rem;font-weight:700;">${getEmoji(item.label)} ${escapeHtml(item.label)}</span>`;
    state.drag.lblPos = id;
  }
  document.body.appendChild(ghost);
  state.drag.ghost = ghost; state.drag.active = true; state.drag.type = type;
  clearAllSelections(); state.selectedImg = null; state.selectedLbl = null;
  if (type === 'img') getImgCard(id)?.classList.add('dragging');
  else getLblCard(id)?.classList.add('dragging');
  e.preventDefault();
}

function onTouchMove(e) {
  if (!state.drag.active || !state.drag.ghost) return;
  const touch = [...e.touches].find(t => t.identifier === state.drag.touchId);
  if (!touch) return;
  e.preventDefault();
  state.drag.ghost.style.left = (touch.clientX - 60) + 'px';
  state.drag.ghost.style.top  = (touch.clientY - 40) + 'px';
  state.drag.ghost.style.pointerEvents = 'none';
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const targetCard = el?.closest('.match-card');
  clearDropOver();
  if (targetCard && !targetCard.classList.contains('matched')) {
    const valid =
      (state.drag.type === 'img' && targetCard.classList.contains('card-label')) ||
      (state.drag.type === 'lbl' && targetCard.classList.contains('card-image'));
    if (valid) targetCard.classList.add('drag-over');
  }
}

function onTouchEnd(e) {
  if (!state.drag.active) return;
  const touch = [...e.changedTouches].find(t => t.identifier === state.drag.touchId);
  if (!touch) return;
  state.drag.ghost?.remove(); state.drag.ghost = null;
  clearDropOver();
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const targetCard = el?.closest('.match-card');
  if (targetCard && !targetCard.classList.contains('matched')) {
    if (state.drag.type === 'img' && targetCard.classList.contains('card-label')) {
      const lblPos = parseInt(targetCard.dataset.pos);
      state.selectedImg = state.drag.imgIdx; state.selectedLbl = lblPos;
      resetDragState(); attemptMatch(); return;
    }
    if (state.drag.type === 'lbl' && targetCard.classList.contains('card-image')) {
      const imgIdx = parseInt(targetCard.dataset.idx);
      state.selectedImg = imgIdx; state.selectedLbl = state.drag.lblPos;
      resetDragState(); attemptMatch(); return;
    }
  }
  resetDragState();
}

// ── Attempt Match ─────────────────────────────────────────────────────────────
function attemptMatch() {
  const imgIdx = state.selectedImg;
  const lblPos = state.selectedLbl;
  if (imgIdx === null || lblPos === null) return;
  const lblDataIdx = state.labelOrder[lblPos];
  const isMatch = imgIdx === lblDataIdx;

  state.tries++;
  $('tries-val').textContent = state.tries;

  const imgCard = getImgCard(imgIdx);
  const lblCard = getLblCard(lblPos);
  if (!imgCard || !lblCard) return;

  if (isMatch) {
    state.score += Math.max(10, 50 - state.tries * 2);
    $('score-val').textContent = state.score;
    imgCard.classList.remove('selected', 'dragging');
    lblCard.classList.remove('selected', 'dragging');
    imgCard.classList.add('matched', 'locked');
    lblCard.classList.add('matched', 'locked');
    imgCard.draggable = false; lblCard.draggable = false;
    state.matched.add(imgIdx);
    state.selectedImg = null; state.selectedLbl = null;
    updateProgress(); updateConnectorSVG();
    if (state.matched.size === state.data.length) setTimeout(showWin, 600);
  } else {
    state.locked = true;
    imgCard.classList.remove('selected', 'dragging');
    lblCard.classList.remove('selected', 'dragging');
    imgCard.classList.add('wrong'); lblCard.classList.add('wrong');
    setTimeout(() => {
      imgCard.classList.remove('wrong'); lblCard.classList.remove('wrong');
      state.selectedImg = null; state.selectedLbl = null;
      state.locked = false; updateConnectorSVG();
    }, 700);
  }
}

// ── Progress ─────────────────────────────────────────────────────────────────
function updateProgress() {
  const total = state.data.length;
  const done  = state.matched.size;
  $('progress-text').textContent = `จับคู่ ${done} / ${total} คู่`;
  $('progress-bar').style.width = `${(done / total) * 100}%`;
}

// ── Connector SVG ─────────────────────────────────────────────────────────────
function updateConnectorSVG() {
  const svg = $('connector-svg');
  svg.innerHTML = '';

  const imgList  = $('list-images');
  const lblList  = $('list-labels');
  const boardWrap = document.querySelector('.board-wrap');
  if (!boardWrap) return;

  const bRect = boardWrap.getBoundingClientRect();
  svg.style.height = bRect.height + 'px';
  svg.style.top    = (imgList.getBoundingClientRect().top - bRect.top) + 'px';

  const drawLine = (imgIdx, lblPos, color, dashed = false) => {
    const imgCard = getImgCard(imgIdx);
    const lblCard = getLblCard(lblPos);
    if (!imgCard || !lblCard) return;

    const iR = imgCard.getBoundingClientRect();
    const lR = lblCard.getBoundingClientRect();
    const svgR = svg.getBoundingClientRect();

    const x1 = iR.right  - svgR.left;
    const y1 = iR.top + iR.height / 2 - svgR.top;
    const x2 = lR.left   - svgR.left;
    const y2 = lR.top + lR.height / 2 - svgR.top;

    const mx = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    if (dashed) path.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(path);
  };

  // Draw matched lines
  state.matched.forEach(dataIdx => {
    const lblPos = state.labelOrder.findIndex(di => di === dataIdx);
    drawLine(dataIdx, lblPos, 'rgba(16,185,129,0.7)');
  });

  // Draw selected preview line (dashed)
  if (state.selectedImg !== null && state.selectedLbl !== null) {
    drawLine(state.selectedImg, state.selectedLbl, 'rgba(139,92,246,0.8)', true);
  } else if (state.selectedImg !== null) {
    // Faint dot on the right side of selected img card (no target yet)
  }
}

// ── Win Screen ────────────────────────────────────────────────────────────────
function showWin() {
  stopTimer();
  $('win-score').textContent = state.score;
  $('win-time').textContent  = formatTime(state.elapsedSec);
  $('win-tries').textContent = state.tries;
  $('win-emoji').textContent = state.score > 80 ? '🏆' : state.score > 40 ? '🎉' : '🥳';
  showPanel('win');
  spawnConfetti();
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function spawnConfetti() {
  const wrap = $('confetti-wrap');
  wrap.innerHTML = '';
  const colors = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#f472b6'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left    = Math.random() * 100 + '%';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width   = (Math.random() * 8 + 6) + 'px';
    el.style.height  = (Math.random() * 8 + 6) + 'px';
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    el.style.animationDuration  = (Math.random() * 2 + 1.5) + 's';
    el.style.animationDelay     = (Math.random() * 1) + 's';
    wrap.appendChild(el);
  }
}

// ── Restart / Back ────────────────────────────────────────────────────────────
function restartGame() {
  startGame(state.data);
}
function goBack() {
  stopTimer();
  showPanel('setup');
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getImgCard(idx) { return $(`img-card-${idx}`); }
function getLblCard(pos) { return $(`lbl-card-${pos}`); }

function clearAllSelections() {
  document.querySelectorAll('.match-card.selected').forEach(c => c.classList.remove('selected'));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getEmoji(label) {
  // Extract emoji from label if present, otherwise use 🏷️
  const match = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
  return match ? match[0] : '🏷️';
}

// ── Error / Loading UI ────────────────────────────────────────────────────────
function showError(msg) {
  const box = $('error-box');
  box.textContent = msg;
  box.style.display = 'block';
}
function clearError() {
  $('error-box').style.display = 'none';
  $('error-box').textContent = '';
}
function showLoading(show) {
  $('loading-setup').style.display = show ? 'flex' : 'none';
}

// ── Resize Connector on Window Resize ─────────────────────────────────────────
window.addEventListener('resize', () => {
  if ($('game-panel').style.display !== 'none') updateConnectorSVG();
});

// ── Restore saved Sheet URL on page load (and auto-load if available) ────────
window.addEventListener('DOMContentLoaded', async () => {
  // ดึง URL จาก global key ก่อน ถ้าไม่มีค่อยดึงจาก key เดิม
  const savedUrl  = localStorage.getItem('gamehub_sheet_url')
                 || localStorage.getItem('matchit_sheet_url') || '';
  const savedName = localStorage.getItem('matchit_sheet_name') || 'match';
  if (savedUrl)  $('sheet-url').value  = savedUrl;
  if (savedName) $('sheet-name').value = savedName;

  // Auto-load the game immediately if we have a saved URL
  if (savedUrl) {
    clearError();
    showLoading(true);
    try {
      // อ่าน config tab เพื่อรู้ว่าจะโหลด sheet tab ไหน
      const cfg = await fetchConfig(savedUrl);
      const sheetName = cfg.game_sheet || savedName;
      $('sheet-name').value = sheetName;

      const csvUrl = toCSVUrl(savedUrl, sheetName);
      const data   = await fetchSheetData(csvUrl);
      startGame(data);
    } catch (err) {
      showError('⚠️ โหลดชีตล่าสุดไม่สำเร็จ กรุณากด "โหลดเกม" อีกครั้ง');
    } finally {
      showLoading(false);
    }
  }
});
