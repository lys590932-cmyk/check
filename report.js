/* ═══════════════════════════════════════════════════════════
   تقرير تشييك واحد — للطباعة PDF وللمشاركة
   ═══════════════════════════════════════════════════════════ */
(function () {
  const { sb, esc, $, fmtDate, fmtTime, SHIFT_AR, BAND_AR, me, signedUrl } = window.SI;
  const C = window.CONFIG;
  const V = () => $("#view");
  const n1 = v => v == null ? "—" : Number(v).toFixed(1);
  const cvar = b => b === "green" ? "var(--ok)" : b === "amber" ? "var(--warn)"
    : b === "red" ? "var(--bad)" : "var(--ink-3)";
  const VAL = { 2: ["مطابق", "g"], 1: ["جزئي", "a"], 0: ["غير مطابق", "r"] };

  /* نداء RPC بالمفتاح العام — للوضع العام وحده (لا جلسة فيه).
     ⚠️ لا تستخدمه لأي دالة تتطلب صلاحية موظف: الترويسة هنا تحمل
     المفتاح العام لا توكن الجلسة، فالخادم يعاملك كزائر ويرفض.
     لتلك الدوال استخدم sb.rpc فهو يرفق توكن المستخدم تلقائياً. */
  async function anonRpc(fn, args){
    const res = await fetch(C.SUPABASE_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: C.SUPABASE_KEY, Authorization: "Bearer " + C.SUPABASE_KEY,
                 "Content-Type": "application/json" },
      body: JSON.stringify(args || {})
    });
    const txt = await res.text();
    if (!res.ok) {
      let m = txt; try { const j = JSON.parse(txt); m = j.message || j.hint || txt; } catch(e){}
      throw new Error(String(m).split(":")[0] || ("HTTP " + res.status));
    }
    try { return JSON.parse(txt); } catch(e){ return txt; }
  }

  /* الحمولة العامة مسطّحة — نعيد تشكيلها لتطابق شكل الاستعلام العادي
     حتى يبقى كود العرض واحداً للمسارين بلا تفريع. */
  function adaptPublic(p){
    const i = p.inspection || {};
    const ins = Object.assign({}, i, {
      branch_id: i.branch_id || null,
      branches: { name_ar: i.branch_name, code: i.branch_code, brand_code: i.brand_code,
                  target_pct: i.target_pct, lat: i.lat, lng: i.lng, phone: null },
      templates: { name_ar: i.tpl_name, weighted: i.weighted }
    });
    const ans = (p.answers || []).map(a => Object.assign({}, a, {
      items: { title_ar: a.title_ar, section_name: a.section_name, critical: a.critical,
               weight: a.weight, num_label: a.num_label, num_unit: a.num_unit, sort: a.sort }
    }));
    return { ins, ans, urls: p.photo_urls || {}, expires: p.expires_at };
  }

  async function boot() {
    $("#coName").textContent = C.company;
    const qs    = new URLSearchParams(location.search);
    const token = qs.get("t");            // وضع الرابط العام
    const id    = qs.get("i");
    const PUB   = !!token;

    if (!token && !id) return void (V().innerHTML =
      `<div class="banner bad">لا يوجد رقم تقرير في الرابط.</div>`);

    let ins, ans, PUBURLS = null;

    if (PUB) {
      document.body.classList.add("pubview");
      try {
        const p = await anonRpc("report_public_get", { p_token: token });
        const a = adaptPublic(p);
        ins = a.ins; ans = a.ans; PUBURLS = a.urls;
      } catch (e) {
        return void (V().innerHTML = `<div class="card" style="text-align:center;padding:34px 18px">
          <div style="font-size:40px">🔒</div>
          <h2 style="margin-top:10px">الرابط لم يعد صالحاً</h2>
          <p class="sub" style="margin-top:6px">انتهت صلاحيته أو أُلغي.
            اطلب رابطاً جديداً من إدارة ${esc(C.company)}.</p></div>`);
      }
    } else {
      const u = await me();
      if (!u) { location.replace("index.html"); return; }

      const r1 = await sb.from("inspections")
        .select("*, branches(name_ar, code, brand_code, target_pct, lat, lng, geofence_m, phone), templates(name_ar, weighted)")
        .eq("id", id).single();
      if (r1.error || !r1.data) return void (V().innerHTML =
        `<div class="banner bad">التقرير غير موجود أو لا صلاحية لك عليه.</div>`);
      ins = r1.data;

      const r2 = await sb.from("answers")
        .select("*, items(title_ar, section_name, critical, weight, num_label, num_unit, sort)")
        .eq("inspection_id", id);
      ans = r2.data;
    }

    const secs = {};
    (ans || []).sort((a, b) => (a.items?.sort || 0) - (b.items?.sort || 0))
      .forEach(a => {
        const s = a.items ? a.items.section_name : "—";
        (secs[s] = secs[s] || []).push(a);
      });

    const issues = (ans || []).filter(a => a.value === 0 || a.value === 1);

    /* ═══════════════════════════════════════════════════════════
       المقارنة بالزيارة السابقة
       ───────────────────────────────────────────────────────────
       رقم وحده لا يقول شيئاً: 84 قد تكون تحسّناً كبيراً أو تدهوراً.
       والبند الذي تكرّر إخفاقه مرتين ليس ملاحظة — هو خلل لم يُعالَج،
       وهذا ما يجب أن تراه الإدارة أولاً.
       ═══════════════════════════════════════════════════════════ */
    let PREV = null, REPEAT = new Set();
    try{
      if (PUB) throw 0;          /* الزائر لا يرى تقارير أخرى — ولا حتى للمقارنة */
      const { data: pv } = await sb.from("inspections")
        .select("id,score,business_date")
        .eq("branch_id", ins.branch_id).eq("template_key", ins.template_key)
        .eq("status", "submitted").lt("business_date", ins.business_date)
        .order("business_date", { ascending: false }).limit(1);
      PREV = (pv || [])[0] || null;
      if (PREV){
        const { data: pa } = await sb.from("answers")
          .select("item_code,value").eq("inspection_id", PREV.id);
        const bad = new Set((pa || []).filter(x => x.value === 0 || x.value === 1)
          .map(x => x.item_code));
        issues.forEach(a => { if (bad.has(a.item_code)) REPEAT.add(a.item_code); });
      }
    }catch(_){}

    const delta = PREV && PREV.score != null && ins.score != null
      ? Math.round((ins.score - PREV.score) * 10) / 10 : null;
    /* في الوضع العام الروابط جاهزة داخل الرابط نفسه — الزائر لا يملك
       أي صلاحية على المخزن، فلا يستطيع توليد رابط لصورة أخرى. */
    const urls = PUBURLS || {};
    if (!PUB) {
      await Promise.all((ans || []).flatMap(a => (a.photos || []).map(async p => {
        urls[p] = await signedUrl(p, 7200);
      })));
    }

    /* ── قائمة الأدلة المصوّرة ──
       مصغّرة بعرض 168 بكسل لا تُثبت شيئاً: لا تُقرأ منها درجة حرارة
       ولا تاريخ ملصق. وفي ملف PDF يُرسَل لطرف آخر لا يمكن «فتح» الصورة
       بالضغط — الصورة إما تُقرأ كما هي أو لا قيمة لها.
       لذلك ملحق مستقل يعرض كل صورة بحجمها الكامل.
       الترتيب: الحرج أولاً ثم غير المطابق — وهو دليل أي نزاع. */
    const SHOT_CAP = 12;               /* سقف يمنع ملفاً ضخماً لا يُرسَل */
    const shotList = (ans || []).flatMap(a =>
      (a.photos || []).map(p => ({
        url: urls[p],
        title: a.items ? a.items.title_ar : a.item_code,
        section: a.items ? a.items.section_name : "",
        value: a.value,
        critical: !!(a.items && a.items.critical)
      }))
    ).filter(x => x.url).sort((x, y) => {
      const rank = v => v === 0 ? 0 : v === 1 ? 1 : 2;
      return (y.critical - x.critical) || (rank(x.value) - rank(y.value));
    });

    const secScore = list => {
      const w = ins.templates.weighted;
      let n = 0, d = 0;
      list.forEach(a => {
        if (a.value == null) return;
        const k = w ? (a.items?.weight || 1) : 1;
        n += (a.value / 2) * k; d += k;
      });
      return d ? Math.round(n / d * 1000) / 10 : null;
    };

    /* لون علامة الفرع — نفس هوية التطبيق */
    (function(){
      const b = (C.BRANDS || {})[ins.branches.brand_code] || C.BRAND_FALLBACK;
      if(!b) return;
      const r = document.documentElement.style;
      r.setProperty("--accent", b.color);
      r.setProperty("--brand-dark", b.dark || b.color);
      const mt = document.querySelector('meta[name=theme-color]');
      if(mt) mt.setAttribute("content", b.dark || b.color);
    })();
    document.body.classList.add("rep");

    const _bl = (C.BRANDS || {})[ins.branches.brand_code] || C.BRAND_FALLBACK || {};
    V().innerHTML = `
      <div class="rep-hero" style="--bd:${_bl.dark || "var(--accent)"}">
        <div class="rh-top">
          ${_bl.logo ? `<div class="rh-logo"><img src="${esc(_bl.logo)}" alt=""></div>` : ""}
          <div class="rh-t">
            <h2>${esc(ins.branches.name_ar)}</h2>
            <p>${esc(ins.templates.name_ar)}${ins.shift ? " — تشييك " + SHIFT_AR[ins.shift] : ""}</p>
            <p class="d">${esc(fmtDate(ins.business_date))}</p>
          </div>
        </div>
        <div class="rh-score">
          <div class="rh-num" dir="ltr">${n1(ins.score)}<small>٪</small></div>
          <div class="rh-band">${BAND_AR[ins.band] || "—"}</div>
          <div class="rh-tgt">المستهدف <span dir="ltr">${n1(ins.branches.target_pct)}٪</span></div>
        </div>
      </div>

      <div class="card">
        ${ins.critical_fails ? `<div class="banner bad" style="margin:0 0 12px">
          <b>إنذار حرج</b> — <span dir="ltr">${ins.critical_fails}</span> بنداً حرجاً غير مطابق.
          يجب إغلاقه خلال ٢٤ ساعة.</div>` : ""}

        <!-- الخلاصة: ماذا تغيّر وما الذي يجب فعله الآن -->
        <div class="sumry">
          <div class="sm-row">
            <div class="sm-c">
              <span>مقارنة بالزيارة السابقة</span>
              <b dir="ltr" style="color:${delta == null ? "var(--ink-3)"
                : delta > 0 ? "var(--ok)" : delta < 0 ? "var(--bad)" : "var(--ink-2)"}">${
                delta == null ? "—" : (delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "= ") + delta}</b>
              <small>${PREV ? esc(fmtDate(PREV.business_date)) + " · " + n1(PREV.score) + "٪"
                : "لا زيارة سابقة"}</small>
            </div>
            <div class="sm-c">
              <span>ملاحظات متكرّرة</span>
              <b dir="ltr" style="color:${REPEAT.size ? "var(--bad)" : "var(--ok)"}">${REPEAT.size}</b>
              <small>${REPEAT.size ? "لم تُعالَج منذ الزيارة السابقة" : "لا تكرار"}</small>
            </div>
            <div class="sm-c">
              <span>الفارق عن المستهدف</span>
              <b dir="ltr" style="color:${ins.score >= ins.branches.target_pct
                ? "var(--ok)" : "var(--bad)"}">${
                ins.score == null ? "—" : ((ins.score - ins.branches.target_pct) > 0 ? "+" : "") +
                  (Math.round((ins.score - ins.branches.target_pct) * 10) / 10)}</b>
              <small>المستهدف <span dir="ltr">${n1(ins.branches.target_pct)}٪</span></small>
            </div>
          </div>
          <div class="sm-act">
            <b>الأولوية الآن:</b> ${
              ins.critical_fails
                ? `إغلاق <span dir="ltr">${ins.critical_fails}</span> بنداً حرجاً خلال ٢٤ ساعة.`
                : REPEAT.size
                  ? `معالجة <span dir="ltr">${REPEAT.size}</span> ملاحظة متكرّرة — تكرارها يعني أن الإجراء السابق لم يُنفَّذ.`
                  : issues.length
                    ? `إغلاق <span dir="ltr">${issues.length}</span> ملاحظة قبل تاريخ استحقاقها.`
                    : "لا إجراء مطلوب — كل البنود مطابقة."}
          </div>
        </div>
        <div class="meta">
          <div><div class="k">المنفِّذ</div><div class="v">${esc(ins.user_name)}</div></div>
          <div><div class="k">وقت الإرسال</div><div class="v">${ins.submitted_at ? esc(fmtTime(ins.submitted_at)) : "—"}</div></div>
          <div><div class="k">المستهدف</div><div class="v">${n1(ins.branches.target_pct)}٪</div></div>
          <div><div class="k">الحالة</div><div class="v" style="color:${cvar(ins.band)}">${
            BAND_AR[ins.band] || "—"}</div></div>
          <div><div class="k">البنود</div><div class="v">${ins.items_done} من ${ins.items_total}</div></div>
          <div><div class="k">التوثيق الجغرافي</div><div class="v">${
            ins.geofence_ok === true ? `داخل النطاق — ${ins.distance_m ?? "—"} م`
            : ins.geofence_ok === false ? '<span style="color:var(--bad)">خارج النطاق</span>'
            : "غير متاح"}</div></div>
          <div><div class="k">دقة الموقع</div><div class="v">${ins.accuracy_m ?? "—"} م</div></div>
          <div><div class="k">الإحداثيات</div><div class="v" style="font-size:11px">${
            ins.lat != null ? `${ins.lat.toFixed(5)}, ${ins.lng.toFixed(5)}` : "—"}</div></div>
        </div>
        ${ins.lat != null ? `<p style="margin:9px 0 0;font-size:11.5px" class="noprint">
          <a href="https://maps.google.com/?q=${ins.lat},${ins.lng}" target="_blank" rel="noopener">
          فتح الموقع على الخريطة ↗</a></p>` : ""}
      </div>

      <div class="card"><h2>أداء المحاور</h2>
        ${Object.keys(secs).map(s => {
          const p = secScore(secs[s]);
          const b = p == null ? "n" : p >= ins.branches.target_pct ? "green"
            : p >= ins.branches.target_pct - 10 ? "amber" : "red";
          return `<div class="hb"><span class="n">${esc(s)}</span>
            <span class="t"><i style="width:${p || 0}%;background:${cvar(b)}"></i></span>
            <span class="v">${p == null ? "—" : p}</span></div>`;
        }).join("")}</div>

      ${issues.length ? `<div class="card"><h2>الملاحظات (${issues.length})</h2>
        <p class="sub">كل بند «جزئي» أو «غير مطابق» بإجرائه ومسؤوله وتاريخ استحقاقه.</p>
        ${issues.map(a => {
          const [t, cls] = VAL[a.value] || ["—", "n"];
          const shots = (a.photos || []).map(p => urls[p]).filter(Boolean);
          /* الاسم أولاً ثم الحالة: القارئ يبحث عن البند لا عن كلمة «مطابق».
             في RTL أول عنصر في الترتيب هو الأيمن. */
          return `<div class="it">
            <div class="bd"><b>${esc(a.items ? a.items.title_ar : a.item_code)}</b>
              ${a.items && a.items.critical ? '<span class="chip cr">حرج</span>' : ""}
              ${REPEAT.has(a.item_code) ? '<span class="chip rp">↻ متكرّر</span>' : ""}
              ${a.num_value != null ? `<span class="chip ph">${esc(a.items?.num_label || "قراءة")}: ${
                a.num_value}${esc(a.items?.num_unit || "")}</span>` : ""}
              <p><b>الملاحظة:</b> ${esc(a.note || "—")}</p>
              <p><b>الإجراء:</b> ${esc(a.action || "—")} — ${esc(a.owner_name || "بلا مسؤول")}
                 · استحقاق ${esc(a.due_date || "—")}</p>
              ${shots.length ? `<div class="shots">${shots.map(u =>
                `<img src="${u}" alt="دليل مصوّر" loading="lazy">`).join("")}</div>` : ""}
            </div>
            <div class="st"><span class="pill ${cls}">${t}</span></div></div>`;
        }).join("")}</div>` : `<div class="card"><h2>الملاحظات</h2>
        <div class="empty">لا ملاحظات — كل البنود مطابقة.</div></div>`}

      <div class="card"><h2>كل البنود</h2>
        ${Object.keys(secs).map(s => `<div class="sec-h">${esc(s)}</div>` +
          secs[s].map(a => {
            const [t, cls] = a.value == null ? ["لا ينطبق", "n"] : (VAL[a.value] || ["—", "n"]);
            const shots = (a.photos || []).map(p => urls[p]).filter(Boolean);
            return `<div class="it">
              <div class="bd"><b>${esc(a.items ? a.items.title_ar : a.item_code)}</b>
              ${a.items && a.items.critical ? '<span class="chip cr">حرج</span>' : ""}
              ${a.num_value != null ? `<span class="chip ph">${esc(a.items?.num_label || "قراءة")}: ${
                a.num_value}${esc(a.items?.num_unit || "")}</span>` : ""}
              ${shots.length ? `<div class="shots">${shots.map(u =>
                `<img src="${u}" alt="دليل مصوّر" loading="lazy">`).join("")}</div>` : ""}
              </div>
              <div class="st"><span class="pill ${cls}">${t}</span></div></div>`;
          }).join("")).join("")}
        <div class="sign">
          <div>توقيع المنفِّذ — ${esc(ins.user_name)}</div>
          <div>توقيع مدير الفرع</div>
        </div>
        <p style="font-size:10.5px;color:var(--ink-3);margin-top:16px">
          كل صورة في هذا التقرير مختومة داخلها بالتاريخ والوقت والموقع وقت التقاطها،
          ولا يمكن رفعها من استوديو الجهاز. رقم التقرير ${esc(ins.id)}.</p>
      </div>`;

    const txt = `تقرير ${ins.templates.name_ar}\n${ins.branches.name_ar}\n` +
      `${fmtDate(ins.business_date)}${ins.shift ? " — " + SHIFT_AR[ins.shift] : ""}\n` +
      `النتيجة: ${n1(ins.score)}٪ (المستهدف ${n1(ins.branches.target_pct)}٪)` +
      `${ins.critical_fails ? `\n⚠️ ${ins.critical_fails} إخفاق حرج` : ""}` +
      `${issues.length ? `\nملاحظات مفتوحة: ${issues.length}` : ""}\n\n${location.href}`;

    $("#shareTxtBtn").onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title: "تقرير تشييك", text: txt }); return; } catch (_) { } }
      const box = document.createElement("div");
      box.className = "card noprint";
      box.innerHTML = `<h2>مشاركة التقرير</h2>
        <textarea style="min-height:150px">${esc(txt)}</textarea>
        <div class="row">
          <a class="btn p" style="text-align:center;text-decoration:none" target="_blank" rel="noopener"
             href="https://wa.me/${esc((ins.branches.phone || "").replace(/\D/g, ""))}?text=${encodeURIComponent(txt)}">واتساب</a>
          <a class="btn g" style="text-align:center;text-decoration:none"
             href="mailto:?subject=${encodeURIComponent("تقرير تشييك — " + ins.branches.name_ar)}&body=${encodeURIComponent(txt)}">إيميل</a>
          <button class="btn g" onclick="this.closest('.card').remove()">إغلاق</button></div>`;
      V().prepend(box); window.scrollTo({ top: 0, behavior: "smooth" });
    };

    /* ═══════════════════════════════════════════════════════════
       تقرير PDF احترافي — مستند A4 مبنيّ خصيصاً للطباعة
       ───────────────────────────────────────────────────────────
       لماذا صورة داخل PDF وليس نصاً؟ لأن مكتبات PDF لا تشكّل
       الحروف العربية ولا تصلها ببعضها، فتخرج الكلمات مقطّعة
       ومعكوسة. المتصفح يرسم العربية بشكل سليم، فنلتقط رسمه.
       ═══════════════════════════════════════════════════════════ */
    const BR = (C.BRANDS || {})[ins.branches.brand_code] || C.BRAND_FALLBACK ||
      { color: "#0B5F4E", dark: "#063B30", logo: "" };
    const BAND_HEX = { green: "#1a7a3c", amber: "#a86209", red: "#a32222" };
    const bandHex = b => BAND_HEX[b] || "#6d817a";

    /* رمز QR للتحقق — يفتح نسخة التقرير الحيّة على الإنترنت */
    function qrDataUrl(text, cell) {
      try {
        const q = qrcode(0, "M");
        q.addData(text); q.make();
        return q.createDataURL(cell || 4, 0);
      } catch (_) { return ""; }
    }

    /* قوس النتيجة — أوضح من دائرة مصمتة لأنه يُظهر البُعد عن ١٠٠ */
    function gauge(pct, size, color) {
      const sw = size * .11, r = (size - sw) / 2, c = 2 * Math.PI * r;
      const off = c * (1 - Math.max(0, Math.min(1, (pct || 0) / 100)));
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"
        style="transform:rotate(-90deg)">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#e6ece9" stroke-width="${sw}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>`;
    }

    const gap = Math.round(((+ins.score || 0) - (+ins.branches.target_pct || 0)) * 10) / 10;
    const openIssues = issues.length;
    const critN = ins.critical_fails || 0;

    function pdfDoc() {
      const S = `font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif`;
      const secRows = Object.keys(secs).map(s => {
        const p = secScore(secs[s]);
        const b = p == null ? "n" : p >= ins.branches.target_pct ? "green"
          : p >= ins.branches.target_pct - 10 ? "amber" : "red";
        const tgt = +ins.branches.target_pct || 0;
        return `<tr>
          <td style="padding:8px 4px;border-bottom:1px solid #eef2f0;font-size:12px">${esc(s)}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #eef2f0;width:230px">
            <div style="position:relative;height:11px;background:#eef2f0;border-radius:99px">
              <div style="height:100%;width:${p || 0}%;background:${bandHex(b)};
                border-radius:99px"></div>
              <!-- علامة المستهدف: تُظهر بُعد كل محور عن الهدف بنظرة -->
              <div style="position:absolute;top:-3px;bottom:-3px;inset-inline-start:${tgt}%;
                width:2px;background:#0d1a17;opacity:.55"></div>
            </div></td>
          <td style="padding:8px 4px;border-bottom:1px solid #eef2f0;width:56px;text-align:left;
            font-weight:800;direction:ltr;font-size:12.5px;color:${bandHex(b)}">${
              p == null ? "—" : p}</td></tr>`;
      }).join("");

      const meta = [
        ["المنفِّذ", esc(ins.user_name)],
        ["وقت الإرسال", ins.submitted_at ? esc(fmtTime(ins.submitted_at)) : "—"],
        ["المستهدف", `<span dir="ltr">${n1(ins.branches.target_pct)}٪</span>`],
        ["الحالة", `<b style="color:${bandHex(ins.band)}">${BAND_AR[ins.band] || "—"}</b>`],
        ["البنود المنجزة", `<span dir="ltr">${ins.items_done} / ${ins.items_total}</span>`],
        ["التوثيق الجغرافي", ins.geofence_ok === true
          ? `داخل النطاق — <span dir="ltr">${ins.distance_m ?? "—"}</span> م`
          : ins.geofence_ok === false ? `<b style="color:#a32222">خارج النطاق</b>` : "غير متاح"],
        ["دقة الموقع", `<span dir="ltr">${ins.accuracy_m ?? "—"}</span> م`],
        ["الإحداثيات", ins.lat != null
          ? `<span dir="ltr" style="font-size:10.5px">${ins.lat.toFixed(5)}, ${ins.lng.toFixed(5)}</span>` : "—"]
      ].map(([k, v]) => `<div style="background:#f6f9f7;border-radius:7px;padding:8px 10px">
        <div style="font-size:10px;color:#6d817a">${k}</div>
        <div style="font-size:12.5px;font-weight:600;margin-top:1px">${v}</div></div>`).join("");

      const issueRows = issues.map(a => {
        const [t] = VAL[a.value] || ["—"];
        const cl = a.value === 0 ? "#a32222" : "#a86209";
        const shots = (a.photos || []).map(p => urls[p]).filter(Boolean);
        return `<div style="border:1px solid #e6ece9;border-radius:9px;padding:11px 12px;
          margin-bottom:9px;border-inline-start:4px solid ${cl}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <b style="font-size:13px">${esc(a.items ? a.items.title_ar : a.item_code)}</b>
            <span style="flex:0 0 auto;background:${cl};color:#fff;border-radius:99px;
              padding:2px 10px;font-size:10.5px;font-weight:700">${t}</span></div>
          ${a.items && a.items.critical ? `<span style="display:inline-block;margin-top:5px;
            background:#f8dede;color:#a32222;border-radius:99px;padding:1px 8px;
            font-size:10px;font-weight:700">بند حرج</span>` : ""}
          ${a.num_value != null ? `<span style="display:inline-block;margin-top:5px;
            margin-inline-start:5px;background:#eef2f0;border-radius:99px;padding:1px 8px;
            font-size:10px">${esc(a.items?.num_label || "قراءة")}:
            <span dir="ltr">${a.num_value}${esc(a.items?.num_unit || "")}</span></span>` : ""}
          <div style="font-size:12px;margin-top:7px;line-height:1.75">
            <div><b>الملاحظة:</b> ${esc(a.note || "—")}</div>
            <div><b>الإجراء التصحيحي:</b> ${esc(a.action || "—")}</div>
            <div><b>المسؤول:</b> ${esc(a.owner_name || "—")} ·
              <b>الاستحقاق:</b> <span dir="ltr">${esc(a.due_date || "—")}</span></div></div>
          ${shots.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${
            shots.map(u => `<img src="${u}" crossorigin="anonymous" style="width:168px;height:126px;
              object-fit:cover;border-radius:6px;border:1px solid #d5e0db">`).join("")}</div>` : ""}
        </div>`;
      }).join("");

      const allRows = Object.keys(secs).map(s =>
        `<div style="font-size:10.5px;letter-spacing:.1em;font-weight:700;color:${BR.color};
          margin:13px 0 5px">${esc(s)}</div>` +
        secs[s].map(a => {
          const [t] = a.value == null ? ["لا ينطبق"] : (VAL[a.value] || ["—"]);
          const cl = a.value === 2 ? "#1a7a3c" : a.value === 1 ? "#a86209"
            : a.value === 0 ? "#a32222" : "#8b9a95";
          /* الاسم أولاً ثم الحالة — نفس ترتيب الشاشة تماماً */
          return `<div style="display:flex;gap:9px;align-items:center;padding:5px 0;
            border-bottom:1px solid #f2f6f4;font-size:11.5px">
            <span style="flex:1">${esc(a.items ? a.items.title_ar : a.item_code)}${
              a.items && a.items.critical ? ' <span style="color:#a32222;font-size:9.5px">◆ حرج</span>' : ""}</span>
            <span style="flex:0 0 72px;color:${cl};font-weight:700;text-align:end">${t}</span>
          </div>`;
        }).join("")).join("");

      return `<div style="${S};width:794px;background:#fff;color:#0d1a17;direction:rtl">

        <!-- ترويسة -->
        <section class="blk" style="padding:0 0 16px">
          <div style="height:7px;background:linear-gradient(90deg,${BR.dark},${BR.color})"></div>
          <div style="padding:20px 46px 0;display:flex;align-items:flex-start;
            justify-content:space-between;gap:16px">
            <div style="display:flex;align-items:center;gap:13px">
              ${BR.logo ? `<div style="width:60px;height:60px;border-radius:14px;background:#fff;
                border:1px solid #e6ece9;display:flex;align-items:center;justify-content:center;
                overflow:hidden"><img src="${esc(BR.logo)}" style="width:100%;height:100%;
                object-fit:contain;padding:3px"></div>` : ""}
              <div><div style="font-size:19px;font-weight:800;letter-spacing:-.01em">${
                esc(ins.branches.name_ar)}</div>
                <div style="font-size:11.5px;color:#6d817a;margin-top:2px">${esc(C.company)}
                  · <span dir="ltr">${esc(ins.branches.code || "")}</span></div></div>
            </div>
            <div style="text-align:left">
              <img src="logo-sevenicons.png" style="height:40px;object-fit:contain;display:block;
                margin-inline-start:auto">
              <div style="font-size:9.5px;color:#8b9a95;margin-top:5px;direction:ltr">
                REF ${esc(String(ins.id).slice(0, 8).toUpperCase())}</div>
            </div>
          </div>
          <div style="margin:15px 46px 0;padding:11px 16px;border-radius:10px;
            background:linear-gradient(100deg,${BR.dark},${BR.color});color:#fff;
            display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div style="font-size:15px;font-weight:800">${esc(ins.templates.name_ar)}${
              ins.shift ? " — تشييك " + SHIFT_AR[ins.shift] : ""}</div>
            <div style="font-size:12px;opacity:.92">${esc(fmtDate(ins.business_date))}</div>
          </div>
        </section>

        <!-- النتيجة والمؤشرات -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="display:flex;align-items:center;gap:20px;background:#f6f9f7;
            border:1px solid #e6ece9;border-radius:12px;padding:16px 18px">
            <div style="flex:0 0 auto;position:relative;width:104px;height:104px">
              ${gauge(+ins.score || 0, 104, bandHex(ins.band))}
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;
                align-items:center;justify-content:center">
                <div style="font-size:25px;font-weight:800;direction:ltr;line-height:1;
                  color:${bandHex(ins.band)}">${n1(ins.score)}</div>
                <div style="font-size:9.5px;color:#6d817a;margin-top:3px">من ١٠٠</div></div>
            </div>
            <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:9px">
              <div style="background:#fff;border:1px solid #e6ece9;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;color:#6d817a">الحالة</div>
                <div style="font-size:14px;font-weight:800;color:${bandHex(ins.band)};margin-top:2px">${
                  BAND_AR[ins.band] || "—"}</div></div>
              <div style="background:#fff;border:1px solid #e6ece9;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;color:#6d817a">المستهدف</div>
                <div style="font-size:14px;font-weight:800;margin-top:2px;direction:ltr">${
                  n1(ins.branches.target_pct)}٪</div></div>
              <div style="background:#fff;border:1px solid #e6ece9;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;color:#6d817a">الفارق</div>
                <div style="font-size:14px;font-weight:800;margin-top:2px;direction:ltr;
                  color:${gap >= 0 ? "#1a7a3c" : "#a32222"}">${gap >= 0 ? "+" : ""}${gap}</div></div>
              <div style="background:#fff;border:1px solid #e6ece9;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;color:#6d817a">البنود</div>
                <div style="font-size:14px;font-weight:800;margin-top:2px;direction:ltr">${
                  ins.items_done}/${ins.items_total}</div></div>
              <div style="background:#fff;border:1px solid #e6ece9;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;color:#6d817a">الملاحظات</div>
                <div style="font-size:14px;font-weight:800;margin-top:2px;direction:ltr;
                  color:${openIssues ? "#a86209" : "#1a7a3c"}">${openIssues}</div></div>
              <div style="background:#fff;border:1px solid ${critN ? "#a32222" : "#e6ece9"};
                border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;color:#6d817a">إخفاق حرج</div>
                <div style="font-size:14px;font-weight:800;margin-top:2px;direction:ltr;
                  color:${critN ? "#a32222" : "#1a7a3c"}">${critN}</div></div>
            </div>
          </div>
          ${critN ? `<div style="margin-top:10px;background:#f8dede;
            border:1px solid #a32222;border-radius:9px;padding:11px 14px;font-size:12.5px">
            <b style="color:#a32222">إنذار حرج</b> — <span dir="ltr">${critN}</span>
            بنداً حرجاً غير مطابق. القاعدة: أي بند حرج غير مطابق يجعل التقييم أحمر
            مهما كانت النتيجة، ويجب إغلاقه خلال ٢٤ ساعة.</div>` : ""}
        </section>

        <!-- بيانات التوثيق -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">بيانات التوثيق</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${meta}</div>
        </section>

        <!-- أداء المحاور -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:3px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">أداء المحاور</div>
          <div style="font-size:10.5px;color:#8b9a95;margin:0 0 7px 12px">الخط الرأسي الداكن
            = مستهدف الفرع <span dir="ltr">(${n1(ins.branches.target_pct)}٪)</span></div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">${secRows}</table>
        </section>

        <!-- الملاحظات -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">
            الملاحظات ودليلها المصوّر${issues.length ? ` (${issues.length})` : ""}</div>
          ${issues.length ? issueRows : `<div style="background:#dff0e4;border-radius:9px;
            padding:14px;font-size:12.5px;color:#1a7a3c;font-weight:600">
            لا ملاحظات — كل البنود مطابقة.</div>`}
        </section>

        <!-- كل البنود -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:2px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">سجل البنود كاملاً</div>
          ${allRows}
        </section>

        <!-- ملحق الأدلة المصوّرة -->
        ${shotList.length ? `
        <section class="blk" style="padding:6px 46px 10px">
          <div style="font-size:13px;font-weight:800;margin-bottom:4px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">
            ملحق الأدلة المصوّرة</div>
          <div style="font-size:10.5px;color:#8b9a95;line-height:1.8">
            كل صورة بحجمها الكامل ليُقرأ ما فيها — قراءة مقياس الحرارة، تاريخ الملصق،
            حالة السطح. الختم داخل الصورة يحمل الوقت والإحداثيات لحظة التقاطها.
            ${shotList.length > SHOT_CAP ? `<br>معروض ${SHOT_CAP} من
              <span dir="ltr">${shotList.length}</span> صورة — الباقي في التقرير الإلكتروني.` : ""}
          </div>
        </section>
        ${shotList.slice(0, SHOT_CAP).map((s, i) => `
        <section class="blk" style="padding:10px 46px 6px">
          <div style="border:1px solid #e6ece9;border-radius:10px;overflow:hidden">
            <div style="display:flex;align-items:center;gap:9px;padding:9px 12px;
              background:#f6f9f7;border-bottom:1px solid #e6ece9">
              <span style="flex:0 0 auto;width:22px;height:22px;border-radius:50%;
                background:${BR.color};color:#fff;font-size:11px;font-weight:800;
                display:flex;align-items:center;justify-content:center" dir="ltr">${i + 1}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:800">${esc(s.title)}</div>
                <div style="font-size:10px;color:#6d817a">${esc(s.section)}</div>
              </div>
              ${s.critical ? `<span style="flex:0 0 auto;background:#f8dede;color:#a32222;
                border-radius:99px;padding:2px 9px;font-size:9.5px;font-weight:800">حرج</span>` : ""}
              <span style="flex:0 0 auto;background:${
                s.value === 0 ? "#a32222" : s.value === 1 ? "#a86209" : "#1a7a3c"};color:#fff;
                border-radius:99px;padding:2px 10px;font-size:9.5px;font-weight:800">${
                s.value === 0 ? "غير مطابق" : s.value === 1 ? "جزئي" : "مطابق"}</span>
            </div>
            <img src="${s.url}" crossorigin="anonymous"
              style="display:block;width:100%;max-height:420px;object-fit:contain;background:#fff">
          </div>
        </section>`).join("")}` : ""}

        <!-- التوقيعات والتذييل -->
        <section class="blk" style="padding:6px 46px 30px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:14px">
            <div style="border-top:1px solid #b9c8c2;padding-top:7px;font-size:11.5px;color:#6d817a">
              توقيع المنفِّذ — ${esc(ins.user_name)}</div>
            <div style="border-top:1px solid #b9c8c2;padding-top:7px;font-size:11.5px;color:#6d817a">
              توقيع مدير الفرع</div>
          </div>
          <div style="margin-top:20px;padding-top:13px;border-top:1px solid #eef2f0;
            display:flex;gap:16px;align-items:flex-start">
            ${qrDataUrl(location.href.split("&share")[0], 3)
              ? `<div style="flex:0 0 auto;text-align:center">
                  <img src="${qrDataUrl(location.href.split("&share")[0], 3)}"
                    style="width:82px;height:82px;display:block">
                  <div style="font-size:8.5px;color:#8b9a95;margin-top:3px">امسح للتحقق</div>
                </div>` : ""}
            <div style="flex:1;font-size:10px;color:#8b9a95;line-height:1.9">
              كل صورة في هذا التقرير مختومة داخل بكسلاتها بالتاريخ والوقت والإحداثيات لحظة
              التقاطها، ولا يمكن رفعها من استوديو الجهاز. والنتيجة محسوبة على خادم قاعدة
              البيانات لا في المتصفح، فلا يمكن تعديلها من جهة المستخدم.<br>
              رقم التقرير <span dir="ltr">${esc(ins.id)}</span><br>
              صدر في <span dir="ltr">${new Date().toLocaleString("ar-KW", { timeZone: C.TZ })}</span>
              · ${esc(C.company)}
            </div>
          </div>
        </section>
      </div>`;
    }

    /* ═══════════════════════════════════════════════════════════
       بطاقة الواتساب — 1080×1350
       ───────────────────────────────────────────────────────────
       ملف PDF يظهر في الواتساب كأيقونة ملف مغلقة، لا يراها أحد
       إلا إذا ضغط عليها. الصورة تظهر داخل المحادثة فوراً.
       فنرسل الاثنين: الصورة تُقرأ في ثانية، والـPDF للتفاصيل والأرشفة.
       ═══════════════════════════════════════════════════════════ */
    function cardDoc() {
      const top = issues.slice(0, 4);
      const secList = Object.keys(secs).slice(0, 6).map(s => {
        const p = secScore(secs[s]);
        const b = p == null ? "n" : p >= ins.branches.target_pct ? "green"
          : p >= ins.branches.target_pct - 10 ? "amber" : "red";
        return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:13px">
          <div style="flex:0 0 300px;font-size:26px;font-weight:600;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap">${esc(s)}</div>
          <div style="flex:1;height:16px;background:rgba(255,255,255,.16);border-radius:99px">
            <div style="height:100%;width:${p || 0}%;background:${bandHex(b)};border-radius:99px"></div></div>
          <div style="flex:0 0 74px;text-align:left;font-size:26px;font-weight:800;
            direction:ltr">${p == null ? "—" : p}</div></div>`;
      }).join("");

      return `<div style="width:1080px;height:1350px;position:relative;overflow:hidden;
        background:linear-gradient(160deg,${BR.dark} 0%,${BR.color} 78%,${BR.color} 100%);
        color:#fff;font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;direction:rtl">

        <div style="position:absolute;inset-inline-end:-160px;top:-160px;width:620px;height:620px;
          border-radius:50%;background:rgba(255,255,255,.07)"></div>

        <div style="position:relative;padding:56px 60px 0;display:flex;
          justify-content:space-between;align-items:flex-start">
          <div style="display:flex;align-items:center;gap:20px">
            ${BR.logo ? `<div style="width:104px;height:104px;border-radius:26px;background:#fff;
              display:flex;align-items:center;justify-content:center;overflow:hidden">
              <img src="${esc(BR.logo)}" style="width:100%;height:100%;object-fit:contain;padding:7px"></div>` : ""}
            <div><div style="font-size:44px;font-weight:900;letter-spacing:-.02em">${
              esc(ins.branches.name_ar)}</div>
              <div style="font-size:24px;opacity:.85;margin-top:4px">${esc(C.company)}</div></div>
          </div>
          <div style="background:#fff;border-radius:20px;padding:12px 16px">
            <img src="logo-sevenicons.png" style="height:52px;object-fit:contain;display:block"></div>
        </div>

        <div style="position:relative;margin:44px 60px 0;background:rgba(255,255,255,.13);
          border:1px solid rgba(255,255,255,.22);border-radius:30px;padding:34px 38px;
          display:flex;align-items:center;gap:36px">
          <div style="flex:0 0 auto;width:224px;height:224px;border-radius:50%;background:#fff;
            display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="font-size:82px;font-weight:900;direction:ltr;line-height:1;
              color:${bandHex(ins.band)}">${n1(ins.score)}</div>
            <div style="font-size:24px;color:#6d817a;margin-top:6px">من ١٠٠</div></div>
          <div style="flex:1">
            <div style="font-size:36px;font-weight:800;line-height:1.3">${
              esc(ins.templates.name_ar)}${ins.shift ? "<br>تشييك " + SHIFT_AR[ins.shift] : ""}</div>
            <div style="font-size:26px;opacity:.88;margin-top:10px">${esc(fmtDate(ins.business_date))}</div>
            <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
              <span style="background:${bandHex(ins.band)};border-radius:99px;padding:8px 20px;
                font-size:24px;font-weight:800">${BAND_AR[ins.band] || "—"}</span>
              <span style="background:rgba(255,255,255,.18);border-radius:99px;padding:8px 20px;
                font-size:24px">المستهدف <span dir="ltr">${n1(ins.branches.target_pct)}</span></span>
              ${critN ? `<span style="background:#a32222;border-radius:99px;padding:8px 20px;
                font-size:24px;font-weight:800"><span dir="ltr">${critN}</span> إخفاق حرج</span>` : ""}
            </div>
          </div>
        </div>

        <div style="position:relative;margin:34px 60px 0">
          <div style="font-size:25px;font-weight:800;opacity:.8;margin-bottom:16px">أداء المحاور</div>
          ${secList}
        </div>

        <div style="position:relative;margin:26px 60px 0">
          ${top.length ? `<div style="font-size:25px;font-weight:800;opacity:.8;margin-bottom:14px">
            أبرز الملاحظات <span dir="ltr">(${openIssues})</span></div>` +
            top.map(a => `<div style="display:flex;gap:13px;align-items:flex-start;
              margin-bottom:11px;font-size:25px;line-height:1.45">
              <span style="flex:0 0 auto;width:13px;height:13px;border-radius:50%;margin-top:9px;
                background:${a.value === 0 ? "#ff8080" : "#ffd280"}"></span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${
                esc(a.items ? a.items.title_ar : a.item_code)}</span></div>`).join("") +
            (openIssues > top.length ? `<div style="font-size:23px;opacity:.7;margin-top:8px">
              و<span dir="ltr">${openIssues - top.length}</span> ملاحظة أخرى في التقرير الكامل</div>` : "")
          : `<div style="background:rgba(255,255,255,.14);border-radius:20px;padding:26px;
              font-size:28px;font-weight:700;text-align:center">لا ملاحظات — كل البنود مطابقة ✓</div>`}
        </div>

        <div style="position:absolute;inset-inline:60px;bottom:44px;display:flex;
          justify-content:space-between;align-items:flex-end;
          border-top:1px solid rgba(255,255,255,.2);padding-top:22px">
          <div style="font-size:21px;opacity:.8;line-height:1.6">
            نفّذه ${esc(ins.user_name)}<br>
            موثّق من داخل الفرع · دقة <span dir="ltr">${ins.accuracy_m ?? "—"}</span> م</div>
          <div style="font-size:20px;opacity:.7;direction:ltr">REF ${
            esc(String(ins.id).slice(0, 8).toUpperCase())}</div>
        </div>
      </div>`;
    }

    /* ═══════════════════════════════════════════════════════════
       تضمين الخط العربي داخل نسخة html2canvas
       ───────────────────────────────────────────────────────────
       html2canvas ينسخ العنصر إلى إطار معزول ثم يرسم النص هناك.
       الخط المحمَّل من Google Fonts لا ينتقل مع النسخة، فيسقط
       المتصفح إلى خط بديل لا يعرف وصل الحروف العربية — فتخرج
       الكلمات مقطّعة الحروف ومعكوسة الترتيب.

       الحل: نجلب ملف الخط ونحوّله base64 ونحقنه داخل النسخة عبر
       onclone، فيصبح الخط جزءاً من المستند المرسوم لا مرجعاً خارجياً.
       ═══════════════════════════════════════════════════════════ */
    const AR_STACK = `'IBM Plex Sans Arabic','Noto Naskh Arabic','Geeza Pro',` +
                     `'Segoe UI',Tahoma,Arial,sans-serif`;
    let FONT_CSS;                       // undefined = لم يُحاول · "" = فشل · نص = جاهز

    /* أي انتظار بلا مهلة = تطبيق متجمّد. كل جلب هنا محدود بزمن. */
    const withTimeout = (p, ms, label) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT:" + (label || ""))), ms))
    ]);
    const fetchT = (u, ms) => withTimeout(fetch(u), ms || 7000, u);

    /* يمنح المتصفح فرصة لرسم الشاشة — بدونه يبدو التطبيق معلّقاً
       حتى لو كان يعمل، لأن الرسم يحجز الخيط الرئيسي بالكامل. */
    const breathe = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    async function arabicFontCss(){
      if (FONT_CSS !== undefined) return FONT_CSS;
      FONT_CSS = "";
      try{
        const src = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap";
        const css = await (await fetchT(src, 6000)).text();

        /* نأخذ كتل @font-face التي تغطي النطاق العربي فقط —
           تضمين اللاتينية والسيريلية يضخّم الحجم بلا فائدة. */
        const blocks = css.split("@font-face").slice(1)
          .map(b => "@font-face" + b.slice(0, b.indexOf("}") + 1))
          .filter(b => /U\+0[67]/i.test(b) || !/unicode-range/i.test(b));

        const out = [];
        for (const b of blocks.slice(0, 3)){          /* ثلاثة أوزان تكفي */
          const m = b.match(/url\((https:[^)]+\.woff2)\)/);
          if (!m) continue;
          const buf = await (await fetchT(m[1], 7000)).arrayBuffer();
          let bin = "", bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 8192)
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
          out.push(b.replace(m[0], `url(data:font/woff2;base64,${btoa(bin)}) format('woff2')`));
          await breathe();
        }
        FONT_CSS = out.join("\n");
      }catch(e){
        /* فشل التضمين ليس خطأً قاتلاً — سلسلة الخطوط الاحتياطية
           فيها خطوط عربية موجودة على الجهاز أصلاً. */
        console.warn("[pdf] تعذّر تضمين الخط — سنعتمد على خطوط النظام", e);
      }
      return FONT_CSS;
    }

    /* يُمرَّر لـ html2canvas: يحقن الخط ويوحّد الإعدادات داخل النسخة */
    function onCloneFix(doc){
      const st = doc.createElement("style");
      st.textContent =
        (FONT_CSS || "") +
        `\n*{font-family:${AR_STACK} !important;letter-spacing:normal !important;` +
        `word-spacing:normal !important;text-rendering:auto !important}` +
        `\nbody{margin:0}`;
      doc.head.appendChild(st);
    }

    /* لا نرسم قبل أن يكون الخط جاهزاً فعلاً في المستند الأصلي أيضاً */
    async function fontsReady(){
      try{
        await withTimeout(arabicFontCss(), 16000, "font").catch(()=>{});
        if (document.fonts){
          await withTimeout(Promise.all([
            document.fonts.load("400 14px 'IBM Plex Sans Arabic'", "تشييك"),
            document.fonts.load("700 14px 'IBM Plex Sans Arabic'", "تشييك"),
            document.fonts.load("900 14px 'Noto Kufi Arabic'", "تشييك")
          ]), 6000, "fontload").catch(()=>{});
          await withTimeout(document.fonts.ready, 4000, "fontsready").catch(()=>{});
        }
      }catch(_){}
    }

    /* ═══════════════════════════════════════════════════════════
       عارض الصور — تكبير وتصغير وسحب
       ───────────────────────────────────────────────────────────
       الدليل المصوّر هو جوهر التقرير: صورة ثلاجة أو ملصق تاريخ
       بحجم 190 بكسل لا تُثبت شيئاً. هنا تُفتح بملء الشاشة وتُقرّب
       حتى تُقرأ الأرقام على المقياس.
       ═══════════════════════════════════════════════════════════ */
    function zoomView(list, start){
      if (!list || !list.length) return;
      let i = Math.max(0, Math.min(start || 0, list.length - 1));
      let s = 1, tx = 0, ty = 0;          /* التكبير والإزاحة */
      const MIN = 1, MAX = 6;

      const el = document.createElement("div");
      el.className = "zv";
      el.innerHTML = `
        <div class="zv-bar">
          <span class="zv-cap"></span>
          <span class="zv-cnt"></span>
          <button class="zv-x" aria-label="إغلاق">✕</button>
        </div>
        <div class="zv-stage"><img alt=""><div class="zv-hint">قرّب بإصبعين · انقر مرتين للتكبير</div></div>
        <div class="zv-tools">
          <button data-a="prev" aria-label="السابقة">›</button>
          <button data-a="out"  aria-label="تصغير">−</button>
          <button data-a="fit"  aria-label="ملء الشاشة">⤢</button>
          <button data-a="in"   aria-label="تكبير">+</button>
          <button data-a="next" aria-label="التالية">‹</button>
        </div>`;
      document.body.appendChild(el);
      document.body.style.overflow = "hidden";

      const img   = el.querySelector("img");
      const stage = el.querySelector(".zv-stage");
      const hint  = el.querySelector(".zv-hint");
      const cnt   = el.querySelector(".zv-cnt");
      const cap   = el.querySelector(".zv-cap");

      const apply = (animate) => {
        img.classList.toggle("anim", !!animate);
        img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
        el.querySelector('[data-a=out]').disabled = s <= MIN + .01;
        el.querySelector('[data-a=in]').disabled  = s >= MAX - .01;
        hint.style.opacity = s > 1.05 ? 0 : "";
      };
      const reset = (animate) => { s = 1; tx = ty = 0; apply(animate); };

      const show = () => {
        const it = list[i];
        img.src = it.url;
        cap.textContent = it.title || "";
        cnt.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";
        el.querySelector('[data-a=prev]').disabled = i === 0;
        el.querySelector('[data-a=next]').disabled = i === list.length - 1;
        reset(false);
      };

      const zoomAt = (f, cx, cy) => {
        const ns = Math.max(MIN, Math.min(MAX, s * f));
        if (ns === s) return;
        const r = stage.getBoundingClientRect();
        /* أبقِ النقطة تحت الإصبع ثابتة أثناء التقريب */
        const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
        tx = px - (px - tx) * (ns / s);
        ty = py - (py - ty) * (ns / s);
        s = ns;
        if (s <= MIN + .01) { tx = ty = 0; }
        apply(true);
      };

      const close = () => {
        el.remove();
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKey);
      };
      const onKey = e => {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowRight" && i > 0) { i--; show(); }
        else if (e.key === "ArrowLeft" && i < list.length - 1) { i++; show(); }
        else if (e.key === "+" || e.key === "=") zoomAt(1.4, innerWidth/2, innerHeight/2);
        else if (e.key === "-") zoomAt(1/1.4, innerWidth/2, innerHeight/2);
      };
      document.addEventListener("keydown", onKey);
      el.querySelector(".zv-x").onclick = close;

      el.querySelectorAll(".zv-tools button").forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === "in")   zoomAt(1.5, innerWidth/2, innerHeight/2);
        if (a === "out")  zoomAt(1/1.5, innerWidth/2, innerHeight/2);
        if (a === "fit")  reset(true);
        if (a === "prev" && i > 0) { i--; show(); }
        if (a === "next" && i < list.length - 1) { i++; show(); }
      });

      /* عجلة الفأرة على سطح المكتب */
      stage.addEventListener("wheel", e => {
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.16 : 1/1.16, e.clientX, e.clientY);
      }, { passive: false });

      /* ── اللمس: سحب بإصبع · تقريب بإصبعين · نقرتان للتبديل ── */
      let pts = new Map(), startD = 0, startS = 1, lastTap = 0, panFrom = null;
      const dist = a => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      const mid  = a => ({ x:(a[0].x + a[1].x)/2, y:(a[0].y + a[1].y)/2 });

      stage.addEventListener("pointerdown", e => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
        const a = [...pts.values()];
        if (a.length === 2){ startD = dist(a); startS = s; }
        else if (a.length === 1 && s > 1) panFrom = { x:e.clientX - tx, y:e.clientY - ty };
      });

      stage.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
        const a = [...pts.values()];
        if (a.length === 2 && startD){
          const m = mid(a), ns = Math.max(MIN, Math.min(MAX, startS * (dist(a)/startD)));
          const r = stage.getBoundingClientRect();
          const px = m.x - r.left - r.width/2, py = m.y - r.top - r.height/2;
          tx = px - (px - tx) * (ns/s); ty = py - (py - ty) * (ns/s); s = ns;
          apply(false);
        } else if (a.length === 1 && panFrom && s > 1){
          tx = e.clientX - panFrom.x; ty = e.clientY - panFrom.y;
          apply(false);
        }
      });

      const up = e => {
        pts.delete(e.pointerId);
        if (pts.size < 2) startD = 0;
        if (pts.size === 0){
          panFrom = null;
          if (s <= MIN + .01){ tx = ty = 0; apply(true); }
        }
      };
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);

      /* نقرتان: تكبير/إرجاع — ونقرة واحدة على الخلفية تُغلق */
      stage.addEventListener("click", e => {
        const now = Date.now();
        if (now - lastTap < 300){
          lastTap = 0;
          s > 1.05 ? reset(true) : zoomAt(2.6, e.clientX, e.clientY);
          return;
        }
        lastTap = now;
        setTimeout(() => {
          if (lastTap && Date.now() - lastTap >= 290 && e.target === stage && s <= 1.05) close();
        }, 310);
      });

      show();
    }

    /* أي صورة في التقرير تُفتح في العارض — مع كل صور نفس البند */
    V().addEventListener("click", e => {
      const im = e.target.closest(".shots img");
      if (!im) return;
      e.preventDefault(); e.stopPropagation();
      const box = im.closest(".shots");
      const all = Array.from(box.querySelectorAll("img")).map(x => ({
        url: x.dataset.full || x.src,
        title: box.closest(".it")?.querySelector(".bd b")?.textContent || ""
      }));
      zoomView(all, Array.from(box.querySelectorAll("img")).indexOf(im));
    });

    const waitEl = document.getElementById("pdfwait");
    const stepEl = document.getElementById("pdfStep");
    const barEl  = document.getElementById("pdfBar");
    let CANCEL = false;

    const wait = (on, msg, pct) => {
      waitEl.classList.toggle("hide", !on);
      if (msg) stepEl.textContent = msg;
      if (barEl) barEl.style.width = pct == null ? "" : Math.round(pct * 100) + "%";
      if (on === false) CANCEL = false;
    };

    /* زر إلغاء — شاشة انتظار بلا مخرج أسوأ من الانتظار نفسه */
    document.getElementById("pdfCancel").onclick = () => {
      CANCEL = true;
      wait(false);
      const st = document.getElementById("pdfstage");
      if (st) st.innerHTML = "";
    };

    /* الأجهزة الضعيفة تختنق عند scale 2 — نخفّضه تلقائياً.
       الفرق في وضوح الـPDF طفيف، والفرق في احتمال التجمّد كبير. */
    const SCALE = (navigator.deviceMemory && navigator.deviceMemory <= 4) ? 1.4 : 1.8;

    async function makePdfBlob() {
      const stage = document.getElementById("pdfstage");
      stage.innerHTML = pdfDoc();

      wait(true, "تجهيز الخط العربي");
      await fontsReady();
      if (CANCEL) throw new Error("CANCELLED");

      wait(true, "تحميل الصور");
      /* لا نلتقط قبل اكتمال تحميل كل صورة، وإلا خرجت مربعات فارغة.
         المهلة 6 ثوانٍ لكل صورة — الصورة التي لا تصل لا تُعطّل التقرير. */
      await Promise.all(Array.from(stage.querySelectorAll("img")).map(img =>
        img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise(res => { img.onload = img.onerror = res; setTimeout(res, 6000); })));
      await breathe();
      if (CANCEL) throw new Error("CANCELLED");

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "p" });
      const PW = 210, PH = 297, M = 0;
      const blocks = Array.from(stage.querySelectorAll(".blk"));
      let y = M, first = true, n = 0;

      for (const blk of blocks) {
        n++;
        wait(true, `رسم الصفحات — ${n} من ${blocks.length}`, n / blocks.length);
        await breathe();                       /* دع الشاشة تُحدَّث قبل الرسم الثقيل */
        if (CANCEL) throw new Error("CANCELLED");

        const cv = await withTimeout(html2canvas(blk, {
          scale: SCALE, useCORS: true, backgroundColor: "#ffffff", logging: false,
          windowWidth: 794, width: 794, onclone: onCloneFix, imageTimeout: 6000
        }), 30000, "canvas");
        const hMM = cv.height * PW / cv.width;
        const img = cv.toDataURL("image/jpeg", 0.92);

        if (hMM > PH - 2 * M) {
          /* كتلة أطول من صفحة — نقسّمها على صفحات */
          let off = 0;
          while (off < hMM - .5) {
            if (!first) pdf.addPage(); first = false;
            pdf.addImage(img, "JPEG", 0, M - off, PW, hMM, undefined, "FAST");
            /* غطِّ ما يتجاوز حدود الصفحة حتى لا يظهر جزء مقصوص */
            pdf.setFillColor(255, 255, 255);
            pdf.rect(0, PH - M, PW, M + 2, "F");
            off += PH - 2 * M;
          }
          y = M;
        } else {
          if (!first && y + hMM > PH - M) { pdf.addPage(); y = M; }
          first = false;
          pdf.addImage(img, "JPEG", 0, y, PW, hMM, undefined, "FAST");
          y += hMM;
        }
      }

      /* أرقام الصفحات — بأرقام لاتينية لأن خط jsPDF الافتراضي لا يرسم العربية */
      const np = pdf.getNumberOfPages();
      for (let i = 1; i <= np; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
        pdf.text(`${i} / ${np}`, PW / 2, PH - 6, { align: "center" });
      }

      stage.innerHTML = "";
      return pdf.output("blob");
    }

    /* صورة البطاقة — ما يظهر داخل محادثة الواتساب */
    async function makeCardBlob() {
      const stage = document.getElementById("pdfstage");
      stage.innerHTML = cardDoc();
      wait(true, "تجهيز بطاقة المشاركة", .15);
      await fontsReady();
      if (CANCEL) throw new Error("CANCELLED");
      await Promise.all(Array.from(stage.querySelectorAll("img")).map(img =>
        img.complete && img.naturalWidth ? Promise.resolve()
          : new Promise(res => { img.onload = img.onerror = res; setTimeout(res, 6000); })));
      await breathe();
      if (CANCEL) throw new Error("CANCELLED");
      const cv = await withTimeout(html2canvas(stage.firstElementChild, {
        scale: 1, useCORS: true, backgroundColor: null, logging: false,
        width: 1080, height: 1350, windowWidth: 1080, onclone: onCloneFix, imageTimeout: 6000
      }), 30000, "card");
      stage.innerHTML = "";
      return new Promise(res => cv.toBlob(res, "image/jpeg", 0.92));
    }

    const pdfName = () => `تقرير-${(ins.branches.name_ar || "").replace(/\s+/g, "-")}` +
      `-${ins.business_date}${ins.shift ? "-" + SHIFT_AR[ins.shift] : ""}.pdf`;


    /* ── المشاركة الكاملة: صورة تظهر في المحادثة + PDF للتفاصيل ── */
    let READY = null;              // { files, cap, cardBlob, pdfBlob } بعد التجهيز
    const dl = (blob, name) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    const cardName = () => pdfName().replace(/\.pdf$/, "") + ".jpg";

    /* زر PDF = تنزيل مباشر لا مشاركة.
       التنزيل عبر <a download> لا يحتاج «تفعيلاً مؤقّتاً» فلا يُرفض،
       بخلاف navigator.share. أما المشاركة فلها زرها بمساره الصحيح. */
    document.getElementById("sharePdfBtn").onclick = async () => {
      const btn = document.getElementById("sharePdfBtn");
      btn.disabled = true;
      try {
        const blob = (READY && READY.pdfBlob) || await makePdfBlob();
        wait(false);
        dl(blob, pdfName());
      } catch (e) {
        wait(false);
        alert("تعذّر تجهيز الـPDF: " + (e && e.message ? e.message : e));
      } finally { btn.disabled = false; wait(false); }
    };

    /* ═══════════════════════════════════════════════════════════
       المشاركة على خطوتين — وهذا ليس تعقيداً بل ضرورة
       ───────────────────────────────────────────────────────────
       iOS و Safari لا يسمحان باستدعاء navigator.share إلا داخل
       «تفعيل مؤقّت» ناتج عن لمسة المستخدم، وهذا التفعيل ينتهي بعد
       ثوانٍ. وتجهيز الصورة والـPDF يستغرق 5–15 ثانية، فحين يصل
       الدور للمشاركة يكون التفعيل قد انتهى فيُرفض الطلب برسالة
       «The request is not allowed…».

       الحل: نجهّز الملفات أولاً ونحتفظ بها، ثم نعرض زر مشاركة
       يستدعي navigator.share فوراً داخل اللمسة نفسها.
       ═══════════════════════════════════════════════════════════ */
    const caption = () => `${ins.branches.name_ar} · ${fmtDate(ins.business_date)}` +
      `${ins.shift ? " — تشييك " + SHIFT_AR[ins.shift] : ""}\n` +
      `النتيجة ${n1(ins.score)}٪ (المستهدف ${n1(ins.branches.target_pct)}٪)` +
      `${critN ? `\n⚠️ ${critN} إخفاق حرج` : ""}`;

    async function buildFiles(){
      if (READY) return READY;
      CANCEL = false;
      const cardBlob = await makeCardBlob();
      await breathe();
      const pdfBlob  = await makePdfBlob();
      READY = {
        cardBlob, pdfBlob, cap: caption(),
        files: [
          new File([cardBlob], cardName(), { type: "image/jpeg" }),
          new File([pdfBlob],  pdfName(),  { type: "application/pdf" })
        ]
      };
      return READY;
    }

    /* تُستدعى من داخل لمسة المستخدم مباشرة — بلا await قبلها */
    function shareNow(){
      if (!READY) return;
      const { files, cap, cardBlob, pdfBlob } = READY;
      const title = "تقرير تشييك — " + ins.branches.name_ar;
      const can = f => navigator.canShare && navigator.canShare({ files: f });

      const p = can(files)          ? navigator.share({ files, title, text: cap })
              : can([files[0]])     ? navigator.share({ files: [files[0]], title, text: cap })
                                        .then(() => dl(pdfBlob, pdfName()))
              : null;
      if (!p) {                     /* سطح المكتب غالباً — ننزّل الملفين */
        dl(cardBlob, cardName());
        setTimeout(() => dl(pdfBlob, pdfName()), 700);
        return;
      }
      p.catch(e => {
        if (String(e && e.name) === "AbortError") return;   /* أغلق القائمة بنفسه */
        dl(cardBlob, cardName());
        setTimeout(() => dl(pdfBlob, pdfName()), 700);
      });
    }

    /* لوحة «جاهز للمشاركة» — الزر فيها هو اللمسة التي تفتح القائمة */
    function showReadyPanel(){
      document.getElementById("readyPanel")?.remove();
      const kb = Math.round((READY.cardBlob.size + READY.pdfBlob.size) / 1024);
      const el = document.createElement("div");
      el.id = "readyPanel";
      el.className = "rdy";
      el.innerHTML = `<div class="rdy-in">
        <div class="rdy-ic">✓</div>
        <div class="rdy-t">التقرير جاهز
          <small>صورة تظهر في المحادثة + ملف PDF · <span dir="ltr">${kb} KB</span></small></div>
        <button id="rdyGo" class="btn p">مشاركة الآن</button>
        <button id="rdyDl" class="btn g">تنزيل</button>
      </div>`;
      document.body.appendChild(el);
      document.getElementById("rdyGo").onclick = shareNow;   /* لمسة مباشرة */
      document.getElementById("rdyDl").onclick = () => {
        dl(READY.cardBlob, cardName());
        setTimeout(() => dl(READY.pdfBlob, pdfName()), 700);
      };
    }

    document.getElementById("shareAllBtn").onclick = async () => {
      /* الملفات جاهزة من قبل؟ شارك فوراً — اللمسة ما زالت سارية */
      if (READY) { shareNow(); return; }
      const btn = document.getElementById("shareAllBtn");
      btn.disabled = true;
      try {
        /* سقف زمني للعملية كلها — لا يبقى المستخدم أمام شاشة انتظار أبدية */
        await withTimeout(buildFiles(), 90000, "build");
        wait(false);
        showReadyPanel();
      } catch (e) {
        wait(false);
        const m = String(e && e.message || e);
        if (m === "CANCELLED") return;                 /* ألغى بنفسه */
        alert(/^TIMEOUT/.test(m)
          ? "تجهيز التقرير أخذ وقتاً أطول من المتوقع — غالباً بسبب ضعف الشبكة أو كثرة الصور.\n\n"
            + "جرّب مرة أخرى على شبكة أفضل، أو استخدم زر «طباعة» للحصول على نسخة PDF مباشرة."
          : "تعذّر تجهيز التقرير: " + m);
      } finally { btn.disabled = false; wait(false); }
    };

    /* ═══════════════════════════════════════════════════════════
       رابط المشاركة — نفس تجربة التطبيق لدى الطرف الآخر
       ───────────────────────────────────────────────────────────
       ملف PDF مستند ميت: الصورة فيه بكسلات لا تُفتح ولا تُقرَّب.
       الرابط يفتح نفس صفحة التقرير بعارض الصور والتكبير — يراها
       مدير المطعم كما تراها أنت، بلا حساب وبلا تطبيق.

       روابط الصور تُولَّد هنا من جهازك المُسجَّل دخوله وتُحفَظ مع
       المفتاح، لأن Supabase لا توقّع الروابط داخل قاعدة البيانات.
       ═══════════════════════════════════════════════════════════ */
    if (!PUB) document.getElementById("shareLinkBtn").onclick = async () => {
      const btn = document.getElementById("shareLinkBtn");
      btn.disabled = true;
      try{
        wait(true, "تجهيز روابط الصور", .3);
        /* صلاحية الصور = صلاحية الرابط: 30 يوماً */
        const paths = [...new Set((ans || []).flatMap(a => a.photos || []))];
        const map = {};
        for (const p of paths){
          const u = await signedUrl(p, 30 * 24 * 3600);
          if (u) map[p] = u;
        }
        wait(true, "إنشاء الرابط", .8);
        /* sb.rpc يرفق توكن جلستك — وهذه الدالة تتطلب صلاحية موظف */
        const { data: token, error: rerr } = await sb.rpc("report_share_create",
          { p_inspection: ins.id, p_photos: map });
        if (rerr) throw rerr;
        if (!token) throw new Error("لم يُرجع الخادم مفتاحاً");
        wait(false);

        const link = location.origin + location.pathname.replace(/[^/]*$/, "")
                   + "report.html?t=" + token;
        const msg = `تقرير تشييك — ${ins.branches.name_ar}\n` +
          `${fmtDate(ins.business_date)}${ins.shift ? " · تشييك " + SHIFT_AR[ins.shift] : ""}\n` +
          `النتيجة ${n1(ins.score)}٪\n\n${link}`;

        /* المشاركة هنا آمنة: النص جاهز فوراً فاللمسة ما زالت سارية */
        if (navigator.share){
          try { await navigator.share({ title: "تقرير تشييك", text: msg }); return; }
          catch(e){ if (String(e.name) === "AbortError") return; }
        }
        try { await navigator.clipboard.writeText(link); }catch(e){}
        await sheetLink(link);
      }catch(e){
        wait(false);
        /* رسائل دقيقة — كل حالة لها سبب وعلاج مختلف تماماً.
           كانت الرسالة الواحدة تخفي الخطأ الحقيقي وتُرسل المستخدم
           ليعيد تشغيل SQL شُغّل أصلاً. */
        const m = String(e && (e.message || e.hint) || e);
        alert(
          /NOT_ALLOWED/.test(m)
            ? "إنشاء روابط المشاركة متاح للإدارة و QA & Training فقط."
          : /permission denied/i.test(m)
            ? "الجلسة غير صالحة أو حسابك ليس ضمن الإدارة.\nسجّل خروجاً ثم دخولاً وأعد المحاولة."
          : /schema cache|PGRST202|could not find the function/i.test(m)
            ? "الدالة غير موجودة — شغّل 060_report_share.sql على Supabase مرة واحدة."
          : /PGRST203|best candidate/i.test(m)
            ? "توجد نسختان من الدالة في قاعدة البيانات.\nشغّل:\nDROP FUNCTION IF EXISTS report_share_create(uuid);"
          : /NOT_FOUND/.test(m)
            ? "هذا التقرير غير مُرسَل بعد، فلا يمكن مشاركته."
            : "تعذّر إنشاء الرابط: " + m);
      }finally{ btn.disabled = false; wait(false); }
    };

    /* لوحة صغيرة تعرض الرابط لمن لا يدعم متصفحه المشاركة */
    function sheetLink(link){
      document.getElementById("linkPanel")?.remove();
      const el = document.createElement("div");
      el.id = "linkPanel"; el.className = "rdy";
      el.innerHTML = `<div class="rdy-in">
        <div class="rdy-ic">🔗</div>
        <div class="rdy-t">الرابط جاهز ونُسخ<small>صالح 30 يوماً · يفتح بلا حساب</small></div>
        <button class="btn g" id="lnkClose">إغلاق</button></div>
        <div style="max-width:560px;margin:9px auto 0"><input id="lnkIn" readonly
          value="${esc(link)}" dir="ltr" style="width:100%;font-size:12px;padding:10px;
          border:1px solid var(--rule);border-radius:9px;background:var(--surface-2)"></div>`;
      document.body.appendChild(el);
      el.querySelector("#lnkIn").onclick = e => e.target.select();
      el.querySelector("#lnkClose").onclick = () => el.remove();
    }

    /* شريط تعريفي للزائر — يعرف من أين جاء التقرير وإلى متى يصلح */
    if (PUB){
      const nt = document.createElement("div");
      nt.className = "pubnote";
      nt.innerHTML = `<span style="font-size:17px">🔒</span>
        <span>تقرير للعرض فقط صادر من <b>${esc(C.company)}</b> —
        اضغط أي صورة لتكبيرها وقراءة تفاصيلها.</span>`;
      V().prepend(nt);
    }

    /* قادم من التطبيق: report.html?i=…&share=1
       نجهّز تلقائياً — لكن لا نستدعي المشاركة، فالنقرة البرمجية
       ليست لمسة مستخدم وسيرفضها النظام. نعرض اللوحة وننتظر لمسته. */
    if (new URLSearchParams(location.search).get("share") === "1") {
      (async () => {
        try { await withTimeout(buildFiles(), 90000, "build"); wait(false); showReadyPanel(); }
        catch (e) {
          wait(false);
          const m = String(e && e.message || e);
          if (m === "CANCELLED") return;
          /* لا نُزعج بنافذة تنبيه هنا — نترك أزرار الصفحة متاحة ليحاول بنفسه */
          console.warn("[share] " + m);
        }
      })();
    }
  }
  boot();
})();
