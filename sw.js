// SUBAC 서비스 워커: 앱 화면은 오프라인에서도 열리고, 새 버전은 다음 실행 때 반영된다.
const VERSION = "subac-v3";
const SHELL = [
  "./", "index.html", "app.js", "backend.js", "journals.js", "firebase-config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "journals/pages.json",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req){
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch(e) {
    return (await cache.match(req)) || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
  }
}
async function cacheFirst(req){
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // PDF(부분 요청)와 API, Firebase 실시간 통신은 그대로 네트워크로
  if (url.origin === location.origin && (url.pathname.includes("/api/") || url.pathname.endsWith(".pdf"))) return;
  if (url.hostname.endsWith("googleapis.com") && !url.hostname.startsWith("fonts.")) return;
  if (url.origin === location.origin) {
    // 학회지 쪽 이미지와 아이콘은 바뀌지 않으므로 한 번 본 쪽은 오프라인에서도 열린다
    if (url.pathname.includes("/journals/pages/") || url.pathname.includes("/icons/")) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(networkFirst(req));
    return;
  }
  // 글꼴, Firebase SDK 스크립트
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "www.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
});
