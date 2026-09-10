/* ═══════════════════════════════════════════════════════════════
   عامل الخدمة — يجعل التطبيق يفتح ويعمل بلا إنترنت
   ───────────────────────────────────────────────────────────────
   الاستراتيجية مقسومة عمداً:

   • ملفات الكود (html / js / css / manifest) → الشبكة أولاً.
     كانت «الذاكرة أولاً» فكان التحديث يصل الخادم ولا يظهر على
     الجهاز إلا في الفتحة التالية — ومع 18 مستخدماً على 18 هاتفاً
     كان معناه أن نصفهم يشتغل على نسخة والنصف الآخر على أخرى.
     الآن: إن كانت هناك شبكة يأخذ الأحدث، وإن انقطعت يعمل من الذاكرة.

   • الصور والخطوط → الذاكرة أولاً. لا تتغيّر، وتحميلها من الشبكة
     في كل مرة يهدر باقة السائق ويبطئ الشاشة.
   ═══════════════════════════════════════════════════════════════ */
const V = "si-v1.6.0";

const SHELL = [
  "./", "./index.html", "./admin.html", "./report.html",
  "./styles.css", "./config.js", "./lib.js", "./app.js", "./admin.js", "./report.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./icon-512-maskable.png", "./apple-touch-icon.png",
  /* شعارات العلامات — تُخزَّن ليعمل التطبيق والتقرير بلا إنترنت */
  "./logo-sevenicons.png", "./brand-wahed.png", "./brand-shawarma.png", "./brand-karak.png"
];

/* ملف كود يجب أن يكون أحدث ما أمكن */
const isCode = url =>
  url.origin === location.origin &&
  /\.(html|js|css|webmanifest)$/i.test(url.pathname) || url.pathname.endsWith("/");

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => c.addAll(SHELL))
      .catch(() => {})            /* ملف واحد ناقص يجب ألا يُفشل التثبيت كله */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: "window" }))
    .then(cs => cs.forEach(c => c.postMessage({ type: "SW_ACTIVATED", version: V })))
  );
});

/* يسمح للصفحة بطلب التفعيل الفوري عند ضغط المستخدم على «حدّث» */
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  /* نداءات Supabase وروابط الصور الموقّعة: الشبكة فقط — لا تُخزَّن أبداً */
  if (url.hostname.endsWith("supabase.co")) return;

  /* ── ملفات الكود: الشبكة أولاً بمهلة قصيرة، والذاكرة شبكة أمان ── */
  if (isCode(url)) {
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);   /* شبكة بطيئة ≠ شاشة معلّقة */
        const res = await fetch(e.request, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      } catch (_) {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        /* تنقّل بلا شبكة وبلا نسخة: أعِد الصفحة الرئيسية المخزّنة */
        if (e.request.mode === "navigate") {
          const idx = await caches.match("./index.html");
          if (idx) return idx;
        }
        throw _;
      }
    })());
    return;
  }

  /* ── صور وخطوط ومكتبات: الذاكرة أولاً مع تحديث صامت في الخلفية ── */
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && (url.origin === location.origin
            || url.hostname.includes("fonts.g") || url.hostname.includes("jsdelivr"))) {
          const copy = res.clone();
          caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
