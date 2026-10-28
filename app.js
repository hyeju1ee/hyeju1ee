// SUBAC 웹앱 화면 로직
import { JOURNALS } from "./journals.js";
import * as B from "./backend.js";

/* ---------- constants ---------- */
const TYPES = {
  meal:  {label:"밥 약속", e:"🍚", p:10},
  cafe:  {label:"카페",   e:"☕", p:5},
  study: {label:"스터디",  e:"📚", p:15},
  club:  {label:"학회 활동", e:"🌱", p:20},
  etc:   {label:"기타",   e:"✨", p:5},
};
const GAME_SECONDS = 15, BITES_PER_MELON = 10;

/* ---------- state ---------- */
const S = {
  route: "home",
  pairs: [], activities: [], scores: [], summaries: [], aiReady: false,
  mode: "connecting", // connecting | live | local
  profile: null,
  pairTab: "rank",
  loaded: {}, prevRanks: null, deltas: {}, deltaUntil: 0, flashIds: new Set(),
  game: {phase:"idle", count:0, bites:0, left:GAME_SECONDS, endAt:0, saving:false, result:null},
};

const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ago = t => {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return "방금 전";
  if (d < 3600) return Math.floor(d/60) + "분 전";
  if (d < 86400) return Math.floor(d/3600) + "시간 전";
  if (d < 86400*7) return Math.floor(d/86400) + "일 전";
  const dt = new Date(t); return `${dt.getMonth()+1}월 ${dt.getDate()}일`;
};
const fmtDate = s => { if(!s) return ""; const [y,m,d] = s.split("-"); return `${+m}월 ${+d}일`; };
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2500); }

/* ---------- data layer: backend.js (Firebase 또는 데모 모드) ---------- */
const myName = () => S.profile ? S.profile.nickname : "";
async function addDoc(coll, data){ await B.add(coll, data); }
async function delDoc(coll, id){ await B.remove(coll, id); }
function setMode(m){
  S.mode = m;
  const dot = $("#syncDot"), txt = $("#syncText");
  if (dot) dot.className = "dot" + (m==="live" ? " live" : "");
  if (txt) txt.textContent = S.profile ? S.profile.nickname : (m==="live" ? "실시간" : m==="local" ? "데모 모드" : "연결 중");
}

let unsubs = [];
function startData(){
  unsubs.forEach(f => f()); unsubs = [];
  unsubs.push(B.watchOwnership(S.profile, () => {
    unsubs.forEach(f => f()); unsubs = [];
    S.profile = null; S.pairs = []; S.activities = []; S.scores = []; S.summaries = []; S.loaded = {};
    closeOverlay(); closePdf(); setMode(S.mode); showOnboarding();
    toast("다른 기기에서 이 닉네임으로 로그인해서 여기서는 로그아웃됐어요");
  }));
  for (const coll of ["pairs","activities","scores","summaries"]) {
    unsubs.push(B.subscribe(coll, rows => { S[coll] = rows; S.loaded[coll] = true; onData(coll); }));
  }
}

async function boot(){
  const r = await B.init();
  S.profile = r.profile;
  setMode(r.mode);
  fetch("api/summarize", {method:"GET"}).then(x => x.ok ? x.json() : {}).then(j => { S.aiReady = !!(j && j.enabled) && r.mode === "live"; if ($("#readerInner")) renderReader(); }).catch(() => {});
  if (!S.profile) { showOnboarding(); return; }
  startData();
  render();
}

function onData(coll){
  if (coll === "summaries" && $("#readerInner")) { renderReader(); return; }
  if (coll === "pairs" || coll === "activities") computeRankDeltas();
  if (S.route === "game" && S.game.phase === "playing") return; // keep game frame smooth
  render();
}

/* ---------- ranking ---------- */
function ranking(){
  const map = new Map(S.pairs.map(p => [p.id, {...p, score:0, n:0, counts:{}, last:0}]));
  for (const a of S.activities){
    const r = map.get(a.pairId); if (!r) continue;
    const t = TYPES[a.type] || TYPES.etc;
    r.score += t.p; r.n++; r.counts[a.type] = (r.counts[a.type]||0) + 1;
    r.last = Math.max(r.last, a.createdAt||0);
  }
  return [...map.values()].sort((a,b)=> b.score-a.score || b.n-a.n || (a.createdAt||0)-(b.createdAt||0));
}
function computeRankDeltas(){
  if (!(S.loaded.pairs && S.loaded.activities)) { S.prevRanks = null; return; }
  const list = ranking();
  const now = {}; list.forEach((r,i)=> now[r.id] = i+1);
  if (S.prevRanks){
    const deltas = {};
    for (const id in now){
      const before = S.prevRanks[id];
      if (before == null) deltas[id] = "new";
      else if (before !== now[id]) deltas[id] = before - now[id];
    }
    if (Object.keys(deltas).length){ S.deltas = deltas; S.deltaUntil = Date.now() + 6000; S.flashIds = new Set(Object.keys(deltas)); }
  }
  S.prevRanks = now;
}
const pairName = p => p ? `${p.senior} 선배 × ${p.junior} 후배` : "삭제된 짝";

/* ---------- routing ---------- */
const ROUTES = ["home","journal","pairs","game"];
function go(r){ if (S.game.phase==="playing" && r!=="game") stopGame(true); if (location.hash !== "#"+r) location.hash = r; else { S.route=r; render(); } }
function readHash(){ const h = location.hash.slice(1); S.route = ROUTES.includes(h) ? h : "home"; render(); window.scrollTo(0,0); }
window.addEventListener("hashchange", readHash);
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));

/* ---------- render ---------- */
function render(){
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === S.route));
  const v = $("#view");
  const before = captureRects();
  if (S.route === "home") v.innerHTML = viewHome();
  else if (S.route === "journal") v.innerHTML = viewJournal();
  else if (S.route === "pairs") v.innerHTML = viewPairs();
  else if (S.route === "game") v.innerHTML = viewGame();
  v.insertAdjacentHTML("beforeend", `<footer class="copyright">ⓒ 2026. Hyeju Lee. All rights reserved.</footer>`);
  playFlip(before);
  bindView();
}

function captureRects(){
  const m = {}; document.querySelectorAll("[data-flip]").forEach(el => m[el.dataset.flip] = el.getBoundingClientRect().top); return m;
}
function playFlip(before){
  document.querySelectorAll("[data-flip]").forEach(el => {
    const b = before[el.dataset.flip]; if (b == null) return;
    const dy = b - el.getBoundingClientRect().top; if (!dy) return;
    el.animate([{transform:`translateY(${dy}px)`},{transform:"none"}], {duration:520, easing:"cubic-bezier(.2,.8,.2,1)"});
  });
}

function emptyArt(){ return `<svg class="art" viewBox="0 0 100 100"><use href="#logo"/></svg>`; }

function viewHome(){
  const issue = JOURNALS[0];
  const rk = ranking(); const top = rk[0];
  const best = S.scores[0];
  const recent = [...S.activities].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,3);
  const pmap = new Map(S.pairs.map(p=>[p.id,p]));
  return `${installBanner()}
  <h1>오늘도 지속가능하게,<br>${esc(myName() || "수박 학회원")}님 반가워요</h1>
  <button class="glass hero pressable" data-open-issue="${issue.id}" style="width:100%;text-align:left">
    <div style="min-width:0">
      <span class="eyebrow">이번 호 학회지 · ${issue.vol}</span>
      <div class="title">${esc(issue.title)}</div>
      <p>${issue.season} · 보고서 ${reportCount(issue)}편 · AI 목차별 요약</p>
      <span class="btn btn-primary btn-sm">바로 읽기</span>
    </div>
    <svg class="logo3d" aria-hidden="true"><use href="#logo"/></svg>
  </button>

  <div class="grid2" style="margin-top:12px">
    <button class="glass tile pressable" data-go="pairs">
      <span class="icon" style="background:linear-gradient(160deg,#FFE28A,#E6A919)">🏆</span>
      <span class="label">짝선짝후 1위</span>
      <span class="big">${top && top.score>0 ? esc(top.senior)+" × "+esc(top.junior) : "아직 없어요"}</span>
      <span class="small muted">${top && top.score>0 ? `<b class="num" style="color:var(--green-700)">${top.score}</b>점 · 활동 ${top.n}회` : "첫 활동을 기록해 보세요"}</span>
    </button>
    <button class="glass tile pressable" data-go="game">
      <span class="icon" style="background:linear-gradient(160deg,#FF9A96,#EC5653)">🍉</span>
      <span class="label">수박 먹기 최고 기록</span>
      <span class="big">${best ? `<span class="num">${best.best}</span>통` : "도전자 대기 중"}</span>
      <span class="small muted">${best ? esc(best.nickname) : "15초 안에 몇 통 먹을까요?"}</span>
    </button>
  </div>

  <div class="section">
    <div class="section-head"><h2>최근 짝선짝후 활동</h2><button class="link-btn" data-go="pairs">전체보기</button></div>
    ${recent.length ? `<div class="glass list">${recent.map(a=>{
      const t=TYPES[a.type]||TYPES.etc;
      return `<div class="row"><span class="chip-ic">${t.e}</span><div class="grow"><div class="t">${esc(pairName(pmap.get(a.pairId)))}</div><div class="s">${t.label}${a.note? " · "+esc(a.note):""}</div></div><span class="small muted" style="flex:none">${ago(a.createdAt)}</span></div>`;}).join("")}</div>`
    : `<div class="glass empty">${emptyArt()}<b>아직 기록된 활동이 없어요</b><span class="muted small">선배와 밥 한 끼, 그게 첫 기록이에요.</span><button class="btn btn-primary btn-sm" data-act="add-activity">활동 기록하기</button></div>`}
  </div>`;
}

function viewPairs(){
  const rk = ranking();
  const showDelta = Date.now() < S.deltaUntil;
  const pmap = new Map(S.pairs.map(p=>[p.id,p]));
  const recent = [...S.activities].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,30);
  const deltaBadge = id => {
    if (!showDelta || S.deltas[id]==null) return "";
    const d = S.deltas[id];
    if (d==="new") return `<span class="delta new">NEW</span>`;
    return d>0 ? `<span class="delta up">▲${d}</span>` : `<span class="delta down">▼${-d}</span>`;
  };
  const podium = rk.slice(0,3);
  let body;
  if (S.pairTab === "rank"){
    body = !rk.length ? `<div class="glass empty">${emptyArt()}<b>등록된 짝선짝후가 없어요</b><span class="muted small">선배와 후배 이름으로 짝을 만들면<br>활동 점수로 순위가 매겨져요.</span><button class="btn btn-primary btn-sm" data-act="add-pair">짝 등록하기</button></div>` : `
      ${podium.length>=3 ? `<div class="glass podium">
        ${[1,0,2].map(i=>{const r=podium[i];const h=[86,56,40][i];return `<div class="pod p${i+1}"><span class="medal">${i+1}</span><span class="nm">${esc(r.senior)}<br>× ${esc(r.junior)}</span><span class="sc">${r.score}점</span><span class="bar" style="height:${h}px"></span></div>`;}).join("")}
      </div>` : ""}
      <div class="rule-strip">${Object.values(TYPES).map(t=>`<span>${t.e} ${t.label} +${t.p}</span>`).join("")}</div>
      <div class="glass list" style="padding:4px">
        ${rk.map((r,i)=>`<div class="rank-row ${i<3?"top":""} ${showDelta&&S.flashIds.has(r.id)?"flash":""}" data-flip="${r.id}">
          <span class="rank-no">${i+1}</span>
          <div class="rank-main"><div class="t">${esc(r.senior)} 선배 × ${esc(r.junior)} 후배</div>
            <div class="counts">${r.n ? Object.entries(r.counts).map(([k,c])=>`<span>${(TYPES[k]||TYPES.etc).e} ${c}</span>`).join("") : "<span>아직 활동 없음</span>"}${r.last?`<span>· ${ago(r.last)}</span>`:""}</div></div>
          <div class="rank-score"><div class="pts">${r.score}<span class="small muted" style="font-family:var(--font)">점</span></div>${deltaBadge(r.id)}</div>
        </div>`).join("")}
      </div>
      <button class="btn btn-ghost" data-act="add-pair">+ 새 짝선짝후 등록</button>`;
  } else {
    body = !recent.length ? `<div class="glass empty">${emptyArt()}<b>아직 기록이 없어요</b><span class="muted small">함께 밥을 먹거나 스터디를 했다면 바로 남겨 보세요.</span></div>` :
      `<div class="glass list">${recent.map(a=>{const t=TYPES[a.type]||TYPES.etc;return `
        <div class="row"><span class="chip-ic">${t.e}</span>
          <div class="grow"><div class="t">${esc(pairName(pmap.get(a.pairId)))}</div><div class="s">${t.label} +${t.p} · ${a.date?fmtDate(a.date):ago(a.createdAt)}${a.note?" · "+esc(a.note):""}</div></div>
          ${a.by && S.profile && a.by === S.profile.key ? `<button class="del" data-del="${a.id}" aria-label="기록 삭제">삭제</button>` : ""}</div>`;}).join("")}</div>`;
  }
  return `
  <h1>짝선짝후</h1>
  ${S.mode==="local" ? `<div class="glass banner">데모 모드라 이 기기에서만 기록돼요. Firebase를 연결하면 모든 학회원의 기록이 실시간으로 합쳐져요.</div>` : ""}
  <div class="glass seg" role="tablist">
    <button class="${S.pairTab==="rank"?"on":""}" data-ptab="rank">실시간 랭킹</button>
    <button class="${S.pairTab==="feed"?"on":""}" data-ptab="feed">활동 기록 ${S.activities.length?`<span class="num">${S.activities.length}</span>`:""}</button>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">${body}</div>
  <div style="position:sticky;bottom:calc(96px + env(safe-area-inset-bottom,0px));margin-top:16px;z-index:5">
    <button class="btn btn-red pressable" data-act="add-activity">활동 기록하기</button>
  </div>`;
}

/* ---------- game ---------- */
let melonSeq = 0;
function melonSVG(bites){
  const u = "m" + (++melonSeq);
  // flat edge on top; bites eat in from the top in two rows
  const spots = [];
  for (let i=0;i<bites;i++){
    const row = i < 5 ? 0 : 1; const col = i % 5;
    const x = 30 + col*35 + (row?17:0) + ((i*37)%9 - 4);
    const y = 60 + row*34 + ((i*53)%7 - 3);
    spots.push(`<circle cx="${x}" cy="${y}" r="${row?27:25}" fill="#000"/>`);
  }
  return `<svg class="melon" viewBox="0 0 200 130" aria-hidden="true">
    <defs>
      <mask id="${u}k"><rect x="0" y="0" width="200" height="140" fill="#fff"/>${spots.join("")}</mask>
      <radialGradient id="${u}f" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#FF7A73"/><stop offset=".7" stop-color="#EC4F4B"/><stop offset="1" stop-color="#C8322F"/></radialGradient>
      <linearGradient id="${u}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4DAE68"/><stop offset="1" stop-color="#1E4D24"/></linearGradient>
    </defs>
    <g mask="url(#${u}k)">
      <path d="M4 34 H196 A96 92 0 0 1 4 34 Z" fill="url(#${u}r)"/>
      <path d="M12 34 H188 A88 82 0 0 1 12 34 Z" fill="#F2F7E8"/>
      <path d="M18 34 H182 A82 76 0 0 1 18 34 Z" fill="url(#${u}f)"/>
      ${[[60,58],[90,74],[120,60],[140,82],[75,92],[105,100],[45,72],[155,64],[125,106],[100,52]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="3.2" ry="5" fill="#1B1B1B" transform="rotate(${(x%30)-15} ${x} ${y})"/>`).join("")}
      <path d="M22 38 H178" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`;
}
function viewGame(){
  const g = S.game;
  const lb = S.scores.slice(0,10);
  const me = S.profile ? S.scores.find(s => s.id === S.profile.key) : null;
  const myRank = me ? S.scores.indexOf(me) + 1 : 0;
  const lbHtml = `
    <div class="section">
      <div class="section-head"><h2>명예의 전당</h2><span class="small muted">${S.mode==="live"?"실시간 · 1인 최고 기록":"이 기기 기록"}</span></div>
      ${lb.length ? `<div class="glass list" style="padding:6px">${lb.map((s,i)=>`<div class="lb-row ${me && s.id===me.id?"me":""}">
        <span class="rank-no" style="${i<3?"color:var(--red)":""}">${i+1}</span><span class="nm">${esc(s.nickname)}${me && s.id===me.id?' <span class="small muted">(나)</span>':""}</span><span class="c">${s.best}통</span></div>`).join("")}</div>`
      : `<div class="glass empty"><b>첫 기록의 주인공이 되어 보세요</b><span class="muted small">점수가 등록되면 여기에 순위가 나타나요.</span></div>`}
    </div>`;
  if (g.phase === "idle") return `
    <h1>수박 빨리 먹기</h1>
    <div class="glass game-card">
      <div class="stage" style="height:220px;cursor:default">${melonSVG(3)}</div>
      <div><b style="font-size:17px">제한 시간 ${GAME_SECONDS}초, 몇 통이나 먹을 수 있을까요?</b>
      <p class="muted small" style="margin:4px 0 0">수박을 ${BITES_PER_MELON}번 탭하면 한 통을 다 먹어요. 순위에는 한 사람당 최고 기록 하나만 올라가요.</p></div>
      <div class="me-row"><span class="small muted">플레이어</span><b>${esc(myName())}</b>${me ? `<span class="small muted">최고 ${me.best}통${myRank?` · ${myRank}위`:""}</span>` : `<span class="small muted">첫 도전</span>`}</div>
      <button class="btn btn-red pressable" data-act="start" id="startBtn">게임 시작</button>
    </div>${lbHtml}`;
  if (g.phase === "countdown") return `<h1>준비하세요, ${esc(myName())}님</h1><div class="glass game-card"><div class="stage"><span class="count-big" id="cd">3</span></div></div>`;
  if (g.phase === "playing") return `
    <div class="glass game-card" style="margin-top:6px">
      <div class="hud">
        <div class="glass"><div class="k">먹은 수박</div><div class="v" id="hudCount">${g.count}<span style="font-size:16px">통</span></div></div>
        <div class="glass"><div class="k">남은 시간</div><div class="v" id="hudTime">${g.left}<span style="font-size:16px">초</span></div></div>
      </div>
      <div class="timebar"><i id="timeFill" style="width:${g.left/GAME_SECONDS*100}%"></i></div>
      <div class="stage" id="stage" role="button" tabindex="0" aria-label="수박 한 입 먹기">${melonSVG(g.bites)}<div class="hint">탭! 탭! 탭! (스페이스바도 돼요)</div></div>
    </div>`;
  // done
  const res = g.result;
  const status = g.saving ? "기록을 저장하는 중…"
    : !res ? "기록이 저장됐어요"
    : res.isBest ? `새 최고 기록이에요!${myRank ? ` 명예의 전당 <b style="color:var(--ink)">${myRank}위</b>` : ""}`
    : `최고 기록은 ${res.prevBest}통이에요${myRank ? ` · 현재 <b style="color:var(--ink)">${myRank}위</b>` : ""}`;
  return `
    <h1>${esc(myName())}님의 기록</h1>
    <div class="glass game-card">
      <div class="result">
        <span class="eyebrow">${GAME_SECONDS}초 동안 먹은 수박</span>
        <span class="score">${g.count}<span style="font-size:28px">통</span></span>
        <span class="muted">${status}</span>
      </div>
      <button class="btn btn-red pressable" data-act="start">다시 도전</button>
    </div>${lbHtml}`;
}

let gameTimer = null;
function startGame(){
  const g = S.game;
  if (!S.profile) return;
  g.phase = "countdown"; g.count = 0; g.bites = 0; g.left = GAME_SECONDS; g.result = null;
  render();
  let n = 3;
  const tick = () => {
    n--; const el = $("#cd");
    if (n > 0 && el){ el.textContent = n; el.style.animation="none"; void el.offsetWidth; el.style.animation=""; setTimeout(tick, 800); }
    else if (S.game.phase === "countdown"){ g.phase = "playing"; g.endAt = Date.now() + GAME_SECONDS*1000; render(); gameTimer = setInterval(gameTick, 200); }
  };
  setTimeout(tick, 800);
}
function gameTick(){
  const g = S.game;
  const left = Math.max(0, Math.ceil((g.endAt - Date.now())/1000));
  const pct = Math.max(0, (g.endAt - Date.now())/(GAME_SECONDS*1000))*100;
  if (left !== g.left){ g.left = left; const h=$("#hudTime"); if (h){ h.innerHTML = left+'<span style="font-size:16px">초</span>'; h.classList.toggle("warn", left<=10); } }
  const f = $("#timeFill"); if (f) f.style.width = pct + "%";
  if (Date.now() >= g.endAt) endGame();
}
function stopGame(silent){ clearInterval(gameTimer); gameTimer=null; S.game.phase = "idle"; if(!silent) render(); }
async function endGame(){
  clearInterval(gameTimer); gameTimer = null;
  const g = S.game; g.phase = "done"; g.saving = true; render();
  try { g.result = await B.submitScore(S.profile, g.count); }
  catch(e){ console.warn(e); toast("기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요."); }
  g.saving = false; render();
}
function bite(ev){
  const g = S.game; if (g.phase !== "playing") return;
  g.bites++;
  const stage = $("#stage"); if (!stage) return;
  const r = stage.getBoundingClientRect();
  const x = ev && ev.clientX ? ev.clientX - r.left : r.width/2;
  const y = ev && ev.clientY ? ev.clientY - r.top : r.height/2;
  stage.classList.add("bite"); setTimeout(()=>stage.classList.remove("bite"), 70);
  for (let i=0;i<3;i++){ const s=document.createElement("span"); s.className="seed"; s.style.left=x+"px"; s.style.top=y+"px";
    s.style.setProperty("--dx", (Math.random()*120-60)+"px"); s.style.setProperty("--dy", (Math.random()*-90-20)+"px"); stage.appendChild(s); setTimeout(()=>s.remove(),700); }
  try { navigator.vibrate && navigator.vibrate(8); } catch(e) {}
  if (g.bites >= BITES_PER_MELON){
    g.count++; g.bites = 0;
    const p=document.createElement("span"); p.className="pop"; p.textContent="+1통"; p.style.left=(x-30)+"px"; p.style.top=(y-30)+"px"; stage.appendChild(p); setTimeout(()=>p.remove(),800);
    $("#hudCount").innerHTML = g.count+'<span style="font-size:16px">통</span>';
    const old = stage.querySelector("svg.melon"); old.classList.add("melon-out");
    setTimeout(()=>{ if (S.game.phase!=="playing") return; const tmp=document.createElement("div"); tmp.innerHTML=melonSVG(0); const n=tmp.firstElementChild; n.classList.add("melon-in"); const o=stage.querySelector("svg.melon"); o && o.replaceWith(n); }, 120);
  } else {
    const tmp=document.createElement("div"); tmp.innerHTML=melonSVG(g.bites); const o=stage.querySelector("svg.melon:not(.melon-out)"); o && o.replaceWith(tmp.firstElementChild);
  }
}
document.addEventListener("keydown", e => {
  if (S.route==="game" && S.game.phase==="playing" && (e.code==="Space"||e.key===" "||e.key==="Enter")){ e.preventDefault(); if(!e.repeat) bite(); }
});

function issueCover(i){
  return `<div class="cover-art" style="background:linear-gradient(160deg,${i.color[0]},${i.color[1]})"><span class="m">SUBAC</span><span class="v">${esc(i.vol)}</span></div>`;
}
const reportCount = j => j.parts.reduce((n,p)=>n+p.items.filter(it=>it.kind!=="intro").length,0);
function viewJournal(){
  return `
  <h1>학회지</h1>
  <div style="display:flex;flex-direction:column;gap:12px">
    ${JOURNALS.map((j,k)=>`
      <button class="glass cover pressable" data-open-issue="${j.id}">
        ${issueCover(j)}
        <div class="meta"><span class="tag ${k?"red":""}">${k?j.season:"최신호 · "+j.season}</span>
          <span class="t">${esc(j.title)}</span>
          <span class="small muted">보고서 ${reportCount(j)}편 · ${j.parts.map(p=>p.code).join(" · ")}</span>
          <span class="ai-chip">✦ AI 목차별 요약</span></div>
      </button>`).join("")}
  </div>`;
}

/* ---------- reader: 권 → 부(1-1, 1-2) → 보고서별 목차·요약 ---------- */
let reader = {id:null, part:0, open:{}};
function openIssue(id){
  const j = JOURNALS.find(x=>x.id===id); if (!j) return;
  reader = {id, part:0, open:{}};
  document.body.style.overflow = "hidden";
  $("#overlay").innerHTML = `<div class="reader" id="reader" role="dialog" aria-label="${esc(j.vol)} 학회지"><div class="reader-inner" id="readerInner"></div></div>`;
  renderReader();
}
function renderReader(){
  const j = JOURNALS.find(x=>x.id===reader.id); const inner = $("#readerInner"); if (!j || !inner) return;
  const part = j.parts[reader.part];
  inner.innerHTML = `
    <div class="reader-bar"><button class="icon-btn glass" data-close aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div style="min-width:0"><div class="small muted">${j.vol} · ${j.season}</div><div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">SUBAC 학회지 ${j.vol}</div></div></div>
    <div class="issue-head">
      ${issueCover(j)}
      <div style="min-width:0;display:flex;flex-direction:column;gap:4px">
        <span class="eyebrow">${j.season} · ${j.lead} · ${j.members}</span>
        <h2 style="font-size:21px;line-height:1.35">${esc(j.title)}</h2>
      </div>
    </div>
    ${j.parts.length>1 ? `<div class="glass seg" role="tablist" style="grid-template-columns:repeat(${j.parts.length},1fr);margin:16px 0 12px">
      ${j.parts.map((p,i)=>`<button class="${i===reader.part?"on":""}" data-part="${i}">${p.code} <span class="small" style="font-weight:500">${p.range}</span></button>`).join("")}</div>` : `<div style="height:16px"></div>`}
    <button class="glass part-pdf pressable" data-pdf="${esc(part.file)}" data-page="1" data-title="SUBAC ${esc(j.vol)} · ${part.code}">
      <span class="chip-ic" style="background:var(--red-100)">📄</span>
      <span class="grow"><b>${part.code} 원문 열기</b><span class="small muted" style="display:block">${part.range} · 앱 안에서 바로 열려요</span></span>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    ${j.note && reader.part===j.parts.length-1 ? `<p class="small muted" style="margin:10px 4px 0">${esc(j.note)}</p>` : ""}
    <div class="section-head" style="margin-top:22px"><h2>목차</h2><span class="small muted">${part.items.length}개 항목</span></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
      ${part.items.map(it=>reportCard(it, part)).join("")}
    </div>
    <p class="demo-note" style="margin-top:18px">핵심 요약은 Claude가 각 보고서의 요약·목차 페이지를 읽고 정리했어요. ‘AI 목차별 요약’은 누르는 순간 Claude가 원문을 읽고 새로 만들고, 만든 요약은 모든 학회원에게 함께 보여요.</p>`;
  inner.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeOverlay));
  inner.querySelectorAll("[data-part]").forEach(b => b.addEventListener("click", () => { reader.part = +b.dataset.part; reader.open = {}; renderReader(); $("#reader").scrollTo({top:0}); }));
  inner.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => { const k=b.dataset.toggle; reader.open[k] = !reader.open[k]; renderReader(); }));
  inner.querySelectorAll("[data-ai]").forEach(b => b.addEventListener("click", () => runSummary(b.dataset.ai)));
  inner.querySelectorAll("[data-ai-stop]").forEach(b => b.addEventListener("click", () => aiJobs[b.dataset.aiStop]?.ctl.abort()));
}
function reportCard(it, part){
  const open = !!reader.open[it.id];
  const saved = S.summaries.find(s=>s.id===it.id);
  const job = aiJobs[it.id];
  const aiText = job ? job.text : saved ? saved.text : "";
  return `<div class="glass report ${open?"open":""}">
    <button class="report-head" data-toggle="${it.id}" aria-expanded="${open}">
      <span class="page-badge num">p.${it.page}</span>
      <span class="grow"><span class="t">${esc(it.title)}</span>
        ${it.sub?`<span class="s">${esc(it.sub)}</span>`:""}
        ${it.authors?`<span class="s">${esc(it.team)} · ${esc(it.authors)}</span>`:""}</span>
      <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    ${open ? `<div class="report-body">
      <div class="sum-label">핵심 요약</div>
      <ul class="points">${it.points.map(p=>`<li>${esc(p)}</li>`).join("")}</ul>
      ${it.toc ? `<div class="sum-label">세부 목차</div><div class="toc-list">${it.toc.map(([t,pg])=> pg ? `<button data-pdf="${esc(part.file)}" data-page="${pg - (it.page - it.fp)}" data-title="${esc(it.title)}"><span>${esc(t)}</span><span class="num">${pg}</span></button>` : `<div><span>${esc(t)}</span></div>`).join("")}</div>` : ""}
      ${it.kind!=="intro" ? `<div class="ai-box">
        <div class="ai-head"><span class="ai-chip">✦ AI 목차별 요약</span>${saved && !job ? `<span class="small muted">${ago(saved.createdAt)} 생성</span>` : ""}</div>
        ${aiText ? `<div class="ai-out">${mdLite(aiText)}</div>` : job ? `<div class="ai-out muted"><span class="thinking">Claude가 보고서를 읽고 있어요</span></div>` : `<p class="small muted" style="margin:0">목차의 각 장을 2–3줄로 요약해 드려요.</p>`}
        ${job && job.err ? `<p class="form-err" style="margin:6px 0 0">${esc(job.err)}</p>` : ""}
        ${job && !job.done ? `<button class="btn btn-ghost btn-sm" data-ai-stop="${it.id}">그만 만들기</button>`
          : S.aiReady ? `<button class="btn ${aiText?"btn-ghost":"btn-primary"} btn-sm" data-ai="${it.id}">${aiText?"다시 요약하기":"AI로 목차별 요약 보기"}</button>`
          : `<p class="small muted" style="margin:0">${S.mode==="live" ? "AI 요약이 아직 설정되지 않았어요. 운영진에게 문의해 주세요." : "AI 요약은 학회 서버에 연결됐을 때 쓸 수 있어요."}</p>`}
      </div>` : ""}
      <button class="btn btn-ghost btn-sm" data-pdf="${esc(part.file)}" data-page="${it.fp}" data-title="${esc(it.title)}" style="width:100%">원문 ${it.page}쪽부터 읽기</button>
    </div>` : ""}
  </div>`;
}
function mdLite(t){
  return esc(t).split("\n").map(l=>{
    const s = l.trim(); if (!s) return "";
    if (/^#{1,3}\s/.test(s)) return `<h4>${s.replace(/^#{1,3}\s*/,"")}</h4>`;
    if (/^[-•*]\s/.test(s)) return `<li>${s.replace(/^[-•*]\s*/,"").replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")}</li>`;
    return `<p>${s.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")}</p>`;
  }).join("").replace(/(<li>.*?<\/li>)+/g, m=>`<ul>${m}</ul>`);
}
const aiJobs = {};
let textsPromise = null;
function loadTexts(){
  if (!textsPromise) textsPromise = fetch("journals/text.json").then(r => r.ok ? r.json() : {}).catch(() => { textsPromise = null; return {}; });
  return textsPromise;
}
function findItem(id){ for (const j of JOURNALS) for (const p of j.parts) for (const it of p.items) if (it.id===id) return {j,p,it}; return null; }
async function runSummary(id){
  const f = findItem(id); if (!f || !S.aiReady) return;
  const job = aiJobs[id] = {text:"", done:false, err:"", ctl:new AbortController()};
  reader.open[id] = true; renderReader();
  let last = 0;
  const ERR = "\u0000ERR:";
  const msgs = {refusal:"이 보고서는 AI가 요약하지 못했어요. 핵심 요약과 원문을 확인해 주세요.", rate_limited:"요청이 많아요. 잠시 후 다시 눌러 주세요.", unauthorized:"학회원 확인에 실패했어요. 앱을 다시 열어 주세요.", network:"인터넷 연결을 확인하고 다시 시도해 주세요."};
  try {
    const token = await B.idToken();
    const resp = await fetch("api/summarize", {method:"POST", headers:{"Content-Type":"application/json", "Authorization":"Bearer " + token}, body:JSON.stringify({id}), signal:job.ctl.signal});
    if (!resp.ok || !resp.body) {
      const j = await resp.json().catch(() => ({}));
      throw {code: j.error || (resp.status === 429 ? "rate_limited" : "server")};
    }
    const reader2 = resp.body.getReader(); const dec = new TextDecoder();
    let text = "";
    for (;;) {
      const {done, value} = await reader2.read();
      if (done) break;
      text += dec.decode(value, {stream:true});
      job.text = text.split(ERR)[0];
      const now = Date.now(); if (now - last > 120) { last = now; renderReader(); }
    }
    const k = text.indexOf(ERR);
    if (k >= 0) throw {code: text.slice(k + ERR.length).trim(), partial: text.slice(0, k)};
    job.text = text; job.done = true;
    if (text.trim()) { try { await B.saveSummary(id, text); } catch(e) {} }
    delete aiJobs[id];
  } catch(e){
    job.done = true;
    if (e && e.name === "AbortError") { if (!job.text) delete aiJobs[id]; }
    else { job.err = msgs[e && e.code] || "요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요."; if (e && e.code === "refusal") job.text = ""; }
  }
  renderReader();
}

/* ---------- 학회지 뷰어: 미리 만들어 둔 쪽 이미지(journals/pages)를 보여준다 ---------- */
// PDF를 휴대폰에서 직접 그리면 일부 학회지의 한글 글꼴이 깨져서, 모든 쪽을 고화질 이미지로 바꿔 두었다.
let pageInfoPromise = null;
function loadPageInfo(){
  pageInfoPromise ||= fetch("journals/pages.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch(e => { pageInfoPromise = null; throw e; });
  return pageInfoPromise;
}
const partKey = src => src.split("/").pop().replace(/\.pdf$/, "");
let pv = null;
function closePdf(){
  if (!pv) return;
  pv.io && pv.io.disconnect(); pv.el.remove(); pv = null;
  if (!$("#overlay").innerHTML) document.body.style.overflow = "";
}
async function openPdf(src, startPage, title){
  closePdf();
  const key = partKey(src);
  const el = document.createElement("div");
  el.className = "pdfv"; el.setAttribute("role","dialog"); el.setAttribute("aria-label", title || "학회지");
  el.innerHTML = `<div class="pdfv-bar">
      <button class="icon-btn glass" data-pv="close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="pdfv-title"><b>${esc(title || "학회지")}</b><span class="small muted" id="pvPage">불러오는 중…</span></div>
      <button class="icon-btn glass" data-pv="out" aria-label="축소"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg></button>
      <button class="icon-btn glass" data-pv="in" aria-label="확대"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></button>
    </div>
    <div class="pdfv-scroll" id="pvScroll"><div class="pdfv-status" id="pvStatus"><span class="thinking">학회지를 불러오고 있어요</span></div><div class="pdfv-pages" id="pvPages"></div></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  pv = {el, zoom:1, pages:[]};
  const me = pv;
  el.querySelector('[data-pv="close"]').addEventListener("click", closePdf);
  el.querySelector('[data-pv="in"]').addEventListener("click", () => setZoom(Math.min(3, me.zoom + .5)));
  el.querySelector('[data-pv="out"]').addEventListener("click", () => setZoom(Math.max(1, me.zoom - .5)));
  try {
    const info = await loadPageInfo();
    if (pv !== me) return;
    const heights = info[key];
    if (!heights) throw new Error("no pages");
    me.total = heights.length;
    $("#pvStatus").remove();
    const wrap = $("#pvPages");
    heights.forEach((h, k) => {
      const n = k + 1;
      const d = document.createElement("div"); d.className = "pdfv-page"; d.dataset.n = n;
      d.style.aspectRatio = `1000 / ${h}`;
      d.innerHTML = `<span class="pdfv-num">${n}</span><img alt="${n}쪽" decoding="async" data-src="journals/pages/${key}/${String(n).padStart(3, "0")}.webp">`;
      wrap.appendChild(d); me.pages.push(d);
    });
    const scroller = $("#pvScroll");
    me.io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const img = en.target.querySelector("img");
        if (img && !img.src) { img.src = img.dataset.src; img.addEventListener("load", () => en.target.classList.add("loaded"), {once:true}); }
        me.io.unobserve(en.target);
      }
    }, {root:scroller, rootMargin:"1600px 0px"});
    me.pages.forEach(p => me.io.observe(p));
    const target = me.pages[Math.min(Math.max(1, startPage||1), me.total) - 1];
    scroller.scrollTop = target.offsetTop - 8;
    scroller.addEventListener("scroll", () => updatePvPage(me), {passive:true});
    updatePvPage(me);
  } catch(e){
    if (pv !== me) return;
    const st = $("#pvStatus");
    if (st) st.innerHTML = `<b>학회지를 열지 못했어요</b><span class="small muted">인터넷 연결을 확인하고 다시 시도해 주세요.</span><button class="btn btn-primary btn-sm" id="pvRetry">다시 시도</button>`;
    const r = $("#pvRetry"); r && r.addEventListener("click", () => openPdf(src, startPage, title));
  }
}
function updatePvPage(me){
  const sc = $("#pvScroll"); if (!sc || !me.total) return;
  const mid = sc.scrollTop + sc.clientHeight/3;
  let cur = 1; for (const p of me.pages){ if (p.offsetTop <= mid) cur = +p.dataset.n; else break; }
  const el = $("#pvPage"); if (el) el.textContent = `${cur} / ${me.total}쪽`;
}
function setZoom(z){
  const me = pv; if (!me || !me.total || z === me.zoom) return;
  const sc = $("#pvScroll"); const rel = sc.scrollTop / Math.max(1, sc.scrollHeight);
  me.zoom = z; const pg = $("#pvPages"); pg.style.width = (z*100) + "%"; pg.style.maxWidth = window.innerWidth >= 760 ? (760*z) + "px" : "none";
  sc.scrollTop = rel * sc.scrollHeight;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-pdf]"); if (!b) return;
  e.preventDefault(); openPdf(b.dataset.pdf, +b.dataset.page || 1, b.dataset.title);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && pv) { e.stopImmediatePropagation(); closePdf(); } }, true);

function closeOverlay(){ $("#overlay").innerHTML = ""; document.body.style.overflow = ""; }
document.addEventListener("keydown", e => { if (e.key==="Escape" && $("#overlay").innerHTML) closeOverlay(); });

/* ---------- sheets ---------- */
function sheet(html, onMount){
  $("#overlay").innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog"><div class="grabber"></div>${html}</div>`;
  $("#overlay").querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeOverlay));
  onMount && onMount($("#overlay .sheet"));
}
function addPairSheet(){
  sheet(`<h2>짝선짝후 등록</h2><p class="muted small" style="margin:0">선배와 후배 이름을 입력하면 랭킹에 바로 올라가요.</p>
    <form class="form" id="pairForm">
      <div class="field"><label for="ps">선배 이름</label><input id="ps" maxlength="10" required placeholder="예: 김수박"></div>
      <div class="field"><label for="pj">후배 이름</label><input id="pj" maxlength="10" required placeholder="예: 이씨앗"></div>
      <div class="form-err" id="perr"></div>
      <button class="btn btn-primary" type="submit">등록하기</button>
    </form>`, el => {
      $("#ps").focus();
      $("#pairForm").addEventListener("submit", async e => {
        e.preventDefault();
        const senior = $("#ps").value.trim(), junior = $("#pj").value.trim();
        if (!senior || !junior){ $("#perr").textContent = "선배와 후배 이름을 모두 입력해 주세요."; return; }
        if (S.pairs.some(p=>p.senior===senior && p.junior===junior)){ $("#perr").textContent = "이미 등록된 짝이에요."; return; }
        e.submitter && (e.submitter.disabled = true);
        try { await addDoc("pairs", {senior, junior, createdAt:Date.now()}); closeOverlay(); toast(`${senior} × ${junior} 짝을 등록했어요`); }
        catch(err){ $("#perr").textContent = "저장하지 못했어요. 이 앱에 기록할 권한이 있는지 확인해 주세요."; e.submitter && (e.submitter.disabled=false); }
      });
  });
}
function addActivitySheet(){
  if (!S.pairs.length){ addPairSheet(); toast("먼저 짝선짝후를 등록해 주세요"); return; }
  const today = new Date(); const iso = new Date(today - today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  let type = "meal";
  const sorted = [...S.pairs].sort((a,b)=> (a.senior+a.junior).localeCompare(b.senior+b.junior, "ko"));
  sheet(`<h2>활동 기록하기</h2><p class="muted small" style="margin:0">기록하는 순간 모든 학회원의 랭킹이 바뀌어요.</p>
    <form class="form" id="actForm">
      <div class="field"><label for="ap">누구의 활동인가요?</label><select id="ap">${sorted.map(p=>`<option value="${p.id}">${esc(p.senior)} 선배 × ${esc(p.junior)} 후배</option>`).join("")}</select></div>
      <div class="field"><label>무엇을 했나요?</label><div class="type-grid" id="types">${Object.entries(TYPES).map(([k,t])=>`<button type="button" class="type-opt ${k===type?"on":""}" data-type="${k}"><span class="e">${t.e}</span>${t.label}<span class="p">+${t.p}점</span></button>`).join("")}</div></div>
      <div class="field"><label for="ad">날짜</label><input id="ad" type="date" value="${iso}" max="${iso}"></div>
      <div class="field"><label for="an">한 줄 메모 (선택)</label><input id="an" maxlength="40" placeholder="예: 율전 학식에서 돈까스"></div>
      <div class="form-err" id="aerr"></div>
      <button class="btn btn-red" type="submit">기록하기</button>
    </form>`, el => {
      el.querySelectorAll("[data-type]").forEach(b => b.addEventListener("click", () => {
        type = b.dataset.type; el.querySelectorAll("[data-type]").forEach(x => x.classList.toggle("on", x===b));
      }));
      $("#actForm").addEventListener("submit", async e => {
        e.preventDefault();
        const pairId = $("#ap").value;
        e.submitter && (e.submitter.disabled = true);
        try {
          await addDoc("activities", {pairId, type, date:$("#ad").value, note:$("#an").value.trim(), by:S.profile.key, byName:S.profile.nickname, createdAt:Date.now()});
          closeOverlay(); toast(`${TYPES[type].label} +${TYPES[type].p}점 기록했어요`);
          if (S.route !== "pairs") go("pairs");
        } catch(err){ $("#aerr").textContent = "저장하지 못했어요. 이 앱에 기록할 권한이 있는지 확인해 주세요."; e.submitter && (e.submitter.disabled=false); }
      });
  });
}
/* ---------- bindings ---------- */
function bindView(){
  const v = $("#view");
  v.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  v.querySelectorAll("[data-open-issue]").forEach(b => b.addEventListener("click", () => openIssue(b.dataset.openIssue)));
  v.querySelectorAll("[data-ptab]").forEach(b => b.addEventListener("click", () => { S.pairTab = b.dataset.ptab; render(); }));
  v.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a==="add-pair") addPairSheet();
    else if (a==="add-activity") addActivitySheet();
    else if (a==="start") startGame();
  }));
  v.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!b.classList.contains("arm")){ b.classList.add("arm"); b.textContent = "정말 삭제"; setTimeout(()=>{ b.classList.remove("arm"); b.textContent="삭제"; }, 2500); return; }
    try { await delDoc("activities", b.dataset.del); toast("기록을 삭제했어요"); } catch(e){ toast("삭제하지 못했어요"); }
  }));
  const stage = $("#stage");
  if (stage) stage.addEventListener("pointerdown", e => { e.preventDefault(); bite(e); });
}


/* ---------- 최초 닉네임 입력 (가입 대신) ---------- */
function showOnboarding(){
  closeOverlay();
  const el = document.createElement("div");
  el.className = "onboard"; el.id = "onboard";
  el.innerHTML = `<div class="onboard-inner">
    <svg class="onboard-logo" aria-hidden="true"><use href="#logo"/></svg>
    <h1 style="margin:8px 0 6px">SUBAC에 오신 걸<br>환영해요</h1>
    <p class="muted" style="margin:0 4px 22px">닉네임과 PIN 4자리만 정하면 바로 시작해요.<br>홈 인사말, 수박게임 순위에 이 닉네임이 쓰여요.</p>
    <form class="form glass onboard-card" id="obForm" autocomplete="off">
      <div class="field"><label for="obNick">닉네임</label><input id="obNick" maxlength="12" placeholder="예: 수박러버 (2~12자)" autocomplete="nickname" enterkeyhint="next"></div>
      <div class="field"><label for="obPin">PIN 4자리</label><input id="obPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="숫자 4자리" autocomplete="off" enterkeyhint="go"></div>
      <p class="small muted" style="margin:-4px 2px 0">다른 휴대폰이나 홈 화면에 설치한 앱에서 같은 닉네임과 PIN을 넣으면 기록이 그대로 이어져요.</p>
      <div class="form-err" id="obErr"></div>
      <button class="btn btn-primary" type="submit" id="obBtn">시작하기</button>
    </form>
    ${S.mode==="local" ? `<p class="small muted" style="margin-top:14px">지금은 데모 모드예요. 기록이 이 기기에만 저장돼요.</p>` : ""}
  </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  const nick = $("#obNick"), pin = $("#obPin"), err = $("#obErr"), btn = $("#obBtn");
  setTimeout(() => nick.focus(), 50);
  pin.addEventListener("input", () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); });
  $("#obForm").addEventListener("submit", async e => {
    e.preventDefault();
    const n = nick.value.trim(), p = pin.value;
    if (n.length < 2) { err.textContent = "닉네임은 2자 이상으로 정해 주세요."; nick.focus(); return; }
    if (!/^\d{4}$/.test(p)) { err.textContent = "PIN은 숫자 4자리로 입력해 주세요."; pin.focus(); return; }
    err.textContent = ""; btn.disabled = true; btn.textContent = "확인하는 중…";
    const r = await B.register(n, p);
    if (!r.ok) {
      err.textContent = r.reason === "pin" ? "이미 쓰고 있는 닉네임이에요. 본인이라면 PIN을 다시 확인해 주세요."
        : r.reason === "invalid" ? "닉네임은 2~12자, PIN은 숫자 4자리예요."
        : "연결이 불안정해요. 잠시 후 다시 시도해 주세요.";
      btn.disabled = false; btn.textContent = "시작하기"; return;
    }
    S.profile = r.profile;
    el.remove(); document.body.style.overflow = "";
    setMode(S.mode);
    startData(); render();
    toast(r.created ? `${r.profile.nickname}님, 환영해요` : `${r.profile.nickname}님, 다시 만나서 반가워요`);
  });
}

/* ---------- 내 정보 ---------- */
function profileSheet(){
  if (!S.profile) { showOnboarding(); return; }
  const me = S.scores.find(s => s.id === S.profile.key);
  const mine = S.activities.filter(a => a.by === S.profile.key).length;
  sheet(`<h2>${esc(S.profile.nickname)}님</h2>
    <p class="muted small" style="margin:0">${S.mode==="live" ? "학회 서버와 실시간으로 연결돼 있어요." : "데모 모드: 기록이 이 기기에만 저장돼요."}</p>
    <div class="glass list" style="margin-top:16px;padding:4px">
      <div class="row"><span class="grow">수박게임 최고 기록</span><b>${me ? me.best + "통" : "아직 없음"}</b></div>
      <div class="row"><span class="grow">내가 남긴 활동 기록</span><b>${mine}건</b></div>
    </div>
    <p class="small muted" style="margin:14px 2px">다른 기기에서도 같은 닉네임과 PIN을 입력하면 이어서 쓸 수 있어요.</p>
    <div class="form" style="margin-top:4px">
      ${isStandalone() ? "" : `<button class="btn btn-ghost" id="psInstall">홈 화면에 앱 설치하기</button>`}
      <button class="btn btn-ghost" id="psLogout">이 기기에서 로그아웃</button>
    </div>`, el => {
      const lo = el.querySelector("#psLogout");
      lo.addEventListener("click", () => {
        if (!lo.classList.contains("arm")) { lo.classList.add("arm"); lo.textContent = "한 번 더 누르면 로그아웃돼요"; setTimeout(() => { lo.classList.remove("arm"); lo.textContent = "이 기기에서 로그아웃"; }, 3000); return; }
        B.logout(); S.profile = null; unsubs.forEach(f => f()); unsubs = [];
        closeOverlay(); setMode(S.mode); showOnboarding();
      });
      const ins = el.querySelector("#psInstall"); ins && ins.addEventListener("click", () => { closeOverlay(); installFlow(); });
  });
}
document.getElementById("syncPill").addEventListener("click", profileSheet);

/* ---------- 홈 화면 설치 ---------- */
let installEvt = null;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.route === "home") render(); });
window.addEventListener("appinstalled", () => { installEvt = null; toast("앱을 설치했어요. 홈 화면에서 열어 보세요"); render(); });
function installDismissed(){ try { return localStorage.getItem("subac-install-dismissed") === "1"; } catch(e) { return false; } }
function installBanner(){
  if (isStandalone() || installDismissed()) return "";
  if (!installEvt && !isIOS() && !/android/i.test(navigator.userAgent)) return "";
  return `<div class="glass install-banner">
    <svg aria-hidden="true"><use href="#logo"/></svg>
    <div class="grow"><b>수박 앱을 홈 화면에 설치하세요</b><span class="small muted">${isIOS() ? "Safari 공유 버튼 → ‘홈 화면에 추가’" : "한 번 누르면 설치돼요"}</span></div>
    <button class="btn btn-primary btn-sm" data-install>설치</button>
    <button class="icon-btn" data-install-x aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>`;
}
async function installFlow(){
  if (installEvt) { installEvt.prompt(); const c = await installEvt.userChoice.catch(() => null); installEvt = null; if (c && c.outcome === "accepted") return; render(); return; }
  const ios = isIOS();
  sheet(`<h2>홈 화면에 설치하기</h2>
    <ol class="steps">
      ${ios ? `<li><b>Safari</b>로 이 페이지를 열어 주세요. (카카오톡 안에서 열었다면 오른쪽 아래 ⋯ → ‘다른 브라우저로 열기’)</li>
      <li>아래쪽 <b>공유 버튼</b>(네모에서 화살표가 나오는 모양)을 누르세요.</li>
      <li><b>‘홈 화면에 추가’</b>를 누르고 오른쪽 위 <b>추가</b>를 누르면 끝이에요.</li>`
      : `<li><b>Chrome</b>으로 이 페이지를 열어 주세요. (카카오톡 안에서 열었다면 ⋮ → ‘다른 브라우저로 열기’)</li>
      <li>오른쪽 위 <b>⋮</b> 메뉴를 누르세요.</li>
      <li><b>‘앱 설치’</b> 또는 <b>‘홈 화면에 추가’</b>를 누르면 끝이에요.</li>`}
    </ol>
    <p class="small muted">설치한 앱을 처음 열면 닉네임과 PIN을 한 번 더 입력해 주세요. 기록은 그대로 이어져요.</p>
    <button class="btn btn-primary" data-close style="margin-top:8px">확인</button>`);
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-install]")) { installFlow(); }
  else if (e.target.closest("[data-install-x]")) { try { localStorage.setItem("subac-install-dismissed", "1"); } catch(err) {} render(); }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW", e)));
}

// refresh relative times and fade rank deltas
setInterval(() => { if (S.route==="pairs" && !$("#overlay").innerHTML && Date.now() > S.deltaUntil && Object.keys(S.deltas).length){ S.deltas={}; S.flashIds=new Set(); render(); } }, 2000);

readHash();
boot();
