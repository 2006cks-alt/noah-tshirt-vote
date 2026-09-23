import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const fbApp = initializeApp(firebaseConfig);
const fs = getFirestore(fbApp);
const auth = getAuth(fbApp);

/* ---------- thin adapter so the rest of this file reads like the original
   Claude-artifact version (doc/collection/get/set/update/delete/onSnapshot) ---------- */
function wrapDocSnap(snap){
  return { id: snap.id, exists: snap.exists(), data: () => snap.data() };
}
const db = {
  doc(path){
    const ref_ = doc(fs, path);
    return {
      id: ref_.id,
      async get(){ return wrapDocSnap(await getDoc(ref_)); },
      async set(data){ await setDoc(ref_, data); },
      async update(data){ await updateDoc(ref_, data); },
      async delete(){ await deleteDoc(ref_); },
      onSnapshot(next, err){ return onSnapshot(ref_, s=>next(wrapDocSnap(s)), err); },
    };
  },
  collection(path){
    const ref_ = collection(fs, path);
    return {
      async get(){ const s = await getDocs(ref_); return { docs: s.docs.map(wrapDocSnap) }; },
      onSnapshot(next, err){ return onSnapshot(ref_, s=>next({ docs: s.docs.map(wrapDocSnap) }), err); },
    };
  },
};

let ADMIN_LOGGED_IN = false;
const userNs = {
  async id(){ return auth.currentUser ? auth.currentUser.uid : null; },
  async canEdit(){ return ADMIN_LOGGED_IN; },
};

/* ============================================================
   Everything below is the same app logic as the Claude artifact
   version, unchanged except:
   - window.claude.use(...) → the adapters above (already signed in)
   - the private per-viewer vote doc lives at myVotes/{uid} instead of
     the Claude-only data/users/{self}/vote path (privacy is now
     enforced by firestore.rules instead of the platform)
   ============================================================ */

const ADMIN_PIN = "0925";
const ADMIN_ID = "admin";
const ADMIN_PW = "4474";

let DESIGNS = [];
let COUNTS = {};
let currentDesign = null;
let currentTab = 'front';
let pendingAction = null; // 'vote' | 'addDesign'
let VIEWER_UID = null;
let MY_VOTE_ID = null;

function esc(s){ const d=document.createElement('div'); d.textContent=s??''; return d.innerHTML; }

function coverSideFor(d){
  if(d.coverSide==='back') return d.backUrl ? 'back' : 'front';
  if(d.coverSide==='front') return d.frontUrl ? 'front' : 'back';
  return d.frontUrl ? 'front' : 'back';
}

function showMockup(container, url, side, alt){
  container.classList.add('mockup');
  container.innerHTML = '';
  if(url){
    const img = document.createElement('img'); img.src=url; img.alt=alt||'';
    container.appendChild(img);
  } else {
    const empty = document.createElement('div');
    empty.className='empty-note';
    empty.textContent = side==='back' ? '뒷면 사진 없음' : '앞면 사진 없음';
    container.appendChild(empty);
  }
}

function maxVotes(){ return Math.max(1, ...DESIGNS.map(d=>COUNTS[d.id]||0)); }

const VOTE_DEADLINE = new Date(2026,8,26,23,59,59); // 9/26(토) 23:59

function renderDeadlineChip(){
  const el = document.getElementById('deadline-chip');
  if(!el) return;
  const now = new Date();
  if(now > VOTE_DEADLINE){
    el.className = 'deadline-chip ended';
    el.innerHTML = `<span>투표 마감</span>`;
    return;
  }
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineOnly = new Date(VOTE_DEADLINE.getFullYear(), VOTE_DEADLINE.getMonth(), VOTE_DEADLINE.getDate());
  const diffDays = Math.round((deadlineOnly-todayOnly)/86400000);
  const dday = diffDays<=0 ? 'D-DAY' : ('D-'+diffDays);
  el.className = 'deadline-chip';
  el.innerHTML = `<b>${dday}</b><span class="ddate">9/26(토) 23:59 마감</span>`;
}

function renderStatsChip(){
  renderDeadlineChip();
  const chip = document.getElementById('stats-chip');
  if(!chip) return;
  const totalVotes = Object.values(COUNTS).reduce((s,v)=>s+(v||0),0);
  chip.innerHTML = `<span><b>${DESIGNS.length}</b>개 디자인</span><span class="dot"></span><span>총 <b>${totalVotes}</b>표</span>`;
}

function renderGrid(){
  renderStatsChip();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const mx = maxVotes();
  const totalVotes = Object.values(COUNTS).reduce((s,v)=>s+(v||0),0);
  DESIGNS.slice().sort((a,b)=>(a.order??0)-(b.order??0)).forEach(d=>{
    const card = document.createElement('div'); card.className='card';
    const votes = COUNTS[d.id]||0;
    if(totalVotes>0 && votes===mx){
      const badge = document.createElement('div'); badge.className='rank-badge'; badge.textContent='🏆 1위';
      card.appendChild(badge);
    }
    const thumb = document.createElement('div');
    const coverSide = coverSideFor(d);
    showMockup(thumb, coverSide==='back' ? d.backUrl : d.frontUrl, coverSide, d.name);
    thumb.onclick = ()=>openModal(d);
    card.appendChild(thumb);
    const nm = document.createElement('div'); nm.className='name'; nm.textContent=d.name;
    card.appendChild(nm);
    const row = document.createElement('div'); row.className='row';
    row.innerHTML = `<span class="votes">${votes}표</span>`;
    card.appendChild(row);
    const bar=document.createElement('div'); bar.className='bar';
    const fill=document.createElement('div'); fill.className='bar-fill'; fill.style.width=(votes/mx*100)+'%';
    bar.appendChild(fill); card.appendChild(bar);
    const btns=document.createElement('div'); btns.className='btns';
    const isMine = MY_VOTE_ID===d.id;
    const vb=document.createElement('button');
    vb.className = 'vote-btn'+(isMine?' voted':'');
    vb.textContent = isMine ? '✓ 투표함' : '👍 투표';
    vb.onclick=()=>{ currentDesign=d; pendingAction='vote'; doVote(); };
    const vv=document.createElement('button'); vv.className='view-btn'; vv.textContent='크게 보기';
    vv.onclick=()=>openModal(d);
    btns.appendChild(vb); btns.appendChild(vv);
    card.appendChild(btns);
    grid.appendChild(card);
  });

  const addCard = document.createElement('div'); addCard.className='add-card';
  addCard.innerHTML = '<div class="plus-icon">+</div><div class="add-label">나만의 조합<br>만들기</div>';
  addCard.onclick = openAddModal;
  grid.appendChild(addCard);
}

function updateModalVoteButton(){
  const btn = document.getElementById('modal-vote');
  const isMine = currentDesign && MY_VOTE_ID===currentDesign.id;
  btn.classList.toggle('voted', !!isMine);
  btn.textContent = isMine ? '✓ 이 디자인에 투표함' : '👍 이 디자인에 투표';
}

function openModal(d){
  currentDesign = d;
  currentTab = coverSideFor(d);
  document.getElementById('modal-name').textContent = d.name;
  document.getElementById('tab-front').classList.toggle('active', currentTab==='front');
  document.getElementById('tab-back').classList.toggle('active', currentTab==='back');
  showMockup(document.getElementById('modal-thumb'), currentTab==='back' ? d.backUrl : d.frontUrl, currentTab, d.name);
  document.getElementById('modal-msg').textContent='';
  updateModalVoteButton();
  document.getElementById('modal').classList.add('open');
}
document.getElementById('close-modal').onclick=()=>document.getElementById('modal').classList.remove('open');
document.getElementById('tab-front').onclick=()=>{
  currentTab='front';
  document.getElementById('tab-front').classList.add('active');
  document.getElementById('tab-back').classList.remove('active');
  showMockup(document.getElementById('modal-thumb'), currentDesign?.frontUrl, 'front', currentDesign?.name);
};
document.getElementById('tab-back').onclick=()=>{
  currentTab='back';
  document.getElementById('tab-back').classList.add('active');
  document.getElementById('tab-front').classList.remove('active');
  showMockup(document.getElementById('modal-thumb'), currentDesign?.backUrl, 'back', currentDesign?.name);
};
document.getElementById('modal-vote').onclick=()=>{ pendingAction='vote'; doVote(true); };

function getVoterInfo(){
  try{ return JSON.parse(localStorage.getItem('tv_voter')||'null'); }catch(e){ return null; }
}
function setVoterInfo(info){
  try{ localStorage.setItem('tv_voter', JSON.stringify(info)); }catch(e){}
}
function showGate(){ document.getElementById('gate').classList.add('open'); }
function hideGate(){ document.getElementById('gate').classList.remove('open'); }

async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

document.getElementById('gate-submit').onclick = async ()=>{
  const btn = document.getElementById('gate-submit');
  const sid = document.getElementById('gate-sid').value.trim();
  const name = document.getElementById('gate-name').value.trim();
  const pw = document.getElementById('gate-pw').value;
  const msg = document.getElementById('gate-msg');
  if(!sid || !name || !pw){ msg.textContent='학번, 이름, 비밀번호를 모두 입력해주세요.'; return; }

  if(sid===ADMIN_ID && pw===ADMIN_PW){
    msg.textContent='';
    hideGate();
    enterAdminPanel();
    return;
  }

  btn.disabled = true;
  try{
    const hash = await sha256Hex(pw);
    const voterRef = db.doc('voters/'+sid);
    const snap = await voterRef.get();
    if(snap.exists){
      const existing = snap.data() || {};
      if(existing.passwordHash !== hash){
        msg.textContent = '이미 등록된 학번이에요. 처음 만든 비밀번호를 입력해주세요.';
        btn.disabled = false;
        return;
      }
    } else {
      await voterRef.set({ name, studentId: sid, passwordHash: hash, votedAt: Date.now() });
    }
    setVoterInfo({ sid, name, passwordHash: hash });
    msg.textContent='';
    hideGate();
    loadMyVote();
    if(pendingAction==='vote' && currentDesign) doVote(true);
    else if(pendingAction==='addDesign') submitPickedCombo();
    pendingAction = null;
  }catch(e){
    msg.textContent = '확인 중 오류가 발생했어요. 다시 시도해주세요.';
  }
  btn.disabled = false;
};

async function loadMyVote(){
  try{
    VIEWER_UID = await userNs.id();
  }catch(e){ VIEWER_UID = null; }
  if(!VIEWER_UID){ return; }
  try{
    const snap = await db.doc('myVotes/'+VIEWER_UID).get();
    MY_VOTE_ID = snap.exists ? (snap.data()||{}).designId||null : null;
  }catch(e){ MY_VOTE_ID = null; }
  renderGrid();
}

async function doVote(fromModal){
  const voter = getVoterInfo();
  const msgEl = fromModal ? document.getElementById('modal-msg') : null;
  if(!voter){ pendingAction='vote'; showGate(); return; }
  if(!currentDesign){ return; }

  if(VIEWER_UID){
    if(MY_VOTE_ID===currentDesign.id){
      if(msgEl){ msgEl.className='msg ok'; msgEl.textContent='이미 이 디자인에 투표하셨어요.'; }
      return;
    }
    try{
      const countsRef = db.doc('votes/counts');
      const csnap = await countsRef.get();
      const data = csnap.data() || {};
      const prevId = MY_VOTE_ID;
      const designId = currentDesign.id;
      if(prevId && data[prevId]) data[prevId] = Math.max(0, data[prevId]-1);
      data[designId] = (data[designId]||0)+1;
      await countsRef.set(data);
      await db.doc('myVotes/'+VIEWER_UID).set({designId, votedAt:Date.now()});
      await db.doc('voters/'+voter.sid).set({name:voter.name, studentId:voter.sid, passwordHash:voter.passwordHash, votedAt:Date.now()});
      COUNTS = data;
      MY_VOTE_ID = designId;
      renderGrid();
      updateModalVoteButton();
      const okMsg = prevId ? '투표를 변경했어요! 🎉' : '투표 완료! 감사합니다 🎉';
      if(msgEl){ msgEl.className='msg ok'; msgEl.textContent=okMsg; }
      else alert(okMsg);
    }catch(e){
      if(msgEl){ msgEl.className='msg err'; msgEl.textContent='투표 중 오류가 발생했어요. 다시 시도해주세요.'; }
    }
    return;
  }

  // fallback for the rare case anonymous auth hasn't resolved yet: can't track/change
  // "my vote" without a private uid, so just record this one cast
  try{
    const voterRef = db.doc('voters/'+voter.sid);
    const countsRef = db.doc('votes/counts');
    const csnap = await countsRef.get();
    const data = csnap.data() || {};
    const designId = currentDesign.id;
    data[designId] = (data[designId]||0)+1;
    await countsRef.set(data);
    await voterRef.set({name:voter.name, studentId:voter.sid, passwordHash:voter.passwordHash, votedAt:Date.now()});
    COUNTS[designId] = data[designId];
    renderGrid();
    if(msgEl){ msgEl.className='msg ok'; msgEl.textContent='투표 완료! 감사합니다 🎉'; }
    else alert('투표 완료! 감사합니다 🎉');
  }catch(e){
    if(msgEl){ msgEl.className='msg err'; msgEl.textContent='투표 중 오류가 발생했어요. 다시 시도해주세요.'; }
  }
}

let addFrontUrl = null, addBackUrl = null, pickerTarget = null;

function allMockupPhotos(){
  const list = [];
  DESIGNS.forEach(d=>{
    if(d.frontUrl) list.push({url:d.frontUrl, label:d.name+' · 앞면'});
    if(d.backUrl) list.push({url:d.backUrl, label:d.name+' · 뒷면'});
  });
  return list;
}

function renderAddSlot(which){
  const thumb = document.getElementById('slot-'+which+'-thumb');
  const url = which==='front' ? addFrontUrl : addBackUrl;
  thumb.classList.toggle('filled', !!url);
  thumb.innerHTML='';
  if(url){
    const img = document.createElement('img'); img.src=url; img.alt='';
    thumb.appendChild(img);
  } else {
    const ph = document.createElement('div'); ph.className='slot-placeholder'; ph.textContent='+';
    thumb.appendChild(ph);
  }
}

function updateAddSubmitState(){
  document.getElementById('add-submit').disabled = !(addFrontUrl || addBackUrl);
}

function showAddMainView(){
  document.getElementById('add-main-view').hidden = false;
  document.getElementById('add-picker-view').hidden = true;
}
function showPickerView(target){
  pickerTarget = target;
  document.getElementById('picker-title').textContent = target==='front' ? '앞면으로 쓸 사진 선택' : '뒷면으로 쓸 사진 선택';
  renderPickerGrid();
  document.getElementById('add-main-view').hidden = true;
  document.getElementById('add-picker-view').hidden = false;
}
function renderPickerGrid(){
  const grid = document.getElementById('picker-grid');
  grid.innerHTML='';
  const photos = allMockupPhotos();
  if(photos.length===0){
    const p = document.createElement('div'); p.className='picker-empty'; p.textContent='아직 등록된 목업 사진이 없어요';
    grid.appendChild(p); return;
  }
  photos.forEach(ph=>{
    const btn = document.createElement('button'); btn.type='button'; btn.className='picker-item';
    const thumb = document.createElement('div');
    showMockup(thumb, ph.url, 'front', ph.label);
    const lbl = document.createElement('div'); lbl.className='picker-label'; lbl.textContent=ph.label;
    btn.appendChild(thumb); btn.appendChild(lbl);
    btn.onclick = ()=>{
      if(pickerTarget==='front') addFrontUrl = ph.url; else addBackUrl = ph.url;
      renderAddSlot(pickerTarget);
      updateAddSubmitState();
      showAddMainView();
    };
    grid.appendChild(btn);
  });
}

function openAddModal(){
  addFrontUrl = null; addBackUrl = null;
  document.getElementById('add-name').value='';
  document.getElementById('add-msg').textContent='';
  renderAddSlot('front'); renderAddSlot('back');
  updateAddSubmitState();
  showAddMainView();
  document.getElementById('add-modal').classList.add('open');
}
document.getElementById('close-add-modal').onclick=()=>document.getElementById('add-modal').classList.remove('open');
document.getElementById('pick-front-btn').onclick=()=>showPickerView('front');
document.getElementById('pick-back-btn').onclick=()=>showPickerView('back');
document.getElementById('slot-front-thumb').onclick=()=>showPickerView('front');
document.getElementById('slot-back-thumb').onclick=()=>showPickerView('back');
document.getElementById('picker-back').onclick=()=>showAddMainView();

document.getElementById('add-submit').onclick = ()=>{
  const name = document.getElementById('add-name').value.trim();
  const msg = document.getElementById('add-msg');
  if(!name){ msg.className='msg err'; msg.textContent='이름을 입력해주세요.'; return; }
  if(!addFrontUrl && !addBackUrl){ msg.className='msg err'; msg.textContent='앞면 또는 뒷면 사진을 하나 이상 선택해주세요.'; return; }
  const voter = getVoterInfo();
  if(!voter){ pendingAction='addDesign'; showGate(); return; }
  submitPickedCombo();
};

async function submitPickedCombo(){
  const msg = document.getElementById('add-msg');
  const name = document.getElementById('add-name').value.trim();
  msg.className='msg'; msg.textContent='추가하는 중...';
  try{
    const id = 'design_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    await db.doc('designs/'+id).set({name, frontUrl:addFrontUrl||null, backUrl:addBackUrl||null, order: DESIGNS.length, createdAt:Date.now()});
    msg.className='msg ok'; msg.textContent='추가됐어요! 투표 목록에서 확인해보세요 🎉';
    setTimeout(()=>{ document.getElementById('add-modal').classList.remove('open'); document.getElementById('add-msg').textContent=''; }, 900);
  }catch(e){
    msg.className='msg err'; msg.textContent='추가 실패: 다시 시도해주세요.';
  }
}

async function createDesignDoc(name, frontUrl, backUrl){
  const id = 'design_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  await db.doc('designs/'+id).set({name, frontUrl, backUrl: backUrl||null, order: DESIGNS.length, createdAt:Date.now()});
}

function isAdminRoute(){ return location.hash.startsWith('#admin'); }
function tryEnterAdmin(){
  if(!isAdminRoute()) return;
  document.getElementById('admin-pin-gate').classList.add('open');
}
function enterAdminPanel(){
  ADMIN_LOGGED_IN = true;
  document.getElementById('admin-pin-gate').classList.remove('open');
  document.getElementById('gate').classList.remove('open');
  document.getElementById('admin-panel').classList.add('open');
  document.querySelector('.grid').style.display='none';
  document.querySelector('.section-head').style.display='none';
  document.querySelector('footer').style.display='none';
  renderAdminDesigns();
  renderVoters();
}
document.getElementById('pin-submit').onclick = ()=>{
  const v = document.getElementById('pin-input').value;
  if(v===ADMIN_PIN){
    enterAdminPanel();
  } else {
    document.getElementById('pin-msg').textContent='PIN이 올바르지 않아요.';
  }
};

function renderAdminDesigns(){
  const tbody = document.querySelector('#admin-designs-table tbody');
  tbody.innerHTML = '<tr><th>미리보기</th><th>이름</th><th>뒤</th><th></th></tr>';
  DESIGNS.forEach(d=>{
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const thumb = document.createElement('div'); thumb.className='admin-thumb';
    const coverSide = coverSideFor(d);
    showMockup(thumb, coverSide==='back' ? d.backUrl : d.frontUrl, coverSide, d.name);
    td1.appendChild(thumb); tr.appendChild(td1);

    const td2 = document.createElement('td');
    const nameView = document.createElement('div'); nameView.textContent = d.name;
    const nameEdit = document.createElement('div'); nameEdit.style.cssText='display:flex;gap:6px;'; nameEdit.hidden = true;
    const nameInput = document.createElement('input'); nameInput.type='text'; nameInput.value = d.name;
    nameInput.style.cssText='padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:.85rem;width:100%;';
    const saveBtn = document.createElement('button'); saveBtn.className='small-btn'; saveBtn.textContent='저장';
    saveBtn.onclick = async ()=>{
      const newName = nameInput.value.trim();
      if(!newName) return;
      try{ await db.doc('designs/'+d.id).update({name:newName}); }catch(e){ alert('수정 실패했어요.'); }
    };
    nameEdit.appendChild(nameInput); nameEdit.appendChild(saveBtn);
    td2.appendChild(nameView); td2.appendChild(nameEdit);
    tr.appendChild(td2);

    const td3 = document.createElement('td'); td3.textContent = d.backUrl ? '✅' : '—'; tr.appendChild(td3);

    const td4 = document.createElement('td');
    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:6px;';
    const editBtn = document.createElement('button'); editBtn.className='small-btn'; editBtn.textContent='이름 수정';
    editBtn.onclick = ()=>{
      nameView.hidden = true; editBtn.hidden = true; nameEdit.hidden = false;
      nameInput.focus(); nameInput.select();
    };
    const delBtn = document.createElement('button'); delBtn.className='small-btn danger'; delBtn.textContent='삭제';
    delBtn.onclick = async ()=>{
      if(!confirm('이 디자인을 삭제할까요?')) return;
      try{ await db.doc('designs/'+d.id).delete(); }catch(e){ alert('삭제 실패했어요.'); }
    };
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    td4.appendChild(actions); tr.appendChild(td4);
    tbody.appendChild(tr);
  });
}

async function renderVoters(){
  const permEl = document.getElementById('voters-permission-msg');
  const tbody = document.querySelector('#voters-table tbody');
  tbody.innerHTML='';
  const canEdit = await userNs.canEdit();
  if(!canEdit){
    permEl.className='msg err';
    permEl.textContent='관리자만 명단을 볼 수 있어요.';
    return;
  }
  permEl.textContent='';
  try{
    const res = await db.collection('voters').get();
    const docs = res.docs || [];
    tbody.innerHTML = '<tr><th>학번</th><th>이름</th><th>시각</th></tr>';
    docs.forEach(docSnap=>{
      const v = docSnap.data() || {};
      const tr = document.createElement('tr');
      const t = v.votedAt ? new Date(v.votedAt).toLocaleString('ko-KR') : '-';
      tr.innerHTML = `<td>${esc(v.studentId)}</td><td>${esc(v.name)}</td><td>${t}</td>`;
      tbody.appendChild(tr);
    });
  }catch(e){
    permEl.className='msg err';
    permEl.textContent='명단을 불러오지 못했어요.';
  }
}

document.getElementById('add-team-btn').onclick = async ()=>{
  const msg = document.getElementById('add-team-msg');
  const name = document.getElementById('new-team-name').value.trim();
  const frontUrl = document.getElementById('new-front-url').value.trim();
  const backUrl = document.getElementById('new-back-url').value.trim();
  if(!name || !frontUrl){ msg.className='msg err'; msg.textContent='이름과 앞면 이미지 URL은 필수예요.'; return; }
  msg.className='msg'; msg.textContent='추가하는 중...';
  try{
    await createDesignDoc(name, frontUrl, backUrl);
    msg.className='msg ok'; msg.textContent='추가되었습니다!';
    document.getElementById('new-team-name').value='';
    document.getElementById('new-front-url').value='';
    document.getElementById('new-back-url').value='';
  }catch(e){
    msg.className='msg err'; msg.textContent='추가 실패했어요.';
  }
};

async function init(){
  try{ await signInAnonymously(auth); }catch(e){ /* handled below via onAuthStateChanged */ }

  db.doc('votes/counts').onSnapshot(snap=>{
    COUNTS = snap.data() || {};
    renderGrid();
  });
  db.collection('designs').onSnapshot(snap=>{
    DESIGNS = snap.docs.map(d=>{
      const v = d.data();
      return {id: d.id, name:v.name, frontUrl:v.frontUrl, backUrl:v.backUrl, order:v.order, coverSide:v.coverSide};
    });
    renderGrid();
    if(document.getElementById('admin-panel').classList.contains('open')) renderAdminDesigns();
  });

  onAuthStateChanged(auth, (user)=>{
    if(user && getVoterInfo()) loadMyVote();
  });

  renderGrid();
  if(isAdminRoute()){
    tryEnterAdmin();
  } else if(!getVoterInfo()){
    showGate();
  } else {
    loadMyVote();
  }
  window.addEventListener('hashchange', tryEnterAdmin);
}
init();
