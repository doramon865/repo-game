'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  words: [],        // [{ word, translation }]
  lives: 3,
  score: 0,
  level: 1,
  combo: 0,
  correct: 0,
  wordsThisLevel: 0,
  wordsPerLevel: 8,
  baseSpeed: 8,     // seconds to fall at level 1
  paused: false,
  running: false,
  mode: 'choices',  // 'choices' | 'type'
  activeWords: [],  // currently falling word elements
  spawnTimer: null,
  spawnInterval: 3000,
  currentWord: null, // the word awaiting answer in choices mode
};

const DEMO_WORDS = [
  {word:'cat',translation:'แมว'},{word:'dog',translation:'สุนัข'},
  {word:'bird',translation:'นก'},{word:'fish',translation:'ปลา'},
  {word:'rabbit',translation:'กระต่าย'},{word:'tiger',translation:'เสือ'},
  {word:'elephant',translation:'ช้าง'},{word:'monkey',translation:'ลิง'},
  {word:'horse',translation:'ม้า'},{word:'snake',translation:'งู'},
  {word:'lion',translation:'สิงโต'},{word:'bear',translation:'หมี'},
];

function $(id){ return document.getElementById(id); }

// ── CSV helpers ───────────────────────────────────────────────────────────────
function toCSVUrl(raw, sheet='Sheet1'){
  raw=raw.trim(); sheet=sheet.trim();
  if(raw.includes('/export?')||raw.includes('format=csv')) return raw;
  if(raw.includes('pub?')||raw.includes('pubhtml'))
    return raw.replace('pubhtml','pub').replace('output=html','output=csv')+(raw.includes('output=')?'':'&output=csv');
  const m=raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!m) throw new Error('ไม่พบ Spreadsheet ID');
  const gid=raw.match(/[#&?]gid=(\d+)/);
  let url=`https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  if(gid) url+=`&gid=${gid[1]}`;
  return url;
}
function parseCSV(text){
  const rows=[]; const lines=text.split(/\r?\n/);
  for(const line of lines){
    if(!line.trim()) continue;
    const cols=[]; let cur='',inQ=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
      else if(ch===','&&!inQ){cols.push(cur.trim());cur='';}
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
  const wi=headers.findIndex(h=>h.includes('word')||h.includes('คำ')||h.includes('question')||h.includes('front'));
  const ti=headers.findIndex(h=>h.includes('translation')||h.includes('คำแปล')||h.includes('answer')||h.includes('back'));
  const cw=wi>=0?wi:0, ct=ti>=0?ti:1;
  const data=[];
  for(let i=1;i<rows.length;i++){
    const w=rows[i][cw]||'',t=rows[i][ct]||'';
    if(w&&t) data.push({word:w,translation:t});
  }
  if(data.length<2) throw new Error('ต้องมีข้อมูลอย่างน้อย 2 แถว');
  return data;
}

// ── UI Helpers ─────────────────────────────────────────────────────────────────
function showPanel(name){
  ['setup-panel','game-panel','gameover-panel'].forEach(id=>{
    const el=$(id); if(!el) return;
    el.style.display=id.includes(name)?'':'none';
  });
}
function showError(msg){const b=$('error-box');b.textContent=msg;b.style.display='block';}
function clearError(){const b=$('error-box');b.textContent='';b.style.display='none';}
function showLoading(v){$('loading-setup').style.display=v?'flex':'none';}
function updateHUD(){
  $('score-val').textContent=state.score;
  $('lives-val').textContent=state.lives;
  $('level-val').textContent=state.level;
  // Lives hearts
  $('lives-display').textContent='❤️'.repeat(Math.max(0,state.lives))+'🖤'.repeat(Math.max(0,3-state.lives));
  // Combo
  if(state.combo>=2){
    $('combo-display').style.display='block';
    $('combo-val').textContent=state.combo;
  } else {
    $('combo-display').style.display='none';
  }
  // Level bar
  const pct=Math.min((state.wordsThisLevel/state.wordsPerLevel)*100,100);
  $('level-bar').style.width=pct+'%';
  $('level-progress-label').textContent=`คำที่ ${state.wordsThisLevel}/${state.wordsPerLevel} → Level ถัดไป`;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadSheet(){
  const url=$('sheet-url').value.trim();
  if(!url){showError('กรุณาใส่ URL');return;}
  clearError();showLoading(true);$('btn-load').disabled=true;
  try{
    const data=await fetchSheetData(toCSVUrl(url,$('sheet-name').value||'Sheet1'));
    state.mode=$('mode-select').value;
    startGame(data);
  }catch(e){showError('❌ '+e.message);}
  finally{showLoading(false);$('btn-load').disabled=false;}
}
function loadDemo(){
  clearError();
  state.mode=$('mode-select').value;
  startGame([...DEMO_WORDS]);
}

// ── Game ──────────────────────────────────────────────────────────────────────
function startGame(words){
  stopSpawning();
  state.words=shuffle([...words]);
  state.lives=3; state.score=0; state.level=1; state.combo=0;
  state.correct=0; state.wordsThisLevel=0; state.paused=false; state.running=true;
  state.currentWord=null; state.activeWords=[];
  $('falling-wrap').innerHTML='';

  // Show correct answer zone
  if(state.mode==='choices'){
    $('choices-wrap').style.display='block';
    $('type-wrap').style.display='none';
    $('choices-grid').innerHTML='';
  } else {
    $('choices-wrap').style.display='none';
    $('type-wrap').style.display='flex';
    $('type-input').value='';
    $('type-input').focus();
  }
  $('pause-overlay').style.display='none';
  updateHUD();
  showPanel('game');
  startSpawning();
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

// ── Spawning ──────────────────────────────────────────────────────────────────
function startSpawning(){
  spawnWord();
  const interval=Math.max(800, state.spawnInterval - (state.level-1)*200);
  state.spawnTimer=setTimeout(()=>{ if(state.running&&!state.paused) startSpawning(); }, interval);
}

function stopSpawning(){
  if(state.spawnTimer){ clearTimeout(state.spawnTimer); state.spawnTimer=null; }
}

function spawnWord(){
  if(!state.running||state.paused) return;
  if(state.words.length===0) state.words=shuffle([...state.words]);
  // pick a random word not currently falling
  const falling=new Set(state.activeWords.map(el=>el.dataset.word));
  const pool=state.words.filter(w=>!falling.has(w.word));
  if(pool.length===0) return;
  const item=pool[Math.floor(Math.random()*pool.length)];

  const arena=$('rain-arena');
  const arenaW=arena.offsetWidth||600;
  const el=document.createElement('div');
  el.className='falling-word';
  el.dataset.word=item.word;
  el.dataset.translation=item.translation;

  const bubble=document.createElement('div');
  bubble.className='word-bubble';
  bubble.textContent=item.word;
  el.appendChild(bubble);

  // Random X position (avoid edges)
  const maxX=arenaW-160;
  el.style.left=Math.max(10,Math.floor(Math.random()*maxX))+'px';

  // Fall duration based on level
  const dur=Math.max(2.5, state.baseSpeed-(state.level-1)*0.5);
  el.style.animationDuration=dur+'s';
  el.style.animationTimingFunction='linear';

  el.addEventListener('animationend',()=>onWordMissed(el));

  $('falling-wrap').appendChild(el);
  state.activeWords.push(el);

  // In choices mode: clicking a word selects it
  if(state.mode==='choices'){
    el.style.cursor='pointer';
    el.addEventListener('click',()=>selectWord(el));
  }
}

function onWordMissed(el){
  if(!el.isConnected) return;
  if(el.classList.contains('correct')||el.classList.contains('wrong')) return;
  el.remove();
  removeActiveWord(el);
  if(state.mode==='choices' && state.currentWord===el){
    state.currentWord=null;
    $('choices-grid').innerHTML='';
  }
  loseLife();
}

function removeActiveWord(el){
  const idx=state.activeWords.indexOf(el);
  if(idx>=0) state.activeWords.splice(idx,1);
}

// ── Choices Mode ──────────────────────────────────────────────────────────────
function selectWord(el){
  if(!state.running||state.paused) return;
  if(state.currentWord&&state.currentWord!==el) return; // already answering
  state.currentWord=el;
  // Generate 4 choices: 1 correct + 3 random wrong
  const correct=el.dataset.translation;
  const others=state.words.filter(w=>w.translation!==correct).map(w=>w.translation);
  const wrongs=shuffle(others).slice(0,3);
  const choices=shuffle([correct,...wrongs]);
  const grid=$('choices-grid');
  grid.innerHTML='';
  choices.forEach(ch=>{
    const btn=document.createElement('button');
    btn.className='choice-btn';
    btn.textContent=ch;
    btn.addEventListener('click',()=>onChoiceClick(btn,ch,correct,el));
    grid.appendChild(btn);
  });
}

function onChoiceClick(btn,chosen,correct,wordEl){
  if(!state.running||state.paused) return;
  const allBtns=$('choices-grid').querySelectorAll('.choice-btn');
  allBtns.forEach(b=>b.disabled=true);
  if(chosen===correct){
    btn.classList.add('correct');
    wordEl.classList.add('correct');
    onCorrect(wordEl);
  } else {
    btn.classList.add('wrong');
    wordEl.classList.add('wrong');
    // highlight correct
    allBtns.forEach(b=>{ if(b.textContent===correct) b.classList.add('correct'); });
    onWrong(wordEl);
  }
  setTimeout(()=>{
    $('choices-grid').innerHTML='';
    state.currentWord=null;
  }, 600);
}

// ── Type Mode ─────────────────────────────────────────────────────────────────
function submitType(){
  if(!state.running||state.paused) return;
  const input=$('type-input');
  const typed=input.value.trim().toLowerCase();
  if(!typed) return;
  // Find matching falling word
  const matched=state.activeWords.find(el=>{
    const t=el.dataset.translation.trim().toLowerCase();
    // strip emoji prefix for comparison
    const clean=t.replace(/^\p{Emoji}+\s*/u,'');
    return clean===typed || t===typed;
  });
  if(matched){
    matched.classList.add('correct');
    onCorrect(matched);
  } else {
    // Wrong — flash input red
    input.style.borderColor='rgba(239,68,68,0.8)';
    input.style.boxShadow='0 0 0 3px rgba(239,68,68,0.2)';
    setTimeout(()=>{input.style.borderColor='';input.style.boxShadow='';},500);
    onWrong(null);
  }
  input.value='';
}

document.addEventListener('keydown',e=>{
  if($('game-panel').style.display==='none') return;
  if(state.mode==='type' && e.key==='Enter') submitType();
});

// ── Correct / Wrong ───────────────────────────────────────────────────────────
function onCorrect(el){
  state.combo++;
  const bonus=state.combo>=3?2:state.combo>=2?1.5:1;
  state.score+=Math.round(10*state.level*bonus);
  state.correct++;
  state.wordsThisLevel++;
  removeActiveWord(el);
  setTimeout(()=>{ el.isConnected&&el.remove(); }, 400);
  if(state.wordsThisLevel>=state.wordsPerLevel) levelUp();
  updateHUD();
}

function onWrong(el){
  state.combo=0;
  if(el){
    removeActiveWord(el);
    setTimeout(()=>{ el.isConnected&&el.remove(); }, 400);
  }
  loseLife();
}

function loseLife(){
  state.lives--;
  updateHUD();
  // Flash arena border red
  const arena=$('rain-arena');
  arena.style.borderColor='rgba(239,68,68,0.8)';
  arena.style.boxShadow='0 0 32px rgba(239,68,68,0.4)';
  setTimeout(()=>{ arena.style.borderColor=''; arena.style.boxShadow=''; },600);
  if(state.lives<=0) gameOver();
}

function levelUp(){
  state.level++;
  state.wordsThisLevel=0;
  updateHUD();
  // Flash arena green
  const arena=$('rain-arena');
  arena.style.borderColor='rgba(16,185,129,0.8)';
  arena.style.boxShadow='0 0 32px rgba(16,185,129,0.4)';
  setTimeout(()=>{ arena.style.borderColor=''; arena.style.boxShadow=''; },600);
}

// ── Pause / Resume ────────────────────────────────────────────────────────────
function pauseGame(){
  if(!state.running) return;
  state.paused=true;
  stopSpawning();
  $('pause-overlay').style.display='flex';
  $('btn-pause').textContent='▶️ เล่นต่อ';
  $('btn-pause').setAttribute('onclick','resumeGame()');
  // Pause all animations
  $('falling-wrap').querySelectorAll('.falling-word').forEach(el=>{
    el.style.animationPlayState='paused';
  });
}
function resumeGame(){
  state.paused=false;
  $('pause-overlay').style.display='none';
  $('btn-pause').textContent='⏸️ หยุด';
  $('btn-pause').setAttribute('onclick','pauseGame()');
  $('falling-wrap').querySelectorAll('.falling-word').forEach(el=>{
    el.style.animationPlayState='running';
  });
  startSpawning();
}

// ── Game Over ─────────────────────────────────────────────────────────────────
function gameOver(){
  state.running=false;
  stopSpawning();
  // Clear remaining words
  state.activeWords=[];
  $('falling-wrap').innerHTML='';
  // Set scores
  $('go-score').textContent=state.score;
  $('go-level').textContent=state.level;
  $('go-correct').textContent=state.correct;
  const won=state.lives>0;
  $('gameover-emoji').textContent=won?'🏆':'💀';
  $('gameover-title').textContent=won?'ยอดเยี่ยม!':'เกม Over!';
  $('gameover-sub').textContent=won?'คุณผ่านทุก Level แล้ว!':'ชีวิตหมดแล้ว!';
  showPanel('gameover');
}

function restartGame(){
  showPanel('game');
  startGame(state.words);
}
function goBack(){
  stopSpawning();
  state.running=false;
  $('falling-wrap').innerHTML='';
  showPanel('setup');
}
