/* ═══════════════════════════════════════════════════════════
   تطبيق التشييك الميداني — سفن ايكونز
   ═══════════════════════════════════════════════════════════ */
(function () {
  const { sb, esc, $, businessDate, fmtTime, SHIFT_AR, getPosition, distanceM,
    processPhoto, draft, idbPut, idbAll, idbDel, uploadPhoto, flushQueue,
    me, catalog, itemsFor, localScore } = window.SI;
  const C = window.CONFIG;
  const V = () => $("#view");

  let ME = null, CAT = null, S = null;   // S = جلسة التشييك الجارية
  let INSTALL_EVT = null;                // حدث تثبيت التطبيق (أندرويد/كروم)

  addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL_EVT = e; });
  addEventListener("appinstalled", () => { INSTALL_EVT = null; });

  /* تحذير قبل مغادرة تشييك جارٍ — الإجابات محفوظة لكن التنبيه يمنع الارتباك */
  addEventListener("beforeunload", e => {
    if (S && !S.sending && Object.keys(S.answers || {}).length) {
      e.preventDefault(); e.returnValue = "";
    }
  });

  /* ─────────── حالة الشبكة ─────────── */
  function paintNet() {
    const el = $("#net");
    const on = navigator.onLine;
    el.className = "state " + (on ? "on" : "off");
    el.querySelector("span").textContent = on ? "متصل" : "بلا إنترنت — يُحفظ محلياً";
  }
  window.addEventListener("online", async () => {
    paintNet();
    const r = await flushQueue();
    if (r.done) toast(`رُفعت ${r.done} صورة كانت بانتظار الشبكة`);
  });
  window.addEventListener("offline", paintNet);

  function toast(msg, bad) {
    const d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = "position:fixed;inset-inline:14px;bottom:18px;z-index:99;padding:12px 15px;" +
      "border-radius:6px;font-size:13.5px;font-weight:600;text-align:center;box-shadow:var(--shadow);" +
      "background:" + (bad ? "var(--bad)" : "var(--accent)") + ";color:#fff";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }

  /* ─────────── إيقاع لمسي خفيف ─────────── */
  function tap(ms) { try { navigator.vibrate && navigator.vibrate(ms || 8); } catch (_) { } }

  /* ═════════ هوية العلامة ═════════
     التطبيق يأخذ لون علامة الفرع الذي يعمل عليه المستخدم.
     مدير فرع «واحد» يرى تطبيقاً فيروزياً، ومدير «شاورما» يراه أحمر —
     ونفس الكود ونفس الملفات. الإدارة و QA & Training يريان لون المجموعة. */
  const hex2rgb = h => {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h || "0b5f4e", 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb2hex = a => "#" + a.map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));

  function brandOf(branch) {
    const map = C.BRANDS || {};
    return (branch && map[branch.brand_code]) || C.BRAND_FALLBACK ||
      { color: "#0B5F4E", dark: "#063B30", logo: "" };
  }

  function applyBrand(branch) {
    const b = brandOf(branch);
    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      matchMedia("(prefers-color-scheme:dark)").matches;
    const r = document.documentElement.style;
    r.setProperty("--accent", b.color);
    r.setProperty("--accent-2", mix(b.color, "#ffffff", .3));
    r.setProperty("--brand-dark", b.dark || mix(b.color, "#000000", .35));
    r.setProperty("--wash", mix(b.color, dark ? "#0b1412" : "#ffffff", dark ? .82 : .88));
    /* لمسة لون خفيفة جداً على الخلفية تربط الشاشة بالعلامة بلا إزعاج */
    r.setProperty("--ground", mix(b.color, dark ? "#0b1412" : "#eef2f0", dark ? .94 : .955));
    const rgb = hex2rgb(b.color);
    r.setProperty("--brand-glow", `rgba(${rgb[0]},${rgb[1]},${rgb[2]},.28)`);
    const mt = document.querySelector('meta[name=theme-color]');
    if (mt) mt.setAttribute("content", b.dark || b.color);
    return b;
  }

  /* ─────────── حلقة تقدّم ─────────── */
  function ring(pct, size, sw, color, track) {
    const r = (size - sw) / 2, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, pct || 0)));
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
        style="transition:stroke-dashoffset .6s cubic-bezier(.32,.72,0,1)"/></svg>`;
  }

  /* ─────────── هيكل تحميل ─────────── */
  const skeleton = n => `<div class="card">` + Array.from({ length: n || 3 },
    (_, i) => `<div class="skl" style="height:${i ? 56 : 22}px"></div>`).join("") + `</div>`;

  /* ─────────── الشريط السفلي ─────────── */
  function nav(active) {
    const b = $("#bnav"); if (!b) return;
    b.classList.toggle("hide", !ME || active === false);
    const board = $("#nvBoard");
    if (board) board.classList.toggle("hide", !(ME && (ME.role === "admin" || ME.role === "area")));
    ["nvToday", "nvFind", "nvBoard"].forEach(id => {
      const el = $("#" + id);
      if (el) el.setAttribute("aria-selected", String(id === active));
    });
  }
  function navBadge(n) {
    const d = $("#nvFindN"); if (!d) return;
    d.textContent = n > 99 ? "99+" : n;
    d.classList.toggle("hide", !n);
  }

  /* ═════════ نافذة سفلية ═════════
     بديل prompt/confirm النظامية — أكثر ما يكسر إحساس «التطبيق الحقيقي». */
  function sheet(opt) {
    return new Promise(resolve => {
      const el = document.createElement("div");
      el.className = "sheet";
      const acts = (opt.actions || []).map((a, i) =>
        `<button class="btn ${a.kind || "g"}" data-i="${i}">${esc(a.label)}</button>`).join("");
      el.innerHTML = `<div class="scrim"></div><div class="panel" role="dialog" aria-modal="true">
        <div class="grip"></div>
        <h3>${esc(opt.title || "")}</h3>
        ${opt.sub ? `<p class="sh">${esc(opt.sub)}</p>` : ""}
        ${opt.body || ""}
        <div class="row">${acts}</div></div>`;
      document.body.appendChild(el);

      const done = v => {
        el.querySelector(".panel").style.animation = "slideUp .2s var(--ease) reverse both";
        setTimeout(() => el.remove(), 190);
        document.removeEventListener("keydown", onKey);
        resolve(v);
      };
      const onKey = e => { if (e.key === "Escape") done(null); };
      document.addEventListener("keydown", onKey);
      el.querySelector(".scrim").onclick = () => done(null);
      el.querySelectorAll(".row .btn").forEach(b => b.onclick = () => {
        const a = opt.actions[+b.dataset.i];
        tap();
        done(a.value !== undefined ? a.value
          : (opt.field ? (el.querySelector("#shField") || {}).value ?? "" : true));
      });
      const f = el.querySelector("#shField");
      if (f) setTimeout(() => f.focus(), 120);
    });
  }

  /* ═════════ عارض الصور ═════════ */
  function lightbox(urls, start) {
    if (!urls || !urls.length) return;
    let i = Math.max(0, Math.min(start || 0, urls.length - 1));
    const el = document.createElement("div");
    el.className = "lbox";
    el.innerHTML = `<div class="cnt"></div>
      <button class="x" aria-label="إغلاق">✕</button><img alt="">
      ${urls.length > 1 ? `<div class="nav">
        <button data-d="-1">السابقة</button><button data-d="1">التالية</button></div>` : ""}`;
    const img = el.querySelector("img"), cnt = el.querySelector(".cnt");
    const draw = () => {
      img.src = urls[i];
      cnt.textContent = `${i + 1} / ${urls.length}`;
      el.querySelectorAll(".nav button").forEach(b => {
        b.disabled = (+b.dataset.d < 0 && i === 0) || (+b.dataset.d > 0 && i === urls.length - 1);
      });
    };
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && i > 0) { i--; draw(); }
      if (e.key === "ArrowLeft" && i < urls.length - 1) { i++; draw(); }
    };
    el.querySelector(".x").onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    el.querySelectorAll(".nav button").forEach(b => b.onclick = () => {
      i = Math.max(0, Math.min(urls.length - 1, i + (+b.dataset.d))); tap(); draw();
    });
    /* سحب أفقي للتنقّل بين الصور */
    let x0 = null;
    el.addEventListener("touchstart", e => x0 = e.touches[0].clientX, { passive: true });
    el.addEventListener("touchend", e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 45) return;
      const n = i + (dx > 0 ? -1 : 1);
      if (n >= 0 && n < urls.length) { i = n; draw(); }
    }, { passive: true });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el); draw();
  }

  /* فتح أي صورة داخل التطبيق بالنقر — تفويض حدث واحد لكل الصور */
  document.addEventListener("click", e => {
    const im = e.target.closest(".ph img, .note .thumbs img");
    if (!im) return;
    e.preventDefault();
    const box = im.closest(".thumbs");
    const all = box ? Array.from(box.querySelectorAll("img")).map(x => x.src) : [im.src];
    lightbox(all, all.indexOf(im.src));
  });

  /* ═════════ سحب للتحديث ═════════ */
  (function pullToRefresh() {
    let y0 = null, pulling = false, ind = null;
    const TH = 78;
    const make = () => {
      ind = document.createElement("div");
      ind.className = "ptr";
      ind.innerHTML = "<i></i>";
      ind.style.transform = "translateY(-46px)";
      document.body.appendChild(ind);
    };
    addEventListener("touchstart", e => {
      if (scrollY > 2 || document.querySelector(".sheet,.lbox")) return;
      if (!ME || S) return;                       // لا نحدّث أثناء تشييك جارٍ
      y0 = e.touches[0].clientY; pulling = true;
      if (!ind) make();
    }, { passive: true });
    addEventListener("touchmove", e => {
      if (!pulling || y0 == null) return;
      const d = e.touches[0].clientY - y0;
      if (d <= 0) return;
      ind.style.transform = `translateY(${Math.min(d * .5, 62) - 46}px)`;
    }, { passive: true });
    addEventListener("touchend", async e => {
      if (!pulling || y0 == null) { pulling = false; return; }
      const d = e.changedTouches[0].clientY - y0;
      pulling = false; y0 = null;
      if (d > TH) {
        ind.classList.add("on"); ind.style.transform = "translateY(14px)";
        tap(12);
        const on = document.querySelector('#nvFind[aria-selected="true"]');
        try { await (on ? findings() : home()); } catch (_) { }
        flushQueue();
      }
      ind.classList.remove("on");
      ind.style.transform = "translateY(-46px)";
    }, { passive: true });
  })();

  /* رأس يلتصق عند التمرير */
  addEventListener("scroll", () => {
    const h = document.querySelector("header.top");
    if (h) h.classList.toggle("stuck", scrollY > 4);
  }, { passive: true });

  /* ─────────── الإقلاع ─────────── */
  async function boot() {
    paintNet();
    $("#coName").textContent = C.company;
    if (C.SUPABASE_URL.includes("YOUR-PROJECT")) return notConfigured();
    ME = await me();
    if (!ME) return loginScreen();
    document.body.classList.remove("login");
    $("#who").innerHTML = `<b>${esc(ME.full_name)}</b>${roleAr(ME.role)}`;
    try { CAT = await catalog(); }
    catch (e) { return fail("تعذّر تحميل البيانات: " + (e.message || e)); }
    /* لوّن التطبيق بهوية علامة الفرع قبل رسم أي شاشة */
    applyBrand(CAT.branches.find(b => b.id === ME.branch_id));
    flushQueue();
    home();
  }
  const roleAr = r => ({ admin: "الإدارة", area: "QA &amp; Training", branch: "مدير فرع" }[r] || r);

  function notConfigured() {
    V().innerHTML = `<div class="card"><h2>النظام غير مربوط بعد</h2>
      <p class="sub">افتح <code>config.js</code> وضع رابط مشروع Supabase والمفتاح العام،
      ثم شغّل ملفات <code>db/</code> بالترتيب. التفاصيل في <code>README.md</code>.</p></div>`;
  }
  function fail(m) { V().innerHTML = `<div class="banner bad">${esc(m)}</div>`; }

  /* ─────────── تسجيل الدخول ─────────── */
  function loginScreen() {
    $("#who").innerHTML = "";
    nav(null);
    document.body.classList.add("login");
    V().innerHTML = `<div class="lg">
      <div class="lg-top">
        <div class="lg-logo"><img src="logo-sevenicons.png" alt="سفن ايكونز"></div>
        <h1 class="lg-name">${esc(C.company)}</h1>
        <p class="lg-tag">نظام التشييك الميداني</p>
      </div>

      <div class="lg-card">
        <h2>تسجيل الدخول</h2>
        <p class="sub">استخدم البريد وكلمة المرور اللذين زوّدتك بهما الإدارة.</p>

        <label class="fl" for="em">البريد الإلكتروني</label>
        <div class="lg-f">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round"><rect x="2.5" y="4.5" width="19" height="15" rx="3"/>
            <path d="M3 7l9 6 9-6"/></svg>
          <input type="email" id="em" autocomplete="username" inputmode="email"
            placeholder="name@sevenicons.com" dir="ltr">
        </div>

        <label class="fl" for="pw">كلمة المرور</label>
        <div class="lg-f">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/>
            <path d="M8 10.5V7.8a4 4 0 018 0v2.7"/></svg>
          <input type="password" id="pw" autocomplete="current-password" placeholder="••••••••">
          <button type="button" class="lg-eye" id="eye" aria-label="إظهار كلمة المرور">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>
              <circle cx="12" cy="12" r="2.7"/></svg>
          </button>
        </div>

        <div id="lerr" class="lg-err hide"></div>
        <button class="btn p lg-go" id="go">دخول</button>
      </div>

      <p class="lg-foot">نسيت كلمة المرور؟ تواصل مع الإدارة لإعادة تعيينها.</p>
    </div>`;

    const eye = $("#eye"), pw = $("#pw");
    eye.onclick = () => {
      pw.type = pw.type === "password" ? "text" : "password";
      eye.classList.toggle("on", pw.type === "text");
      pw.focus();
    };

    const go = async () => {
      const b = $("#go"), e = $("#lerr");
      const email = $("#em").value.trim(), pass = pw.value;
      e.classList.add("hide");
      if (!email || !pass) {
        e.classList.remove("hide");
        e.textContent = !email ? "اكتب بريدك الإلكتروني." : "اكتب كلمة المرور.";
        (!email ? $("#em") : pw).focus();
        return;
      }
      b.disabled = true; b.classList.add("busy"); b.textContent = "جارٍ الدخول…";
      const { error } = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (error) {
        e.classList.remove("hide");
        e.textContent = /Invalid/i.test(error.message)
          ? "البريد أو كلمة المرور غير صحيحة."
          : /network|fetch/i.test(error.message)
            ? "لا يوجد اتصال بالإنترنت. تحقّق من الشبكة وحاول مرة أخرى."
            : error.message;
        b.disabled = false; b.classList.remove("busy"); b.textContent = "دخول";
        tap(26);
        return;
      }
      location.reload();
    };
    $("#go").onclick = go;
    $("#em").onkeydown = e => { if (e.key === "Enter") pw.focus(); };
    pw.onkeydown = e => { if (e.key === "Enter") go(); };
  }

  async function logout() { await sb.auth.signOut(); location.reload(); }

  /* ─────────── الشاشة الرئيسية ─────────── */
  async function home() {
    S = null;
    nav("nvToday");
    V().innerHTML = skeleton(3);

    const today = businessDate();
    const isStaff = ME.role === "admin" || ME.role === "area";
    const myBranch = CAT.branches.find(b => b.id === ME.branch_id);
    applyBrand(myBranch);      // ارجع للون علامتك بعد أي زيارة لفرع آخر

    let done = [];
    try {
      const { data } = await sb.from("inspections")
        .select("id,template_key,shift,branch_id,score,band,status,submitted_at,user_name")
        .eq("business_date", today);
      done = data || [];
    } catch (_) { }

    const { data: openF } = await sb.from("findings")
      .select("id", { count: "exact", head: false }).eq("status", "open");
    const openN = (openF || []).length;
    navBadge(openN);

    /* ── البطاقة الافتتاحية ── */
    const shifts = myBranch ? (myBranch.shifts || ["open", "mid", "close"]) : [];
    const recOf = sh => done.find(d => myBranch && d.branch_id === myBranch.id
      && d.shift === sh && d.template_key === sh && d.status === "submitted");
    const doneN = shifts.filter(sh => recOf(sh)).length;
    const hr = +new Intl.DateTimeFormat("en-US", { timeZone: C.TZ, hour: "numeric", hour12: false })
      .format(new Date());
    const greet = hr < 12 ? "صباح الخير" : hr < 17 ? "طاب يومك" : "مساء الخير";

    const brand = brandOf(myBranch);
    let html = `<div class="hero">
      ${brand.logo ? `<div class="blogo"><img src="${esc(brand.logo)}" alt=""></div>` : ""}
      <div class="hl">
      <div class="greet">${greet}، ${esc((ME.full_name || "").split(" ")[0])}</div>
      <h2>${esc(myBranch ? myBranch.name_ar : C.company)}</h2>
      <div class="date">${esc(window.SI.fmtDate(today))}</div></div>`;
    if (shifts.length) {
      html += `<div class="ring">${ring(doneN / shifts.length, 66, 7, "#fff", "rgba(255,255,255,.26)")}
        <div class="rt">${doneN}<span style="opacity:.7">/${shifts.length}</span></div></div>`;
    }
    html += `</div>`;

    /* ── تشييك لم يُرسَل: أهم شيء يراه المستخدم ──
       الإجابات محفوظة محلياً، لكن بلا هذا الشريط يظن المستخدم أنها ضاعت
       فيبدأ من الصفر ويعيد العمل كله. */
    try {
      const ids = draft.list();
      if (ids.length) {
        const { data: dr } = await sb.from("inspections")
          .select("id,template_key,shift,branch_id,business_date,status")
          .in("id", ids).eq("status", "draft").order("business_date", { ascending: false }).limit(1);
        const d0 = (dr || [])[0];
        if (d0) {
          const db = CAT.branches.find(b => b.id === d0.branch_id);
          const tp = CAT.templates.find(t => t.key === d0.template_key);
          const nDone = Object.values(draft.load(d0.id) || {})
            .filter(a => a && "value" in a).length;
          html += `<div class="alertbar draft">
            <div class="ico">↻</div>
            <div class="txt">تشييك لم يُرسَل بعد
              <small>${esc(tp ? tp.name_ar : d0.template_key)}${
                d0.shift ? " — " + SHIFT_AR[d0.shift] : ""} · ${esc(db ? db.name_ar : "")}
                · <span dir="ltr">${nDone}</span> بنداً مُجاباً محفوظاً</small></div>
            <button onclick="APP.start('${d0.template_key}','${d0.branch_id}',${
              d0.shift ? `'${d0.shift}'` : "null"})">أكمِل</button></div>`;
        }
      }
    } catch (_) { }

    /* ── صور بانتظار الشبكة ──
       بدون هذا المؤشر يقفل المستخدم التطبيق ظاناً أن كل شيء رُفع. */
    try {
      const q = await idbAll();
      if (q && q.length) {
        html += `<div class="alertbar queue">
          <div class="ico">☁</div>
          <div class="txt"><span dir="ltr">${q.length}</span> صورة بانتظار الشبكة
            <small>محفوظة على جهازك ولن تضيع — تُرفع تلقائياً عند عودة الاتصال</small></div>
          ${navigator.onLine ? `<button onclick="APP.flush()">ارفعها الآن</button>` : ""}</div>`;
      }
    } catch (_) { }

    /* ── دعوة تثبيت التطبيق ── */
    if (INSTALL_EVT && !localStorage.getItem("si_no_install")) {
      html += `<div class="alertbar install">
        <div class="ico">↓</div>
        <div class="txt">ثبّت التطبيق على شاشتك
          <small>يفتح أسرع ويعمل بلا إنترنت</small></div>
        <button onclick="APP.install()">تثبيت</button>
        <button class="ghost" onclick="APP.noInstall()">لاحقاً</button></div>`;
    }

    /* ── مدير الفرع: ورديات اليوم ── */
    if (myBranch) {
      const remain = shifts.length - doneN;
      html += `<div class="card"><h2>ورديات اليوم</h2>
        <p class="sub">${remain ? `باقي ${remain} من ${shifts.length} — التشييك يبدأ من داخل الفرع.`
          : "اكتملت ورديات اليوم. عمل ممتاز."}</p>`;
      shifts.forEach(sh => {
        const rec = recOf(sh);
        html += `<div class="shift ${rec ? "done" : ""}">
          <div class="ic">${rec ? "✓" : SHIFT_AR[sh][0]}</div>
          <div class="t"><b>تشييك ${SHIFT_AR[sh]}</b><span>${rec
            ? `${rec.score}٪ · ${esc(rec.user_name)} · ${fmtTime(rec.submitted_at)}`
            : "لم يُنفَّذ بعد"}</span></div>
          ${rec ? `<button class="btn g sm" onclick="APP.report('${rec.id}')">التقرير</button>`
            : `<button class="btn p sm" onclick="APP.start('${sh}','${myBranch.id}','${sh}')">ابدأ</button>`}
        </div>`;
      });
      html += `</div>`;
    }

    /* ── QA & Training والإدارة: زيارة أي فرع ── */
    if (isStaff) {
      const groups = {};
      CAT.branches.forEach(b => (groups[b.brand_code] = groups[b.brand_code] || []).push(b));
      html += `<div class="card"><h2>زيارة QA &amp; Training</h2>
        <p class="sub">التدقيق الأسبوعي الكامل — ٤٥ بنداً بأوزان.</p>
        <label class="fl">الموقع</label>
        <select id="vb"><option value="">— اختر الفرع —</option>` +
        Object.keys(groups).map(k => {
          const bn = (CAT.brands || []).find(x => x.code === k);
          return `<optgroup label="${esc(bn ? bn.name_ar : k)}">` + groups[k].map(b =>
            `<option value="${b.id}">${esc(b.name_ar)}</option>`).join("") + `</optgroup>`;
        }).join("") + `</select>
        <div class="row"><button class="btn p" onclick="APP.startVisit()">ابدأ الزيارة</button></div></div>`;

      /* التزام ورديات اليوم على مستوى المجموعة */
      const rows = CAT.branches.filter(b => (b.shifts || []).length).map(b => {
        const cells = (b.shifts || []).map(sh => {
          const r = done.find(d => d.branch_id === b.id && d.shift === sh && d.status === "submitted");
          return `<td class="c">${r ? `<span class="pill ${bandCls(r.band)}">${r.score}</span>`
            : `<span class="pill n">—</span>`}</td>`;
        }).join("");
        return `<tr><td>${esc(b.name_ar)}</td>${cells}</tr>`;
      }).join("");
      html += `<div class="card"><h2>التزام الفروع اليوم</h2>
        <p class="sub">ما نفّذته الفروع حتى الآن.</p>
        <div class="tw"><table><thead><tr><th>الموقع</th>
        <th>الفتح</th><th>الذروة</th><th>الإغلاق</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    html += `<div class="row" style="margin-top:6px"><button class="btn g"
      onclick="APP.logout()">تسجيل الخروج</button></div>`;
    V().innerHTML = html;
  }
  const bandCls = b => b === "green" ? "g" : b === "amber" ? "a" : b === "red" ? "r" : "n";

  function startVisit() {
    const id = $("#vb").value;
    if (!id) return toast("اختر الفرع أولاً", true);
    start("visit", id, null);
  }

  /* ─────────── بدء تشييك ─────────── */
  async function start(templateKey, branchId, shift) {
    const branch = CAT.branches.find(b => b.id === branchId);
    applyBrand(branch);        // المشرف الزائر يرى لون الفرع الذي يزوره
    V().innerHTML = `<div class="card"><h2>جارٍ تحديد موقعك…</h2>
      <p class="sub">التقرير لا يُقبل إلا من داخل ${esc(branch.name_ar)}.
      لو تأخر، اخرج لمكان مفتوح قليلاً.</p></div>`;

    let pos = null;
    try { pos = await getPosition(); }
    catch (e) {
      V().innerHTML = `<div class="banner bad">${esc(e.message)}</div>
        <div class="row"><button class="btn g" onclick="APP.home()">رجوع</button>
        <button class="btn p" onclick="APP.start('${templateKey}','${branchId}',${shift ? `'${shift}'` : "null"})">إعادة المحاولة</button></div>`;
      return;
    }

    const dist = distanceM(pos, branch);
    if (branch.enforce_geo && branch.lat != null && dist != null && dist > branch.geofence_m) {
      V().innerHTML = `<div class="banner bad">أنت على بعد <b>${dist} متر</b> من
        ${esc(branch.name_ar)}، والمسموح ${branch.geofence_m} متر.<br>
        التشييك لا يبدأ إلا من داخل الفرع.</div>
        <div class="row"><button class="btn g" onclick="APP.home()">رجوع</button>
        <button class="btn p" onclick="APP.start('${templateKey}','${branchId}',${shift ? `'${shift}'` : "null"})">أنا داخل الفرع — أعد المحاولة</button></div>`;
      return;
    }
    if (pos.accuracy > C.GPS_MAX_ACCURACY_M) {
      toast(`دقة الموقع ضعيفة (${pos.accuracy} م) — قد يُرفض الإرسال`, true);
    }

    let insp;
    try {
      const { data, error } = await sb.rpc("fn_start_inspection", {
        p_template: templateKey, p_branch: branchId,
        p_date: businessDate(), p_shift: shift
      });
      if (error) throw error;
      insp = Array.isArray(data) ? data[0] : data;
    } catch (e) {
      const m = String(e.message || e);
      V().innerHTML = `<div class="banner bad">${esc(
        m.includes("ALREADY_SUBMITTED") ? m.split(": ").slice(1).join(": ") || "هذا التشييك أُرسل من قبل."
          : m.includes("LOCKED_BY_OTHER") ? m.split(": ").slice(1).join(": ")
            : m.includes("NOT_YOUR_BRANCH") ? "هذا ليس فرعك."
              : m)}</div>
        <div class="row"><button class="btn g" onclick="APP.home()">رجوع</button></div>`;
      return;
    }

    await sb.from("inspections").update({
      lat: pos.lat, lng: pos.lng, accuracy_m: pos.accuracy,
      device: navigator.userAgent.slice(0, 120), app_version: C.APP_VERSION
    }).eq("id", insp.id);

    const tpl = CAT.templates.find(t => t.key === templateKey);
    const secs = itemsFor(CAT, templateKey, branch.brand_code);
    const saved = draft.load(insp.id) || {};
    S = { insp, branch, tpl, secs, shift, pos, answers: saved, sending: false, sec: 0 };
    runner();
  }

  /* ─────────── شاشة التشييك ─────────── */
  /* حالة كل محور — تُستخدم في شريط المحاور */
  function secStat(i) {
    const items = S.secs[i].items;
    const d = items.filter(it => S.answers[it.code] && "value" in S.answers[it.code]).length;
    return { done: d, total: items.length, full: d === items.length };
  }

  function secnavHTML() {
    if (S.secs.length < 2) return "";
    return `<div class="secnav" id="secnav">` + S.secs.map((s, i) => {
      const st = secStat(i);
      return `<button aria-selected="${i === S.sec}" class="${st.full ? "full" : ""}"
        onclick="APP.goSec(${i})">${esc(s.name_ar)}<span class="n" dir="ltr">${st.done}/${st.total}</span></button>`;
    }).join("") + `</div>`;
  }

  /* شريط الإرسال الثابت — زره الأساسي يتغيّر حسب الموضع والاكتمال */
  function sbarHTML(r) {
    const last = S.sec === S.secs.length - 1;
    const allDone = r.total > 0 && r.done === r.total;
    return `<button class="btn g" onclick="APP.home()">حفظ لاحقاً</button>` +
      ((allDone || last)
        ? `<button class="btn p" id="send" onclick="APP.submit()">إنهاء وإرسال</button>`
        : `<button class="btn p" id="send" onclick="APP.goSec(${S.sec + 1})">المحور التالي</button>`);
  }

  function runner() {
    if (!(S.sec >= 0 && S.sec < S.secs.length)) S.sec = 0;
    nav(false);                                   // الشريط السفلي يفسح مكانه لشريط الإرسال
    const r = localScore(S.secs, S.answers, S.tpl.weighted, S.branch.target_pct);
    const sec = S.secs[S.sec];

    V().innerHTML =
      `<div class="prog">
        <div class="bar"><i style="width:${r.total ? r.done / r.total * 100 : 0}%"></i></div>
        <div class="pmeta"><span>${r.done} من ${r.total} بنداً</span>
        <span><b style="color:${bandColor(r.done ? r.band : null)}">${r.done ? r.pct + "٪" : "—"}</b>
        ${r.crit ? ' <span class="pill r">إنذار حرج</span>' : ""}</span></div></div>` +
      secnavHTML() +
      `<div class="card" style="padding:13px 15px;margin-bottom:11px">
        <div style="font-size:12.5px;color:var(--ink-3);line-height:1.65">
        ${esc(S.branch.name_ar)} · ${esc(S.tpl.name_ar)}${S.shift ? " · " + SHIFT_AR[S.shift] : ""}
        · ${esc(window.SI.fmtDate(S.insp.business_date))}</div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:2px">
        الموقع مؤكَّد — دقة <span dir="ltr">${S.pos.accuracy}</span> م${S.branch.lat != null
          ? ` · على بعد <span dir="ltr">${distanceM(S.pos, S.branch)}</span> م من الفرع` : ""}</div></div>
      <div class="card"><div class="sec-h">${esc(sec.name_ar)}${
        S.tpl.weighted ? " · وزن " + sec.weight : ""}</div>${sec.items.map(qHTML).join("")}</div>
      <div id="err" class="banner bad hide"></div>` +
      (S.secs.length > 1 ? `<div class="row">
        <button class="btn g" ${S.sec === 0 ? "disabled" : ""}
          onclick="APP.goSec(${S.sec - 1})">← المحور السابق</button>
        <button class="btn g" ${S.sec === S.secs.length - 1 ? "disabled" : ""}
          onclick="APP.goSec(${S.sec + 1})">المحور التالي →</button></div>` : "") +
      `<div class="sbar">${sbarHTML(r)}</div>`;

    /* اجعل المحور الحالي مرئياً داخل الشريط */
    const nb = document.querySelector('.secnav button[aria-selected=true]');
    if (nb) nb.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function goSec(i) {
    if (!S || i < 0 || i >= S.secs.length) return;
    S.sec = i; tap(); runner();
    scrollTo({ top: 0, behavior: "smooth" });
  }
  const bandColor = b => b === "green" ? "var(--ok)" : b === "amber" ? "var(--warn)"
    : b === "red" ? "var(--bad)" : "var(--ink-3)";

  function qHTML(it) {
    const a = S.answers[it.code] || {};
    const need = a.value === 0 || a.value === 1;
    const opts = [[2, "مطابق", "v2"], [1, "جزئي", "v1"], [0, "غير مطابق", "v0"], [null, "لا ينطبق", "vn"]];
    return `<div class="q" id="q_${it.code}">
      <span class="lab">${esc(it.title_ar)}
        ${it.critical ? '<span class="chip cr">حرج</span>' : ""}
        ${it.needs_photo ? '<span class="chip ph">صورة إلزامية</span>' : ""}</span>
      ${it.how_ar ? `<div class="how">${esc(it.how_ar)}</div>` : ""}
      ${it.standard_ar ? `<button class="more" onclick="this.nextElementSibling.classList.toggle('on')">معيار المطابقة ▾</button>
        <div class="std">${esc(it.standard_ar)}</div>` : ""}
      <div class="scale">${opts.map(o =>
        `<button class="${o[2]}" aria-pressed="${a.value === o[0] && "value" in a}"
          onclick="APP.setV('${it.code}',${o[0] === null ? "null" : o[0]})">${o[1]}</button>`).join("")}</div>
      ${it.num_label ? `<div class="num"><span>${esc(it.num_label)}${it.num_unit ? " (" + esc(it.num_unit) + ")" : ""}:</span>
        <input type="number" step="any" inputmode="decimal" value="${a.num ?? ""}"
          onchange="APP.setF('${it.code}','num',this.value)"></div>` : ""}
      <div class="ph"><label class="pb">${it.needs_photo ? "التقط الصورة المطلوبة" : "إرفاق صورة"}
        <input type="file" accept="image/*" capture="environment" onchange="APP.pick('${it.code}',this)"></label>
        <div class="thumbs" id="th_${it.code}">${(a.photos || []).map((p, i) =>
          `<figure><img src="${esc(a.thumbs && a.thumbs[i] || "")}" alt="">
           <button class="rm" onclick="APP.rmPhoto('${it.code}',${i})">×</button></figure>`).join("")}</div></div>
      <div class="fnd ${need ? "on" : ""}" id="f_${it.code}">
        <label class="fl">الملاحظة *</label>
        <textarea oninput="APP.setF('${it.code}','note',this.value)">${esc(a.note || "")}</textarea>
        <label class="fl">الإجراء التصحيحي *</label>
        <textarea oninput="APP.setF('${it.code}','action',this.value)">${esc(a.action || "")}</textarea>
        <div class="g2"><div><label class="fl">المسؤول *</label>
          <input type="text" value="${esc(a.owner || "")}" placeholder="اسم أو جهة"
            oninput="APP.setF('${it.code}','owner',this.value)"></div>
          <div><label class="fl">تاريخ الاستحقاق *</label>
          <input type="date" value="${esc(a.due || "")}" onchange="APP.setF('${it.code}','due',this.value)"></div>
        </div></div></div>`;
  }

  function setV(code, v) {
    const a = S.answers[code] = S.answers[code] || {};
    a.value = v; tap();
    const it = S.secs.flatMap(s => s.items).find(x => x.code === code);
    if ((v === 0 || v === 1) && !a.due) {
      const d = new Date(S.insp.business_date + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + (it.critical ? 1 : 3));
      a.due = d.toISOString().slice(0, 10);
    }
    const q = $("#q_" + code);
    q.querySelectorAll(".scale button").forEach((b, i) =>
      b.setAttribute("aria-pressed", String([2, 1, 0, null][i] === v)));
    $("#f_" + code).classList.toggle("on", v === 0 || v === 1);
    const di = $("#f_" + code).querySelector("input[type=date]");
    if (di && a.due) di.value = a.due;
    persist(); updateProg();
  }
  function setF(code, k, v) { (S.answers[code] = S.answers[code] || {})[k] = v; persist(); }
  function persist() { draft.save(S.insp.id, S.answers); }

  function updateProg() {
    const r = localScore(S.secs, S.answers, S.tpl.weighted, S.branch.target_pct);
    const p = document.querySelector(".prog"); if (!p) return;
    p.querySelector(".bar i").style.width = (r.total ? r.done / r.total * 100 : 0) + "%";
    p.querySelector(".pmeta").innerHTML =
      `<span>${r.done} من ${r.total} بنداً</span><span><b style="color:${bandColor(r.done ? r.band : null)}">${
        r.done ? r.pct + "٪" : "—"}</b>${r.crit ? ' <span class="pill r">إنذار حرج</span>' : ""}</span>`;

    /* عدّادات المحاور */
    const nv = document.querySelector(".secnav");
    if (nv) nv.querySelectorAll("button").forEach((b, i) => {
      const st = secStat(i);
      const n = b.querySelector(".n");
      if (n) n.textContent = st.done + "/" + st.total;
      b.classList.toggle("full", st.full);
    });

    /* زر الإرسال قد يتغيّر عند اكتمال كل البنود */
    const sb2 = document.querySelector(".sbar");
    if (sb2 && !S.sending) sb2.innerHTML = sbarHTML(r);
  }

  /* ─────────── الصور ─────────── */
  async function pick(code, input) {
    const f = input.files && input.files[0]; input.value = "";
    if (!f) return;
    const a = S.answers[code] = S.answers[code] || {};
    a.photos = a.photos || []; a.thumbs = a.thumbs || [];
    if (a.photos.length >= 4) return toast("الحد أربع صور للبند الواحد", true);

    let pos = S.pos;
    try { pos = await getPosition(); S.pos = pos; } catch (_) { }

    const stamp = [
      S.branch.name_ar,
      new Intl.DateTimeFormat("ar-KW", { timeZone: C.TZ, dateStyle: "full", timeStyle: "medium" }).format(new Date()),
      `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} · دقة ${pos.accuracy} م`,
      `${ME.full_name} · ${C.company}`
    ];

    let blob;
    try { blob = await processPhoto(f, stamp); }
    catch (e) { return toast(e.message, true); }

    const n = a.photos.length;
    const path = `${S.branch.code}/${S.insp.business_date}/${S.insp.id}/${code}_${n}_${Date.now()}.jpg`;
    const thumb = URL.createObjectURL(blob);
    a.photos.push(path); a.thumbs.push(thumb);
    renderThumbs(code, a);
    persist();

    try {
      if (!navigator.onLine) throw new Error("offline");
      await uploadPhoto(path, blob);
    } catch (_) {
      await idbPut({ key: path, path, blob });
      toast("الصورة محفوظة وسترفع عند عودة الشبكة");
    }
  }
  function renderThumbs(code, a) {
    $("#th_" + code).innerHTML = (a.thumbs || []).map((t, i) =>
      `<figure><img src="${t}" alt=""><button class="rm" onclick="APP.rmPhoto('${code}',${i})">×</button></figure>`).join("");
  }
  async function rmPhoto(code, i) {
    const a = S.answers[code]; if (!a) return;
    const path = a.photos[i];
    a.photos.splice(i, 1); a.thumbs.splice(i, 1);
    try { await idbDel(path); } catch (_) { }
    renderThumbs(code, a); persist();
  }

  /* ─────────── الإرسال ─────────── */
  async function submit() {
    if (S.sending) return;
    const err = $("#err"); err.classList.add("hide");
    const all = S.secs.flatMap(s => s.items);

    const missing = all.filter(it => !(S.answers[it.code] && "value" in S.answers[it.code]));
    if (missing.length) return bad(`باقي ${missing.length} بنداً بلا تقييم.`, missing[0].code);

    const noNote = all.filter(it => {
      const a = S.answers[it.code];
      return (a.value === 0 || a.value === 1) &&
        !(a.note && a.note.trim() && a.action && a.action.trim() && a.owner && a.owner.trim() && a.due);
    });
    if (noNote.length) return bad("كل بند «جزئي» أو «غير مطابق» يحتاج ملاحظة وإجراءً ومسؤولاً وتاريخاً.", noNote[0].code);

    const noPhoto = all.filter(it => it.needs_photo &&
      S.answers[it.code].value !== null && !(S.answers[it.code].photos || []).length);
    if (noPhoto.length) return bad("بنود عليها «صورة إلزامية» ولم تُرفق صورتها.", noPhoto[0].code);

    S.sending = true;
    const btn = $("#send"); btn.disabled = true; btn.textContent = "جارٍ الإرسال…";

    try {
      let pos = S.pos;
      try { pos = await getPosition(); } catch (_) { }
      await sb.from("inspections").update({
        lat: pos.lat, lng: pos.lng, accuracy_m: pos.accuracy
      }).eq("id", S.insp.id);

      const rows = all.map(it => {
        const a = S.answers[it.code];
        return {
          inspection_id: S.insp.id, item_code: it.code,
          value: a.value, num_value: a.num === "" || a.num == null ? null : Number(a.num),
          note: a.note || null, action: a.action || null,
          owner_name: a.owner || null, due_date: a.due || null,
          photos: a.photos || []
        };
      });
      const { error: e1 } = await sb.from("answers")
        .upsert(rows, { onConflict: "inspection_id,item_code" });
      if (e1) throw e1;

      const { error: e2 } = await sb.rpc("fn_finalize_inspection", { p_id: S.insp.id });
      if (e2) throw e2;

      draft.clear(S.insp.id);
      const { data } = await sb.from("inspections").select("*").eq("id", S.insp.id).single();
      doneScreen(data);
    } catch (e) {
      const m = String(e.message || e);
      S.sending = false; btn.disabled = false; btn.textContent = "إنهاء وإرسال";
      err.classList.remove("hide");
      err.innerHTML = m.includes("GEO_OUT_OF_RANGE")
        ? "الإرسال مرفوض — أنت خارج نطاق الفرع. " + esc(m.split(": ").slice(1).join(": "))
        : m.includes("GEO_REQUIRED") ? "فعّل الموقع وأعد المحاولة."
          : esc(m);
      err.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  function bad(msg, code) {
    /* البند الناقص قد يكون في محور آخر — انتقل إليه أولاً */
    const si = S.secs.findIndex(s => s.items.some(it => it.code === code));
    if (si >= 0 && si !== S.sec) { S.sec = si; runner(); }
    const e = $("#err"); e.textContent = msg; e.classList.remove("hide");
    tap(28);
    const q = $("#q_" + code);
    (q || e).scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function doneScreen(ins) {
    const url = location.origin + location.pathname.replace(/index\.html$/, "") + "report.html?i=" + ins.id;
    const txt = `تقرير ${S.tpl.name_ar}\n${S.branch.name_ar}\n` +
      `${window.SI.fmtDate(ins.business_date)}${S.shift ? " — " + SHIFT_AR[S.shift] : ""}\n` +
      `النتيجة: ${ins.score}٪${ins.critical_fails ? ` — ${ins.critical_fails} إخفاق حرج` : ""}\n${url}`;
    nav("nvToday");
    const bc = bandColor(ins.band);
    V().innerHTML = `<div class="card" style="text-align:center;padding:26px 16px">
      <div class="done-ring">
        ${ring(Math.max(0, Math.min(1, (+ins.score || 0) / 100)), 118, 10, bc, "var(--rule-2)")}
        <div class="dv" dir="ltr"><b style="color:${bc}">${ins.score}<span
          style="font-size:.5em;font-weight:700">٪</span></b><span dir="rtl">النتيجة</span></div>
      </div>
      <h2 style="font-size:19px">${esc(S.branch.name_ar)}</h2>
      <p class="sub" style="margin-bottom:14px">${esc(S.tpl.name_ar)}${
        S.shift ? " — " + SHIFT_AR[S.shift] : ""} · ${esc(window.SI.fmtDate(ins.business_date))}</p>
      ${ins.critical_fails ? `<div class="banner bad" style="text-align:start">
        <b>إنذار حرج</b> — <span dir="ltr">${ins.critical_fails}</span> بنداً حرجاً غير مطابق.
        يجب إغلاقه خلال ٢٤ ساعة.</div>` : ""}
      <div style="font-size:12px;color:var(--ink-3);line-height:1.8">موثّق من داخل الفرع —
        على بعد <span dir="ltr">${ins.distance_m ?? "—"}</span> متر ·
        دقة <span dir="ltr">${ins.accuracy_m ?? "—"}</span> م</div>
      <div class="row"><button class="btn g" onclick="APP.report('${ins.id}')">عرض التقرير</button>
        <button class="btn p" onclick="APP.sharePdf('${ins.id}')">📄 مشاركة PDF</button></div>
      <div class="row"><button class="btn g" onclick="APP.home()">رجوع للرئيسية</button></div></div>`;
  }

  async function share(text) {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (_) { } }
    location.href = "https://wa.me/?text=" + encodeURIComponent(text);
  }

  const report = id => location.href = "report.html?i=" + id;
  /* يفتح صفحة التقرير ويبدأ توليد الـPDF ومشاركته تلقائياً */
  const sharePdf = id => location.href = "report.html?i=" + id + "&share=1";

  /* ─────────── الملاحظات ─────────── */
  async function findings() {
    nav("nvFind");
    V().innerHTML = skeleton(4);
    const { data, error } = await sb.from("findings")
      .select("*, branches(name_ar)").eq("status", "open")
      .order("due_date", { ascending: true }).limit(300);
    if (error) return fail(error.message);
    const today = businessDate();
    const rows = await Promise.all((data || []).map(async f => {
      const urls = await Promise.all((f.photos || []).slice(0, 3).map(p => window.SI.signedUrl(p, 3600)));
      const late = f.due_date && f.due_date < today;
      return `<div class="note ${late ? "late" : ""}">
        <h4>${esc(f.item_title)}${f.critical ? '<span class="chip cr">حرج</span>' : ""}</h4>
        <div class="m">${esc(f.branches ? f.branches.name_ar : "")} · ${esc(f.section_name)}
          · استحقاق ${esc(f.due_date || "—")}${late ? " — متأخرة" : ""}</div>
        <p><b>الملاحظة:</b> ${esc(f.note || "")}</p>
        <p><b>الإجراء:</b> ${esc(f.action || "")} — ${esc(f.owner_name || "")}</p>
        ${urls.filter(Boolean).length ? `<div class="thumbs">${urls.filter(Boolean)
          .map(u => `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt=""></a>`).join("")}</div>` : ""}
        <button class="btn g sm" onclick="APP.close('${f.id}')">أُغلقت</button></div>`;
    }));
    navBadge(rows.length);
    const late = (data || []).filter(f => f.due_date && f.due_date < today).length;
    V().innerHTML = `<div class="card"><h2>الملاحظات المفتوحة</h2>
      <p class="sub">${rows.length
        ? `<span dir="ltr">${rows.length}</span> ملاحظة${late
          ? ` · منها <b style="color:var(--bad)"><span dir="ltr">${late}</span> متأخرة</b>` : ""
          } — مرتبة بتاريخ الاستحقاق.`
        : "مرتبة بتاريخ الاستحقاق. المتأخر بالأحمر."}</p>
      ${rows.length ? rows.join("") : `<div class="empty">
        <div class="ei"><svg width="27" height="27" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/></svg></div>
        <div class="et">لا ملاحظات مفتوحة</div>
        كل الملاحظات مُغلقة. أحسنت.</div>`}</div>`;
  }

  async function closeF(id) {
    const note = await sheet({
      title: "إغلاق الملاحظة",
      sub: "اكتب ما نُفِّذ فعلاً. الوصف يبقى في سجل الملاحظة ويُراجَع لاحقاً.",
      field: true,
      body: `<label class="fl">الإجراء المنفَّذ (اختياري)</label>
        <textarea id="shField" placeholder="مثال: استُدعيت الصيانة واستُبدل الثرموستات"></textarea>`,
      actions: [{ label: "إلغاء", kind: "g", value: null }, { label: "تأكيد الإغلاق", kind: "p" }]
    });
    if (note === null) return;
    const { error } = await sb.rpc("fn_close_finding", { p_id: id, p_note: note || null });
    if (error) return toast(error.message, true);
    tap(20); toast("أُغلقت الملاحظة"); findings();
  }

  /* ─────────── التصدير ─────────── */
  async function install() {
    if (!INSTALL_EVT) return toast("افتح قائمة المتصفح واختر «تثبيت التطبيق»");
    INSTALL_EVT.prompt();
    try { await INSTALL_EVT.userChoice; } catch (_) { }
    INSTALL_EVT = null; home();
  }
  function noInstall() { try { localStorage.setItem("si_no_install", "1"); } catch (_) { } home(); }
  async function flush() {
    toast("جارٍ رفع الصور…");
    const r = await flushQueue();
    toast(r.done ? `رُفعت ${r.done} صورة` : "لم تُرفع أي صورة — تحقق من الاتصال", !r.done);
    home();
  }

  window.APP = {
    home, start, startVisit, setV, setF, pick, rmPhoto, submit, findings,
    close: closeF, logout, report, share, goSec, sharePdf,
    install, noInstall, flush, lightbox
  };

  /* ═════════ تحديث التطبيق ═════════
     المستخدم لا يعرف ما «عامل الخدمة»، ولا يجب أن يعرف. المطلوب منه
     أن يرى زراً واحداً عندما تتوفّر نسخة أحدث. */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(reg => {
      /* نسخة جديدة جاهزة وتنتظر: اعرض الشريط */
      const offer = w => {
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(w);
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
      offer(reg.installing);
      reg.addEventListener("updatefound", () => offer(reg.installing));
      /* افحص وجود تحديث عند كل عودة للتطبيق */
      addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update().catch(() => { });
      });
      setInterval(() => reg.update().catch(() => { }), 15 * 60 * 1000);
    }).catch(() => { });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function showUpdateBar(worker) {
    if (document.getElementById("updBar")) return;
    const d = document.createElement("div");
    d.id = "updBar";
    d.className = "updbar";
    d.innerHTML = `<span>نسخة جديدة من التطبيق جاهزة</span>
      <button id="updGo">حدّث الآن</button>`;
    document.body.appendChild(d);
    d.querySelector("#updGo").onclick = () => {
      d.querySelector("#updGo").textContent = "جارٍ…";
      /* لو المستخدم في نص تشييك، الإجابات محفوظة في المسودة —
         الشريط يظهر له لكن القرار قراره. */
      try { worker.postMessage({ type: "SKIP_WAITING" }); } catch (_) { location.reload(); }
    };
  }
  boot();
})();
