'use strict';

const state = {
  cards: [], queue: [], known: new Set(),
  rounds: 0, flipped: false,
};

const DEMO = [
  { question: 'cat หมายความว่าอะไร?',        answer: '🐱 แมว' },
  { question: 'dog หมายความว่าอะไร?',        answer: '🐶 สุนัข' },
  { question: 'bird หมายความว่าอะไร?',       answer: '🐦 นก' },
  { question: 'fish หมายความว่าอะไร?',       answer: '🐠 ปลา' },
  { question: 'rabbit หมายความว่าอะไร?',     answer: '🐰 กระต่าย' },
  { question: 'ภาษาอังกฤษของ "เสือ"?',       answer: 'tiger' },
  { question: 'ภาษาอังกฤษของ "ช้าง"?',       answer: 'elephant' },
  { question: 'ภาษาอังกฤษของ "ลิง"?',        answer: 'monkey' },
];

function $(id){ return document.getElementById(id); }

// ── CSV helpers (same as match game) ────────────────────────────────────────
function toCSVUrl(raw, sheet='Sheet1'){
  raw = raw.trim(); sheet = sheet.trim();
  if(raw.includes('/export?')||raw.includes('format=csv')) return raw;
  if(raw.includes('pub?')||raw.includes('pubhtml'))
    return raw.replace('pubhtml','pub').replace('output=html','output=csv')+(raw.includes('output=')?'':'&output=csv');
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!m) throw new Error('ไม่พบ Spreadsheet ID');
  const gid = raw.match(/[#&?]gid=(\d+)/);
  let url = `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  if(gid) url += `&gid=${gid[1]}`;
  return url;
}
function parseCSV(text){
  const rows=[]; const lines=text.split(/\r?\n/);
  for(const line of lines){
    if(!line.trim()) continue;
    const cols=[]; let cur='',inQ=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
      else if(ch===','&&!inQ){ cols.push(cur.trim());cur=''; }
      else cur+=ch;
    }
    cols.push(cur.trim()); rows.push(cols);
  }
  return rows;
}
async function fetchSheetData(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}: ไม่สามารถดึงข้อมูลได้`);
  const text=await r.text(); const rows=parseCSV(text);
  if(rows.length<2) throw new Error('ชีตมีข้อมูลน้อยเกินไป');
  const headers=rows[0].map(h=>h.toLowerCase().replace(/\s+/g,'_'));
  const qi=headers.findIndex(h=>h.includes('question')||h.includes('คำถาม')||h.includes('word')||h.includes('front'));
  const ai=headers.findIndex(h=>h.includes('answer')||h.includes('คำตอบ')||h.includes('translation')||h.includes('back'));
  const ci=qi>=0?qi:0, ca=ai>=0?ai:1;
  const data=[];
  for(let i=1;i<rows.length;i++){
    const q=rows[i][ci]||'',a=rows[i][ca]||'';
    if(q&&a) data.push({question:q,answer:a});
  }
  if(data.length<1) throw new Error('ไม่พบข้อมูลที่ใช้ได้');
  return data;
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function showPanel(name){
  ['setup-panel','game-panel','win-panel'].forEach(id=>{
    $(id).style.display=id.includes(name)?'':'none';
  });
}
function showError(msg){ const b=$('error-box'); b.textContent=msg; b.style.display='block'; }
function clearError(){ const b=$('error-box'); b.textContent=''; b.style.display='none'; }
function showLoading(v){ $('loading-setup').style.display=v?'flex':'none'; }

// ── Load ─────────────────────────────────────────────────────────────────────
async function loadSheet(){
  const url=$('sheet-url').value.trim();
  if(!url){ showError('กรุณาใส่ URL'); return; }
  clearError(); showLoading(true); $('btn-load').disabled=true;
  try{
    const data=await fetchSheetData(toCSVUrl(url,$('sheet-name').value||'Sheet1'));
    startGame(data);
  }catch(e){ showError('❌ '+e.message); }
  finally{ showLoading(false); $('btn-load').disabled=false; }
}
function loadDemo(){ clearError(); startGame([...DEMO]); }

// ── Game ──────────────────────────────────────────────────────────────────────
function startGame(cards){
  state.cards=[...cards];
  state.queue=shuffle([...cards]);
  state.known=new Set();
  state.rounds=1; state.flipped=false;
  updateStats(); showCard(); showPanel('game');
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function showCard(){
  if(state.queue.length===0){ checkRoundEnd(); return; }
  const card=state.queue[0];
  $('front-content').textContent=card.question;
  $('back-content').textContent=card.answer;
  state.flipped=false;
  $('flashcard').classList.remove('flipped');
  $('answer-btns').style.opacity='0';
  $('answer-btns').style.pointerEvents='none';
  updateProgress();
}

function flipCard(){
  state.flipped=!state.flipped;
  $('flashcard').classList.toggle('flipped', state.flipped);
  if(state.flipped){
    $('answer-btns').style.opacity='1';
    $('answer-btns').style.pointerEvents='auto';
  } else {
    $('answer-btns').style.opacity='0';
    $('answer-btns').style.pointerEvents='none';
  }
}

function markCard(known){
  if(!state.flipped) return;
  const card=state.queue.shift();
  if(known){
    state.known.add(card.question);
  } else {
    // push to end of queue (will see again this round)
    state.queue.push(card);
  }
  updateStats();
  showCard();
}

function checkRoundEnd(){
  // Queue empty — check if all known
  const total=state.cards.length;
  if(state.known.size===total){
    showWin(); return;
  }
  // Start next round with unknowns
  state.rounds++;
  state.queue=shuffle(state.cards.filter(c=>!state.known.has(c.question)));
  showCard();
}

function updateProgress(){
  const total=state.cards.length;
  const current=total-state.queue.length+1;
  const queueLen=state.queue.length;
  $('progress-text').textContent=`เหลือ ${queueLen} / ${total} การ์ด (รอบที่ ${state.rounds})`;
  const pct=((total-queueLen)/total)*100;
  $('progress-bar').style.width=pct+'%';
}

function updateStats(){
  $('known-val').textContent=state.known.size;
  $('unknown-val').textContent=state.cards.length-state.known.size;
  $('remain-val').textContent=state.queue.length;
}

function showWin(){
  $('win-known').textContent=state.known.size;
  $('win-rounds').textContent=state.rounds;
  $('win-total').textContent=state.cards.length;
  showPanel('win'); spawnConfetti();
}

function spawnConfetti(){
  const wrap=$('confetti-wrap'); wrap.innerHTML='';
  const cols=['#8b5cf6','#06b6d4','#f59e0b','#10b981','#ef4444','#f472b6'];
  for(let i=0;i<60;i++){
    const el=document.createElement('div'); el.className='confetti-piece';
    el.style.left=Math.random()*100+'%';
    el.style.background=cols[Math.floor(Math.random()*cols.length)];
    el.style.width=(Math.random()*8+6)+'px'; el.style.height=(Math.random()*8+6)+'px';
    el.style.borderRadius=Math.random()>0.5?'50%':'0';
    el.style.animationDuration=(Math.random()*2+1.5)+'s';
    el.style.animationDelay=(Math.random()*1)+'s';
    wrap.appendChild(el);
  }
}

function restartGame(){ startGame([...state.cards]); }
function goBack(){ showPanel('setup'); }

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e=>{
  if($('game-panel').style.display==='none') return;
  if(e.key===' '||e.key==='Enter'){ e.preventDefault(); flipCard(); }
  if(e.key==='ArrowRight'){ e.preventDefault(); markCard(true); }
  if(e.key==='ArrowLeft'){ e.preventDefault(); markCard(false); }
});
