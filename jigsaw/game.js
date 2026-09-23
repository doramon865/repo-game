'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  gridSize: 3,           // 3 = 3x3 (9 pieces), 4 = 4x4 (16), 5 = 5x5 (25)
  images: [],            // List of { imageUrl, label }
  selectedImage: null,   // Current { imageUrl, label }
  pieces: [],            // Array of piece objects
  boardSlots: [],        // Array of length N (pieceId or null)
  selectedPieceId: null, // For click-to-pick / click-to-place
  moves: 0,
  timerInterval: null,
  seconds: 0,
  isGameActive: false,
  audioCtx: null,
};

// ── Fallback / Demo Images ───────────────────────────────────────────────────
const DEMO_IMAGES = [
  {
    imageUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&auto=format&fit=crop&q=80',
    label: '🐶 เจ้าตูบสุดน่ารัก',
    emoji: '🐶',
    bgColor: '#d97706'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&auto=format&fit=crop&q=80',
    label: '🐱 แมวเหมียวขี้อ้อน',
    emoji: '🐱',
    bgColor: '#0284c7'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=800&auto=format&fit=crop&q=80',
    label: '🐘 ช้างไทยในป่าใหญ่',
    emoji: '🐘',
    bgColor: '#059669'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800&auto=format&fit=crop&q=80',
    label: '🦁 ราชาสิงโต',
    emoji: '🦁',
    bgColor: '#e11d48'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    label: '🚀 ท่องอวกาศและดวงดาว',
    emoji: '🚀',
    bgColor: '#4f46e5'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80',
    label: '🏔️ ยอดเขาธรรมชาติ',
    emoji: '🏔️',
    bgColor: '#0d9488'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    label: '🏰 ปราสาทเทพนิยาย',
    emoji: '🏰',
    bgColor: '#7c3aed'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    label: '🌊 ทะเลมัลดีฟส์สีคราม',
    emoji: '🌊',
    bgColor: '#0891b2'
  }
];

function $(id) { return document.getElementById(id); }

// ── SVG Fallback Generator ───────────────────────────────────────────────────
function createSVGFallback(label, emoji = '🧩', color = '#059669') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="1"/>
      </radialGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="600" height="450" fill="url(#g)"/>
    <rect width="600" height="450" fill="url(#grid)"/>
    <circle cx="300" cy="200" r="110" fill="rgba(255,255,255,0.08)"/>
    <text x="300" y="235" font-size="110" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <rect x="50" y="340" width="500" height="60" rx="16" fill="rgba(0,0,0,0.4)"/>
    <text x="300" y="378" font-size="28" font-family="sans-serif" font-weight="bold" fill="#f8fafc" text-anchor="middle">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ── Web Audio Sound Effects ──────────────────────────────────────────────────
function getAudioContext() {
  if (!state.audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) state.audioCtx = new AudioContext();
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
  return state.audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'pick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(540, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.09);
    } else if (type === 'place') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.12);
    } else if (type === 'snap') {
      // Pleasant high chime when piece hits correct slot
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.18, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.22);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.22);
      });
    } else if (type === 'shuffle') {
      [220, 290, 360, 440].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.1, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + idx * 0.04); osc.stop(now + idx * 0.04 + 0.08);
      });
    } else if (type === 'win') {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.25, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + idx * 0.1); osc.stop(now + idx * 0.1 + 0.4);
      });
    }
  } catch (e) {
    // Ignore audio error
  }
}

// ── CSV Helpers ──────────────────────────────────────────────────────────────
function toCSVUrl(raw, sheet = 'Sheet1') {
  raw = raw.trim(); sheet = sheet.trim();
  if (raw.includes('/export?') || raw.includes('format=csv')) return raw;
  if (raw.includes('pub?') || raw.includes('pubhtml')) {
    return raw.replace('pubhtml', 'pub').replace('output=html', 'output=csv') + (raw.includes('output=') ? '' : '&output=csv');
  }
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('ไม่พบ Spreadsheet ID ใน URL');
  const gid = raw.match(/[#&?]gid=(\d+)/);
  let url = `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  if (gid) url += `&gid=${gid[1]}`;
  return url;
}

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

async function fetchSheetData(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ไม่สามารถดึงข้อมูลได้`);
  const text = await r.text();
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('ชีตมีข้อมูลน้อยเกินไป (ต้องการแถว Header และข้อมูล)');

  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
  let imgIdx = headers.findIndex(h => h.includes('image') || h.includes('รูป') || h.includes('url') || h.includes('img') || h.includes('pic'));
  let labelIdx = headers.findIndex(h => h.includes('label') || h.includes('ชื่อ') || h.includes('name') || h.includes('text') || h.includes('คำ') || h.includes('title'));

  if (imgIdx < 0) imgIdx = 0;
  if (labelIdx < 0) labelIdx = 1;

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const img = row[imgIdx] || '';
    const label = row[labelIdx] || `ภาพที่ ${i}`;
    if (img) data.push({ imageUrl: img, label });
  }

  if (data.length < 1) throw new Error('ไม่พบข้อมูลรูปภาพที่ใช้ได้ในชีต');
  return data;
}

// ── Read config tab from the same spreadsheet ─────────────────────────────
async function fetchConfig(rawUrl) {
  try {
    const r = await fetch(toCSVUrl(rawUrl, 'config'));
    if (!r.ok) return {};
    const rows = parseCSV(await r.text());
    const cfg = {};
    const s = (rows[0] && rows[0][0] && rows[0][0].toLowerCase() === 'key') ? 1 : 0;
    for (let i = s; i < rows.length; i++) {
      const k = (rows[i][0] || '').trim().toLowerCase();
      const v = (rows[i][1] || '').trim();
      if (k) cfg[k] = v;
    }
    return cfg;
  } catch (_) { return {}; }
}

// ── UI Navigation ────────────────────────────────────────────────────────────
function showPanel(name) {
  ['setup-panel', 'select-panel', 'game-panel', 'win-panel'].forEach(id => {
    $(id).style.display = id.includes(name) ? '' : 'none';
  });
}

function showError(msg) {
  const b = $('error-box');
  b.textContent = msg;
  b.style.display = 'block';
}

function clearError() {
  const b = $('error-box');
  b.textContent = '';
  b.style.display = 'none';
}

function showLoading(show) {
  $('loading-setup').style.display = show ? 'flex' : 'none';
}

// ── Difficulty Selection ─────────────────────────────────────────────────────
function setDiff(size) {
  state.gridSize = parseInt(size, 10);
  [3, 4, 5].forEach(s => {
    const btn = $(`diff-${s}`);
    if (btn) {
      if (s === state.gridSize) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
}

// ── Load Actions ─────────────────────────────────────────────────────────────
async function loadSheet() {
  const url = $('sheet-url').value.trim();
  if (!url) { showError('กรุณาใส่ Google Sheet URL'); return; }
  clearError();
  showLoading(true);
  $('btn-load').disabled = true;

  try {
    const cfg = await fetchConfig(url);
    const sheetName = cfg.game_sheet || $('sheet-name').value.trim() || 'Sheet1';
    const data = await fetchSheetData(toCSVUrl(url, sheetName));
    state.images = data;
    renderSelectGrid();
    showPanel('select');
  } catch (err) {
    showError('❌ ' + err.message);
  } finally {
    showLoading(false);
    $('btn-load').disabled = false;
  }
}

function loadDemo() {
  clearError();
  state.images = [...DEMO_IMAGES];
  renderSelectGrid();
  showPanel('select');
}

function goBack() {
  stopTimer();
  showPanel('setup');
}

function goToSelect() {
  stopTimer();
  renderSelectGrid();
  showPanel('select');
}

// ── Select Panel ─────────────────────────────────────────────────────────────
function renderSelectGrid() {
  const container = $('image-grid');
  container.innerHTML = '';

  state.images.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'image-card';

    // Verify image loading error and swap with SVG fallback
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'image-card-thumb-wrap';

    const img = document.createElement('img');
    img.className = 'image-card-thumb';
    img.src = item.imageUrl;
    img.alt = item.label;
    img.loading = 'lazy';
    img.onerror = () => {
      img.src = createSVGFallback(item.label, item.emoji || '🖼️', item.bgColor || '#059669');
      item.imageUrl = img.src; // update memory so game uses valid image
    };

    const badge = document.createElement('div');
    badge.className = 'image-card-badge';
    badge.textContent = `${state.gridSize}×${state.gridSize}`;

    thumbWrap.appendChild(img);
    thumbWrap.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'image-card-body';
    body.innerHTML = `
      <div class="image-card-name">${escapeHTML(item.label)}</div>
      <div class="image-card-play-btn">▶️ เล่น</div>
    `;

    card.appendChild(thumbWrap);
    card.appendChild(body);

    card.onclick = () => {
      startPuzzleWithImage(item);
    };

    container.appendChild(card);
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

// ── Game Initialization ──────────────────────────────────────────────────────
function startPuzzleWithImage(imageObj) {
  state.selectedImage = imageObj;
  state.selectedPieceId = null;
  state.moves = 0;
  state.seconds = 0;
  state.isGameActive = true;

  $('game-img-label').textContent = imageObj.label;
  $('moves-val').textContent = '0';
  $('timer-val').textContent = '0:00';

  startTimer();
  buildPuzzle();
  showPanel('game');
  playSound('shuffle');
}

function replayGame() {
  if (!state.selectedImage) return;
  startPuzzleWithImage(state.selectedImage);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  stopTimer();
  state.seconds = 0;
  state.timerInterval = setInterval(() => {
    state.seconds++;
    const m = Math.floor(state.seconds / 60);
    const s = state.seconds % 60;
    $('timer-val').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// ── Build Puzzle & Pieces ────────────────────────────────────────────────────
function buildPuzzle() {
  const N = state.gridSize;
  const total = N * N;

  // Board setup
  const board = $('puzzle-board');
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${N}, 1fr)`;

  state.boardSlots = new Array(total).fill(null);
  state.pieces = [];

  // Create board slots
  for (let i = 0; i < total; i++) {
    const slot = document.createElement('div');
    slot.className = 'board-slot';
    slot.dataset.slotIndex = i;
    slot.innerHTML = `<span class="board-slot-hint">${i + 1}</span>`;

    // Drop handlers
    slot.ondragover = handleSlotDragOver;
    slot.ondragleave = handleSlotDragLeave;
    slot.ondrop = handleSlotDrop;

    // Click handler for Click-to-Place
    slot.onclick = () => handleSlotClick(i);

    board.appendChild(slot);
  }

  // Create pieces
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / N);
    const col = i % N;
    state.pieces.push({
      id: i,
      row,
      col,
      originalIndex: i,
      currentLocation: 'tray',
      boardSlot: null,
    });
  }

  // Shuffle pieces in tray
  shuffleTray();
  updateProgress();
}

function shufflePieces() {
  // Return all pieces to tray and shuffle
  state.pieces.forEach(p => {
    p.currentLocation = 'tray';
    p.boardSlot = null;
  });
  state.boardSlots.fill(null);
  state.selectedPieceId = null;
  state.moves = 0;
  $('moves-val').textContent = '0';

  renderBoardSlots();
  shuffleTray();
  updateProgress();
  playSound('shuffle');
}

function shuffleTray() {
  const tray = $('pieces-container');
  tray.innerHTML = '';

  // Filter pieces currently in tray
  const trayPieces = state.pieces.filter(p => p.currentLocation === 'tray');

  // Fisher-Yates shuffle
  for (let i = trayPieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trayPieces[i], trayPieces[j]] = [trayPieces[j], trayPieces[i]];
  }

  const N = state.gridSize;
  const pieceSize = N === 3 ? 84 : (N === 4 ? 68 : 56);

  trayPieces.forEach(p => {
    const el = createPieceElement(p, pieceSize);
    tray.appendChild(el);
  });

  // Tray drop handler (allow dragging piece from board back to tray)
  $('pieces-tray').ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  $('pieces-tray').ondrop = (e) => {
    e.preventDefault();
    const pieceId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(pieceId)) {
      returnPieceToTray(pieceId);
    }
  };
  $('pieces-tray').onclick = (e) => {
    // If clicking empty area of tray while a piece on board is selected, return it to tray
    if (e.target === $('pieces-tray') || e.target === $('pieces-container')) {
      if (state.selectedPieceId !== null) {
        const p = state.pieces[state.selectedPieceId];
        if (p && p.currentLocation === 'board') {
          returnPieceToTray(p.id);
        }
      }
    }
  };
}

// ── Piece Element Construction ───────────────────────────────────────────────
function createPieceElement(p, sizePx) {
  const N = state.gridSize;
  const el = document.createElement('div');
  el.className = 'puzzle-piece tray-piece';
  el.dataset.pieceId = p.id;
  el.draggable = true;

  if (sizePx) {
    el.style.width = `${sizePx}px`;
    el.style.height = `${Math.round(sizePx * 0.75)}px`; // 4:3 aspect
  }

  // CSS slice mapping with background-size and background-position
  el.style.backgroundImage = `url("${state.selectedImage.imageUrl}")`;
  el.style.backgroundSize = `${N * 100}% ${N * 100}%`;
  const bgX = N > 1 ? (p.col / (N - 1)) * 100 : 0;
  const bgY = N > 1 ? (p.row / (N - 1)) * 100 : 0;
  el.style.backgroundPosition = `${bgX}% ${bgY}%`;

  if (state.selectedPieceId === p.id) {
    el.classList.add('selected');
  }

  // Drag Events
  el.ondragstart = (e) => {
    getAudioContext();
    playSound('pick');
    e.dataTransfer.setData('text/plain', String(p.id));
    e.dataTransfer.effectAllowed = 'move';
    el.style.opacity = '0.5';
  };
  el.ondragend = () => {
    el.style.opacity = '1';
  };

  // Touch Events for Mobile Drag
  setupTouchDrag(el, p.id);

  // Click handler for selection
  el.onclick = (e) => {
    e.stopPropagation();
    handlePieceClick(p.id);
  };

  return el;
}

// ── Touch Drag Support ───────────────────────────────────────────────────────
function setupTouchDrag(el, pieceId) {
  let touchStartX = 0, touchStartY = 0;
  let isDragging = false;
  let ghost = null;

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    isDragging = false;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    if (!isDragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      isDragging = true;
      playSound('pick');
      ghost = el.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.zIndex = '9999';
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '0.85';
      ghost.style.transform = 'scale(1.1)';
      document.body.appendChild(ghost);
    }

    if (isDragging && ghost) {
      e.preventDefault();
      ghost.style.left = `${t.clientX - 35}px`;
      ghost.style.top = `${t.clientY - 26}px`;
    }
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
    if (isDragging) {
      const t = e.changedTouches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (target) {
        const slotEl = target.closest('.board-slot');
        if (slotEl) {
          const slotIdx = parseInt(slotEl.dataset.slotIndex, 10);
          placePieceInSlot(pieceId, slotIdx);
          return;
        }
        const trayEl = target.closest('#pieces-tray');
        if (trayEl) {
          returnPieceToTray(pieceId);
          return;
        }
      }
    }
  });
}

// ── Click Interactions (Pick & Place) ────────────────────────────────────────
function handlePieceClick(pieceId) {
  getAudioContext();
  if (state.selectedPieceId === pieceId) {
    // Deselect
    state.selectedPieceId = null;
    updateSelectionUI();
  } else if (state.selectedPieceId !== null) {
    const selectedPiece = state.pieces[state.selectedPieceId];
    const clickedPiece = state.pieces[pieceId];

    // If both are on board, swap them!
    if (selectedPiece.currentLocation === 'board' && clickedPiece.currentLocation === 'board') {
      swapBoardPieces(selectedPiece.boardSlot, clickedPiece.boardSlot);
      state.selectedPieceId = null;
      updateSelectionUI();
      return;
    }

    // Switch selection to new piece
    state.selectedPieceId = pieceId;
    playSound('pick');
    updateSelectionUI();
  } else {
    // Select piece
    state.selectedPieceId = pieceId;
    playSound('pick');
    updateSelectionUI();
  }
}

function handleSlotClick(slotIdx) {
  if (state.selectedPieceId === null) {
    // If slot has a piece, select it!
    const pieceIdInSlot = state.boardSlots[slotIdx];
    if (pieceIdInSlot !== null) {
      state.selectedPieceId = pieceIdInSlot;
      playSound('pick');
      updateSelectionUI();
    }
    return;
  }

  // Place selected piece in this slot
  placePieceInSlot(state.selectedPieceId, slotIdx);
  state.selectedPieceId = null;
  updateSelectionUI();
}

function updateSelectionUI() {
  document.querySelectorAll('.puzzle-piece').forEach(el => {
    const pid = parseInt(el.dataset.pieceId, 10);
    if (pid === state.selectedPieceId) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });
}

// ── Drag & Drop Handlers ─────────────────────────────────────────────────────
function handleSlotDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleSlotDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleSlotDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const pieceId = parseInt(e.dataTransfer.getData('text/plain'), 10);
  const slotIdx = parseInt(e.currentTarget.dataset.slotIndex, 10);
  if (!isNaN(pieceId) && !isNaN(slotIdx)) {
    placePieceInSlot(pieceId, slotIdx);
  }
}

// ── Piece Placement & Swapping ───────────────────────────────────────────────
function placePieceInSlot(pieceId, targetSlot) {
  const piece = state.pieces[pieceId];
  if (!piece) return;

  const existingPieceId = state.boardSlots[targetSlot];
  const oldSlot = piece.boardSlot;

  if (existingPieceId !== null) {
    // Target slot already occupied!
    if (piece.currentLocation === 'board' && oldSlot !== null) {
      // Swap positions!
      state.boardSlots[oldSlot] = existingPieceId;
      state.pieces[existingPieceId].boardSlot = oldSlot;
    } else {
      // Piece coming from tray: send the existing piece back to tray
      returnPieceToTray(existingPieceId, false);
    }
  } else {
    // Empty slot: if piece was on board, clear its old slot
    if (piece.currentLocation === 'board' && oldSlot !== null) {
      state.boardSlots[oldSlot] = null;
    }
  }

  // Place in target slot
  state.boardSlots[targetSlot] = pieceId;
  piece.currentLocation = 'board';
  piece.boardSlot = targetSlot;

  // Re-render
  renderBoardSlots();
  renderTray();

  state.moves++;
  $('moves-val').textContent = String(state.moves);

  // Sound feedback
  if (piece.originalIndex === targetSlot) {
    playSound('snap');
  } else {
    playSound('place');
  }

  updateProgress();
}

function swapBoardPieces(slotA, slotB) {
  const pieceA = state.boardSlots[slotA];
  const pieceB = state.boardSlots[slotB];

  state.boardSlots[slotA] = pieceB;
  state.boardSlots[slotB] = pieceA;

  if (pieceA !== null) state.pieces[pieceA].boardSlot = slotB;
  if (pieceB !== null) state.pieces[pieceB].boardSlot = slotA;

  state.moves++;
  $('moves-val').textContent = String(state.moves);

  renderBoardSlots();
  playSound('place');
  updateProgress();
}

function returnPieceToTray(pieceId, shouldUpdate = true) {
  const piece = state.pieces[pieceId];
  if (!piece || piece.currentLocation === 'tray') return;

  if (piece.boardSlot !== null) {
    state.boardSlots[piece.boardSlot] = null;
  }
  piece.currentLocation = 'tray';
  piece.boardSlot = null;

  if (shouldUpdate) {
    renderBoardSlots();
    renderTray();
    playSound('place');
    updateProgress();
  }
}

// ── Rendering Board & Tray ───────────────────────────────────────────────────
function renderBoardSlots() {
  const board = $('puzzle-board');
  const slots = board.querySelectorAll('.board-slot');
  const N = state.gridSize;

  slots.forEach((slotEl, idx) => {
    const pieceId = state.boardSlots[idx];
    slotEl.innerHTML = '';

    if (pieceId === null) {
      slotEl.className = 'board-slot';
      slotEl.innerHTML = `<span class="board-slot-hint">${idx + 1}</span>`;
    } else {
      const p = state.pieces[pieceId];
      const isCorrect = p.originalIndex === idx;

      slotEl.className = `board-slot slot-has-piece ${isCorrect ? 'slot-correct' : ''}`;

      const pieceEl = document.createElement('div');
      pieceEl.className = `puzzle-piece board-piece ${isCorrect ? 'is-correct' : ''}`;
      pieceEl.dataset.pieceId = p.id;
      pieceEl.draggable = true;

      pieceEl.style.backgroundImage = `url("${state.selectedImage.imageUrl}")`;
      pieceEl.style.backgroundSize = `${N * 100}% ${N * 100}%`;
      const bgX = N > 1 ? (p.col / (N - 1)) * 100 : 0;
      const bgY = N > 1 ? (p.row / (N - 1)) * 100 : 0;
      pieceEl.style.backgroundPosition = `${bgX}% ${bgY}%`;

      if (state.selectedPieceId === p.id) {
        pieceEl.classList.add('selected');
      }

      // Drag
      pieceEl.ondragstart = (e) => {
        getAudioContext();
        playSound('pick');
        e.dataTransfer.setData('text/plain', String(p.id));
        e.dataTransfer.effectAllowed = 'move';
        pieceEl.style.opacity = '0.5';
      };
      pieceEl.ondragend = () => {
        pieceEl.style.opacity = '1';
      };

      setupTouchDrag(pieceEl, p.id);

      pieceEl.onclick = (e) => {
        e.stopPropagation();
        handlePieceClick(p.id);
      };

      slotEl.appendChild(pieceEl);
    }
  });
}

function renderTray() {
  const tray = $('pieces-container');
  tray.innerHTML = '';

  const trayPieces = state.pieces.filter(p => p.currentLocation === 'tray');
  const N = state.gridSize;
  const pieceSize = N === 3 ? 84 : (N === 4 ? 68 : 56);

  trayPieces.forEach(p => {
    const el = createPieceElement(p, pieceSize);
    tray.appendChild(el);
  });
}

// ── Progress & Win Check ─────────────────────────────────────────────────────
function updateProgress() {
  const total = state.pieces.length;
  let correctCount = 0;

  for (let i = 0; i < total; i++) {
    const pid = state.boardSlots[i];
    if (pid !== null && state.pieces[pid].originalIndex === i) {
      correctCount++;
    }
  }

  $('done-val').textContent = `${correctCount}/${total}`;

  // Check Win condition
  if (correctCount === total && total > 0 && state.isGameActive) {
    handleWin();
  }
}

function handleWin() {
  state.isGameActive = false;
  stopTimer();
  playSound('win');

  const m = Math.floor(state.seconds / 60);
  const s = state.seconds % 60;
  const timeFormatted = `${m}:${s < 10 ? '0' : ''}${s}`;

  $('win-time').textContent = timeFormatted;
  $('win-moves').textContent = String(state.moves);
  $('win-grid').textContent = `${state.gridSize}×${state.gridSize}`;
  $('win-img').src = state.selectedImage.imageUrl;
  $('win-label').textContent = state.selectedImage.label;

  triggerConfetti();
  showPanel('win');
}

// ── Confetti Animation ───────────────────────────────────────────────────────
function triggerConfetti() {
  const wrap = $('confetti-wrap');
  wrap.innerHTML = '';
  const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6'];

  for (let i = 0; i < 45; i++) {
    const c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.left = `${Math.random() * 100}%`;
    c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = `${Math.random() * 1.5}s`;
    c.style.animationDuration = `${2 + Math.random() * 2}s`;
    wrap.appendChild(c);
  }
}

// ── Preview Modal ────────────────────────────────────────────────────────────
function showPreview() {
  if (!state.selectedImage) return;
  $('preview-img').src = state.selectedImage.imageUrl;
  $('preview-label').textContent = state.selectedImage.label;
  $('preview-modal').style.display = 'flex';
}

function hidePreview() {
  $('preview-modal').style.display = 'none';
}

// ── Auto init ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setDiff(3);

  // Auto-load from global Sheet URL
  const savedUrl = localStorage.getItem('gamehub_sheet_url') || '';
  if (savedUrl) {
    $('sheet-url').value = savedUrl;
    showLoading(true);
    try {
      const cfg = await fetchConfig(savedUrl);
      const sheet = cfg.game_sheet || $('sheet-name').value || 'jigsaw';
      const data = await fetchSheetData(toCSVUrl(savedUrl, sheet));
      state.images = data;
      renderSelectGrid();
      showPanel('select');
    } catch(e) {
      showError('⚠️ โหลดชีตล่าสุดไม่สำเร็จ กรุณากด "โหลดเกม" อีกครั้ง');
    } finally {
      showLoading(false);
    }
  }
});
