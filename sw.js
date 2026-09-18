/* ═══════════════════════════════════════════════════════════════
   عامل خدمة الصيانة — نطاقه /check/maint/ وحده
   ───────────────────────────────────────────────────────────────
   لماذا عامل خدمة منفصل؟

   عامل التشييك في /check/ ونطاقه يشمل هذا المجلد، لكن المتصفح
   يعطي الأولوية لأضيق نطاق مطابق. فصفحات الصيانة يخدمها هذا
   الملف، وصفحات التشييك يخدمها ذاك — ولا يتدخّل أحدهما في
   احتياطي الآخر. العطل الذي جعل الصيانة تفتح التشييك كان بالضبط
   من هذا التداخل.

   الأصول المشتركة (config.js · lib.js · الأيقونات) تبقى نسخة
   واحدة في المجلد الأب — لأن نسختين من config.js تعني مفتاحين
   يفترقان يوماً ما. طلباتها خارج نطاقنا فيخدمها عامل التشييك،
   وهو يخدمها «الشبكة أولاً» فتصل التحديثات.
   ═══════════════════════════════════════════════════════════════ */
const V = "si-maint-v1.9.2";

const SHELL = [
  "./", "./index.html", "./maint.js", "./manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      /* ملفاً ملفاً: addAll كلٌّ أو لا شيء، وملف ناقص يُفرغ الذاكرة */
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V && k.startsWith("si-maint-"))
                              .map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  /* نداءات Supabase والروابط الموقّعة: الشبكة فقط، لا تُخزَّن */
  if (url.hostname.endsWith("supabase.co")) return;

  /* الشبكة أولاً بمهلة قصيرة، والذاكرة شبكة أمان */
  e.respondWith((async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(e.request, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      /* تنقّل بلا شبكة: أعِد صفحة الصيانة المخزَّنة — لا صفحة أخرى */
      if (e.request.mode === "navigate") {
        const page = await caches.match("./index.html");
        if (page) return page;
      }
      throw _;
    }
  })());
});
