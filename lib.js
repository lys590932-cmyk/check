/* ═══════════════════════════════════════════════════════════
   المكتبة المشتركة — Supabase، الموقع، الكاميرا، العمل بلا إنترنت
   ═══════════════════════════════════════════════════════════ */
(function () {
  const C = window.CONFIG;

  /* ── عميل Supabase ── */
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "si_auth" }
  });

  /* ── أدوات عامة ── */
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* يوم العمل بتوقيت الكويت — ما قبل DAY_START_HOUR يُحتسب على اليوم السابق */
  function businessDate(d) {
    const now = d || new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: C.TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hour12: false
    }).formatToParts(now);
    const g = t => parts.find(p => p.type === t).value;
    let y = +g("year"), m = +g("month"), day = +g("day"), h = +g("hour");
    const dt = new Date(Date.UTC(y, m - 1, day));
    if (h < C.DAY_START_HOUR) dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  }

  const fmtTime = ts => new Intl.DateTimeFormat("ar-KW", {
    timeZone: C.TZ, dateStyle: "medium", timeStyle: "short"
  }).format(new Date(ts));

  const fmtDate = d => new Intl.DateTimeFormat("ar-KW", {
    timeZone: C.TZ, dateStyle: "medium"
  }).format(new Date(d + "T12:00:00Z"));

  const SHIFT_AR = { open: "الفتح", mid: "الذروة", close: "الإغلاق" };
  const BAND_AR = { green: "ضمن المستهدف", amber: "يحتاج متابعة", red: "دون المستهدف" };

  /* ── الموقع الجغرافي ── */
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("الجهاز لا يدعم تحديد الموقع"));
      navigator.geolocation.getCurrentPosition(
        p => resolve({
          lat: p.coords.latitude, lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy), at: p.timestamp
        }),
        e => reject(new Error(
          e.code === 1 ? "الموقع مرفوض — فعّل صلاحية الموقع للتطبيق من إعدادات الجهاز"
            : e.code === 3 ? "تعذّر تحديد الموقع — اخرج لمكان مفتوح وأعد المحاولة"
              : "تعذّر تحديد الموقع")),
        { enableHighAccuracy: true, timeout: C.GPS_TIMEOUT_MS, maximumAge: 0 }
      );
    });
  }

  /* المسافة بالمتر — نفس معادلة الخادم */
  function distanceM(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
  }

  /* ── الكاميرا: ضغط + ختم محروق في الصورة ── */
  function processPhoto(file, stamp) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
      fr.onload = ev => {
        const img = new Image();
        img.onerror = () => reject(new Error("ملف الصورة غير صالح"));
        img.onload = () => {
          const max = C.PHOTO_MAX_PX;
          const r = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * r), h = Math.round(img.height * r);
          const cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          const ctx = cv.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);

          /* شريط الختم أسفل الصورة */
          const pad = Math.round(w * 0.025);
          const fs = Math.max(11, Math.round(w * 0.028));
          const lines = stamp.filter(Boolean);
          const barH = pad * 2 + lines.length * (fs * 1.45);
          ctx.fillStyle = "rgba(6,26,22,.82)";
          ctx.fillRect(0, h - barH, w, barH);
          ctx.fillStyle = "#fff";
          ctx.textAlign = "right";
          ctx.textBaseline = "top";
          ctx.direction = "rtl";
          lines.forEach((t, i) => {
            ctx.font = (i === 0 ? "bold " : "") + fs + "px system-ui, sans-serif";
            ctx.fillText(t, w - pad, h - barH + pad + i * (fs * 1.45));
          });

          cv.toBlob(b => b ? resolve(b) : reject(new Error("تعذّر إنشاء الصورة")),
            "image/jpeg", C.PHOTO_QUALITY);
        };
        img.src = ev.target.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ── تخزين محلي: المسودات + طابور الصور ── */
  const DRAFT_KEY = id => "si_draft_" + id;
  const draft = {
    save(id, data) { try { localStorage.setItem(DRAFT_KEY(id), JSON.stringify(data)); } catch (_) { } },
    load(id) { try { return JSON.parse(localStorage.getItem(DRAFT_KEY(id)) || "null"); } catch (_) { return null; } },
    clear(id) { try { localStorage.removeItem(DRAFT_KEY(id)); } catch (_) { } },
    list() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("si_draft_")) out.push(k.slice(9));
      }
      return out;
    }
  };

  /* IndexedDB لصور غير مرفوعة */
  let _db = null;
  function idb() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open("si_media", 1);
      rq.onupgradeneeded = () => {
        if (!rq.result.objectStoreNames.contains("queue"))
          rq.result.createObjectStore("queue", { keyPath: "key" });
      };
      rq.onsuccess = () => { _db = rq.result; res(_db); };
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbPut(rec) {
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction("queue", "readwrite");
      tx.objectStore("queue").put(rec);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function idbAll() {
    const d = await idb();
    return new Promise((res, rej) => {
      const rq = d.transaction("queue", "readonly").objectStore("queue").getAll();
      rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
    });
  }
  async function idbDel(key) {
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction("queue", "readwrite");
      tx.objectStore("queue").delete(key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }

  /* ── رفع الصور ── */
  async function uploadPhoto(path, blob) {
    const { error } = await sb.storage.from("evidence")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    return path;
  }

  /* يرفع ما تبقّى في الطابور — يُستدعى عند عودة الشبكة */
  async function flushQueue() {
    if (!navigator.onLine) return { done: 0, left: 0 };
    const all = await idbAll();
    let done = 0;
    for (const rec of all) {
      try { await uploadPhoto(rec.path, rec.blob); await idbDel(rec.key); done++; }
      catch (_) { /* يبقى في الطابور */ }
    }
    return { done, left: (await idbAll()).length };
  }

  /* رابط موقّع لعرض صورة */
  const signedCache = new Map();
  async function signedUrl(path, secs) {
    if (!path) return null;
    const hit = signedCache.get(path);
    if (hit && hit.exp > Date.now()) return hit.url;
    const { data, error } = await sb.storage.from("evidence")
      .createSignedUrl(path, secs || 3600);
    if (error) return null;
    signedCache.set(path, { url: data.signedUrl, exp: Date.now() + (secs || 3600) * 900 });
    return data.signedUrl;
  }

  /* ── الجلسة والدور ── */
  let ME = null;
  async function me(force) {
    if (ME && !force) return ME;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return (ME = null);
    const { data, error } = await sb.from("profiles")
      .select("id, full_name, role, branch_id, phone, active").eq("id", user.id).single();
    if (error || !data || !data.active) return (ME = null);
    ME = { ...data, email: user.email };
    return ME;
  }

  async function requireAuth(redirect) {
    const u = await me();
    if (!u) { location.replace(redirect || "index.html"); return null; }
    return u;
  }

  /* ── الكتالوج (يُخزَّن محلياً ليعمل بلا إنترنت) ── */
  const CAT_KEY = "si_catalog_v1";
  async function catalog(force) {
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(CAT_KEY) || "null");
        if (c && Date.now() - c.at < 6 * 3600e3) return c.data;
      } catch (_) { }
    }
    const [br, tp, se, it, bd] = await Promise.all([
      sb.from("branches").select("*").eq("active", true).order("sort"),
      sb.from("templates").select("*").eq("active", true),
      sb.from("sections").select("*").order("sort"),
      sb.from("items").select("*").eq("active", true).order("sort"),
      sb.from("brands").select("*").order("sort")
    ]);
    if (br.error) throw br.error;
    const data = {
      branches: br.data, templates: tp.data, sections: se.data,
      items: it.data, brands: bd.data || []
    };
    try { localStorage.setItem(CAT_KEY, JSON.stringify({ at: Date.now(), data })); } catch (_) { }
    return data;
  }

  /* بنود قالب معيّن لعلامة معيّنة، مجمّعة بالمحاور */
  function itemsFor(cat, templateKey, brandCode) {
    const secs = cat.sections.filter(s => s.template_key === templateKey)
      .sort((a, b) => a.sort - b.sort);
    return secs.map(s => ({
      ...s,
      items: cat.items
        .filter(i => i.template_key === templateKey && i.section_name === s.name_ar
          && i.brands.includes(brandCode))
        .sort((a, b) => a.sort - b.sort)
    })).filter(s => s.items.length);
  }

  /* حساب النتيجة محلياً للعرض الحيّ فقط — الخادم هو المرجع */
  function localScore(secs, answers, weighted, target) {
    let num = 0, den = 0, done = 0, total = 0, crit = 0, low = 0;
    const bySec = {};
    secs.forEach(s => {
      let sn = 0, sd = 0;
      s.items.forEach(it => {
        total++;
        const a = answers[it.code];
        if (!a || a.value === undefined || a.value === null) return;
        done++;
        const w = weighted ? s.weight * it.weight : 1;
        sn += (a.value / 2) * w; sd += w;
        if (a.value <= 1) low++;
        if (it.critical && a.value === 0) crit++;
      });
      num += sn; den += sd;
      bySec[s.name_ar] = sd ? Math.round(sn / sd * 1000) / 10 : null;
    });
    const pct = den ? Math.round(num / den * 1000) / 10 : null;
    const t = target || 90;
    const band = crit > 0 ? "red" : pct == null ? null
      : pct >= t ? "green" : pct >= t - 10 ? "amber" : "red";
    return { pct, band, done, total, crit, low, bySec };
  }

  window.SI = {
    sb, esc, $, $$, businessDate, fmtTime, fmtDate, SHIFT_AR, BAND_AR,
    getPosition, distanceM, processPhoto, draft, idbPut, idbAll, idbDel,
    uploadPhoto, flushQueue, signedUrl, me, requireAuth, catalog, itemsFor, localScore
  };
})();
