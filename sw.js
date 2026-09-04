/* عامل الخدمة — يجعل التطبيق يفتح ويعمل بلا إنترنت */
const V = "si-v1.0.0";
const SHELL = [
  "./", "./index.html", "./admin.html", "./report.html",
  "./styles.css", "./config.js", "./lib.js", "./app.js", "./admin.js", "./report.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // نداءات Supabase وروابط الصور: الشبكة فقط — لا تُخزَّن
  if (url.hostname.endsWith("supabase.co")) return;

  // ملفات التطبيق والخطوط: من الذاكرة أولاً ثم تحديث في الخلفية
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && (url.origin === location.origin
            || url.hostname.includes("fonts.g") || url.hostname.includes("jsdelivr"))) {
          const copy = res.clone();
          caches.open(V).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
