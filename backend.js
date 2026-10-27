// SUBAC 데이터 계층: firebase-config.js가 채워져 있으면 Firebase(실시간 공유),
// 비어 있으면 이 기기 안에서만 동작하는 데모 모드로 실행된다.
import { firebaseConfig } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const PROFILE_KEY = "subac-profile";

let mode = "local";
let fs = null, db = null, auth = null, authMod = null, appMod = null;
let uid = null;

// ---- 공통 유틸 ----
export const nickKey = nick => encodeURIComponent(nick.normalize("NFC").trim().toLowerCase()).replace(/[.%]/g, "_").slice(0, 120);

async function sha256(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const pinHash = (key, pin) => sha256(`subac:${key}:${pin}`);

function readProfile(){ try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch(e) { return null; } }
function writeProfile(p){ try { p ? localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) : localStorage.removeItem(PROFILE_KEY); } catch(e) {} }

// ---- 데모(로컬) 모드 저장소 ----
const LOCAL_KEY = "subac-local-data";
const local = (() => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null") || {}; } catch(e) { return {}; } })();
for (const k of ["pairs","activities","scores","summaries"]) local[k] ||= [];
const listeners = {};
function saveLocal(){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch(e) {} }
function emitLocal(coll){
  let rows = [...local[coll]];
  if (coll === "scores") rows.sort((a, b) => b.best - a.best);
  (listeners[coll] || []).forEach(cb => cb(rows));
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- 초기화 ----
export async function init(){
  if (!firebaseConfig || !firebaseConfig.apiKey) { mode = "local"; return {mode, profile: readProfile()}; }
  try {
    [appMod, authMod, fs] = await Promise.all([
      import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js"),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    try {
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch(e) { db = fs.getFirestore(app); }
    auth = authMod.getAuth(app);
    // 개발용: 주소에 ?emulator=1 을 붙이면 로컬 Firebase 에뮬레이터에 연결
    if (new URLSearchParams(location.search).get("emulator") === "1") {
      authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true});
      fs.connectFirestoreEmulator(db, "127.0.0.1", 8085);
    }
    await new Promise(res => { const off = authMod.onAuthStateChanged(auth, u => { uid = u ? u.uid : null; off(); res(); }); });
    if (!uid) { const cred = await authMod.signInAnonymously(auth); uid = cred.user.uid; }
    mode = "live";
    // 이 기기의 프로필이 아직 서버에서도 내 것인지 확인 (다른 기기에서 가져갔으면 로그아웃)
    let profile = readProfile();
    if (profile) {
      const ref = fs.doc(db, "nicknames", profile.key);
      const snap = await fs.getDocFromServer(ref).catch(() => fs.getDoc(ref).catch(() => null));
      if (snap && snap.exists() && snap.data().uid !== uid) { writeProfile(null); profile = null; }
    }
    return {mode, profile};
  } catch(e) {
    console.warn("Firebase 연결 실패, 데모 모드로 전환", e);
    mode = "local";
    return {mode, profile: readProfile(), error: true};
  }
}
export const getMode = () => mode;

// ---- 최초 닉네임 등록 / 다른 기기에서 이어서 쓰기 ----
// 반환: {ok:true, profile, created} 또는 {ok:false, reason:"pin"|"invalid"|"network"}
export async function register(nickname, pin){
  nickname = nickname.normalize("NFC").trim();
  if (nickname.length < 2 || nickname.length > 12 || !/^\d{4}$/.test(pin)) return {ok:false, reason:"invalid"};
  const key = nickKey(nickname);
  const h = await pinHash(key, pin);
  if (mode !== "live") {
    const profile = {key, nickname};
    writeProfile(profile);
    return {ok:true, profile, created:true};
  }
  try {
    const nickRef = fs.doc(db, "nicknames", key);
    const snap = await fs.getDoc(nickRef);
    const batch = fs.writeBatch(db);
    let created = false;
    if (!snap.exists()) {
      batch.set(nickRef, {nickname, uid, createdAt: Date.now()});
      batch.set(fs.doc(db, "pins", key), {pinHash: h, claimBy: uid});
      created = true;
    } else if (snap.data().uid !== uid) {
      // 이미 있는 닉네임: PIN이 맞아야 pins 갱신이 허용되고, 그래야 nicknames 소유권을 옮길 수 있다
      batch.update(fs.doc(db, "pins", key), {pinHash: h, claimBy: uid});
      batch.update(nickRef, {uid});
      nickname = snap.data().nickname;
    }
    batch.set(fs.doc(db, "users", uid), {key, nickname});
    await batch.commit();
    const profile = {key, nickname};
    writeProfile(profile);
    return {ok:true, profile, created};
  } catch(e) {
    if (e && e.code === "permission-denied") return {ok:false, reason:"pin"};
    console.warn(e);
    return {ok:false, reason:"network"};
  }
}
export function logout(){ writeProfile(null); }

// 다른 기기가 같은 닉네임을 PIN으로 가져가면 이 기기는 로그아웃시킨다
export function watchOwnership(profile, onLost){
  if (mode !== "live" || !profile) return () => {};
  return fs.onSnapshot(fs.doc(db, "nicknames", profile.key), snap => {
    if (snap.exists() && snap.data().uid !== uid) { writeProfile(null); onLost(); }
  }, () => {});
}

// ---- 구독 ----
export function subscribe(coll, cb){
  if (mode !== "live") {
    (listeners[coll] ||= []).push(cb);
    setTimeout(() => emitLocal(coll), 0);
    return () => { listeners[coll] = listeners[coll].filter(f => f !== cb); };
  }
  let q = fs.collection(db, coll);
  if (coll === "scores") q = fs.query(q, fs.orderBy("best", "desc"), fs.limit(50));
  return fs.onSnapshot(q, snap => cb(snap.docs.map(d => ({id: d.id, ...d.data()}))), err => console.warn(coll, err));
}

// ---- 쓰기 ----
export async function add(coll, data){
  if (mode !== "live") { local[coll].push({id: newId(), ...data}); saveLocal(); emitLocal(coll); return; }
  await fs.addDoc(fs.collection(db, coll), data);
}
export async function remove(coll, id){
  if (mode !== "live") { local[coll] = local[coll].filter(d => d.id !== id); saveLocal(); emitLocal(coll); return; }
  await fs.deleteDoc(fs.doc(db, coll, id));
}
export async function saveSummary(id, text){
  const row = {text, createdAt: Date.now()};
  if (mode !== "live") { local.summaries = local.summaries.filter(s => s.id !== id).concat({id, ...row}); saveLocal(); emitLocal("summaries"); return; }
  await fs.setDoc(fs.doc(db, "summaries", id), row);
}

// 한 사람당 한 줄: 문서 id = 닉네임 키, 최고 기록만 남긴다
export async function submitScore(profile, count){
  const now = Date.now();
  if (mode !== "live") {
    const cur = local.scores.find(s => s.id === profile.key);
    const isBest = !cur || count > cur.best;
    if (cur) { cur.plays = (cur.plays || 0) + 1; cur.last = count; if (isBest) { cur.best = count; cur.bestAt = now; } }
    else local.scores.push({id: profile.key, nickname: profile.nickname, best: count, bestAt: now, last: count, plays: 1});
    saveLocal(); emitLocal("scores");
    return {isBest, prevBest: cur && !isBest ? cur.best : null};
  }
  const ref = fs.doc(db, "scores", profile.key);
  return fs.runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : null;
    const isBest = !cur || count > cur.best;
    tx.set(ref, {
      nickname: profile.nickname,
      best: isBest ? count : cur.best,
      bestAt: isBest ? now : cur.bestAt,
      last: count,
      plays: (cur?.plays || 0) + 1,
    });
    return {isBest, prevBest: cur && !isBest ? cur.best : null};
  });
}

// AI 요약 API 호출용 토큰
export async function idToken(){
  if (mode !== "live" || !auth || !auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}
