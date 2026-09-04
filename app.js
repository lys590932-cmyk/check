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

  /* ─────────── الإقلاع ─────────── */
  async function boot() {
    paintNet();
    $("#coName").textContent = C.company;
    if (C.SUPABASE_URL.includes("YOUR-PROJECT")) return notConfigured();
    ME = await me();
    if (!ME) return loginScreen();
    $("#who").innerHTML = `<b>${esc(ME.full_name)}</b>${roleAr(ME.role)}`;
    try { CAT = await catalog(); }
    catch (e) { return fail("تعذّر تحميل البيانات: " + (e.message || e)); }
    flushQueue();
    home();
  }
  const roleAr = r => ({ admin: "الإدارة", area: "مشرف منطقة", branch: "مدير فرع" }[r] || r);

  function notConfigured() {
    V().innerHTML = `<div class="card"><h2>النظام غير مربوط بعد</h2>
      <p class="sub">افتح <code>config.js</code> وضع رابط مشروع Supabase والمفتاح العام،
      ثم شغّل ملفات <code>db/</code> بالترتيب. التفاصيل في <code>README.md</code>.</p></div>`;
  }
  function fail(m) { V().innerHTML = `<div class="banner bad">${esc(m)}</div>`; }

  /* ─────────── تسجيل الدخول ─────────── */
  function loginScreen() {
    $("#who").innerHTML = "";
    V().innerHTML = `<div class="card" style="margin-top:22px">
      <h2>تسجيل الدخول</h2><p class="sub">استخدم البريد وكلمة المرور اللذين زوّدتك بهما الإدارة.</p>
      <label class="fl">البريد الإلكتروني</label>
      <input type="email" id="em" autocomplete="username" inputmode="email">
      <label class="fl">كلمة المرور</label>
      <input type="password" id="pw" autocomplete="current-password">
      <div class="row"><button class="btn p" id="go">دخول</button></div>
      <div id="lerr" class="banner bad hide" style="margin-top:11px"></div></div>`;
    const go = async () => {
      const b = $("#go"); b.disabled = true; b.textContent = "جارٍ الدخول…";
      const { error } = await sb.auth.signInWithPassword({
        email: $("#em").value.trim(), password: $("#pw").value
      });
      if (error) {
        const e = $("#lerr"); e.classList.remove("hide");
        e.textContent = /Invalid/i.test(error.message)
          ? "البريد أو كلمة المرور غير صحيحة." : error.message;
        b.disabled = false; b.textContent = "دخول"; return;
      }
      location.reload();
    };
    $("#go").onclick = go;
    $("#pw").onkeydown = e => { if (e.key === "Enter") go(); };
  }

  async function logout() { await sb.auth.signOut(); location.reload(); }

  /* ─────────── الشاشة الرئيسية ─────────── */
  async function home() {
    S = null;
    const today = businessDate();
    const isStaff = ME.role === "admin" || ME.role === "area";
    const myBranch = CAT.branches.find(b => b.id === ME.branch_id);

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

    let html = `<nav class="tabs">
      <button aria-selected="true">اليوم</button>
      <button onclick="APP.findings()">الملاحظات<span class="c">${openN || ""}</span></button>
      ${isStaff ? '<button onclick="location.href=\'admin.html\'">اللوحة</button>' : ""}
    </nav>`;

    /* ── مدير الفرع: ورديات اليوم ── */
    if (myBranch) {
      const shifts = myBranch.shifts || ["open", "mid", "close"];
      html += `<div class="card"><h2>${esc(myBranch.name_ar)}</h2>
        <p class="sub">${esc(window.SI.fmtDate(today))} — تشييك الورديات</p>`;
      shifts.forEach(sh => {
        const rec = done.find(d => d.branch_id === myBranch.id && d.shift === sh
          && d.template_key === sh && d.status === "submitted");
        html += `<div class="shift ${rec ? "done" : ""}">
          <div class="ic">${rec ? "✓" : SHIFT_AR[sh][0]}</div>
          <div class="t"><b>تشييك ${SHIFT_AR[sh]}</b><span>${rec
            ? `${rec.score}٪ — ${esc(rec.user_name)} — ${fmtTime(rec.submitted_at)}`
            : "لم يُنفَّذ بعد"}</span></div>
          ${rec ? `<button class="btn g sm" onclick="APP.report('${rec.id}')">التقرير</button>`
            : `<button class="btn p sm" onclick="APP.start('${sh}','${myBranch.id}','${sh}')">ابدأ</button>`}
        </div>`;
      });
      html += `</div>`;
    }

    /* ── المشرف والإدارة: زيارة أي فرع ── */
    if (isStaff) {
      const groups = {};
      CAT.branches.forEach(b => (groups[b.brand_code] = groups[b.brand_code] || []).push(b));
      html += `<div class="card"><h2>زيارة مشرف</h2>
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
      html += `<div class="card"><h2>ورديات اليوم</h2>
        <p class="sub">ما نفّذته الفروع حتى الآن.</p>
        <div class="tw"><table><thead><tr><th>الموقع</th>
        <th>الفتح</th><th>الذروة</th><th>الإغلاق</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    html += `<div class="row"><button class="btn g" onclick="APP.logout()">خروج</button></div>`;
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
    S = { insp, branch, tpl, secs, shift, pos, answers: saved, sending: false };
    runner();
  }

  /* ─────────── شاشة التشييك ─────────── */
  function runner() {
    const r = localScore(S.secs, S.answers, S.tpl.weighted, S.branch.target_pct);
    V().innerHTML =
      `<div class="prog"><div class="bar"><i style="width:${r.total ? r.done / r.total * 100 : 0}%"></i></div>
        <div class="pmeta"><span>${r.done} من ${r.total} بنداً</span>
        <span><b style="color:${bandColor(r.done ? r.band : null)}">${r.done ? r.pct + "٪" : "—"}</b>
        ${r.crit ? ' <span class="pill r">إنذار حرج</span>' : ""}</span></div></div>
      <div class="card"><div style="font-size:12.5px;color:var(--ink-3)">
        ${esc(S.branch.name_ar)} · ${esc(S.tpl.name_ar)}${S.shift ? " · " + SHIFT_AR[S.shift] : ""}
        · ${esc(window.SI.fmtDate(S.insp.business_date))}</div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:3px">
        الموقع مؤكَّد — دقة ${S.pos.accuracy} م${S.branch.lat != null
          ? ` · على بعد ${distanceM(S.pos, S.branch)} م من الفرع` : ""}</div></div>` +
      S.secs.map(sec => `<div class="card"><div class="sec-h">${esc(sec.name_ar)}${
        S.tpl.weighted ? " · وزن " + sec.weight : ""}</div>${
        sec.items.map(qHTML).join("")}</div>`).join("") +
      `<div id="err" class="banner bad hide"></div>
       <div class="row"><button class="btn g" onclick="APP.home()">حفظ ومتابعة لاحقاً</button>
       <button class="btn p" id="send" onclick="APP.submit()">إنهاء وإرسال</button></div>`;
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
    a.value = v;
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
    const e = $("#err"); e.textContent = msg; e.classList.remove("hide");
    const q = $("#q_" + code); if (q) q.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function doneScreen(ins) {
    const url = location.origin + location.pathname.replace(/index\.html$/, "") + "report.html?i=" + ins.id;
    const txt = `تقرير ${S.tpl.name_ar}\n${S.branch.name_ar}\n` +
      `${window.SI.fmtDate(ins.business_date)}${S.shift ? " — " + SHIFT_AR[S.shift] : ""}\n` +
      `النتيجة: ${ins.score}٪${ins.critical_fails ? ` — ${ins.critical_fails} إخفاق حرج` : ""}\n${url}`;
    V().innerHTML = `<div class="card" style="text-align:center;padding:24px 15px">
      <div style="width:92px;height:92px;border-radius:50%;margin:0 auto 12px;display:flex;
        align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;
        background:${bandColor(ins.band)}">${ins.score}٪</div>
      <h2>${esc(S.branch.name_ar)}</h2>
      <p class="sub">${esc(S.tpl.name_ar)}${S.shift ? " — " + SHIFT_AR[S.shift] : ""} · ${
        esc(window.SI.fmtDate(ins.business_date))}</p>
      ${ins.critical_fails ? `<div class="banner bad">إنذار حرج — ${ins.critical_fails} بنداً حرجاً غير مطابق. أغلقه خلال ٢٤ ساعة.</div>` : ""}
      <div style="font-size:12px;color:var(--ink-3)">موثّق من داخل الفرع — على بعد ${
        ins.distance_m ?? "—"} متر · دقة ${ins.accuracy_m ?? "—"} م</div>
      <div class="row"><button class="btn g" onclick="APP.report('${ins.id}')">التقرير</button>
        <button class="btn p" onclick="APP.share(${JSON.stringify(txt).replace(/"/g, "&quot;")})">مشاركة</button></div>
      <div class="row"><button class="btn g" onclick="APP.home()">رجوع</button></div></div>`;
  }

  async function share(text) {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (_) { } }
    location.href = "https://wa.me/?text=" + encodeURIComponent(text);
  }

  const report = id => location.href = "report.html?i=" + id;

  /* ─────────── الملاحظات ─────────── */
  async function findings() {
    V().innerHTML = `<div class="card"><h2>جارٍ التحميل…</h2></div>`;
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
    V().innerHTML = `<nav class="tabs">
        <button onclick="APP.home()">اليوم</button>
        <button aria-selected="true">الملاحظات<span class="c">${rows.length}</span></button>
      </nav><div class="card"><h2>الملاحظات المفتوحة</h2>
      <p class="sub">مرتبة بتاريخ الاستحقاق. المتأخر بالأحمر.</p>
      ${rows.length ? rows.join("") : '<div class="empty">لا ملاحظات مفتوحة.</div>'}</div>`;
  }

  async function closeF(id) {
    const note = prompt("ماذا نُفِّذ؟ (اختياري)") ?? "";
    const { error } = await sb.rpc("fn_close_finding", { p_id: id, p_note: note || null });
    if (error) return toast(error.message, true);
    toast("أُغلقت"); findings();
  }

  /* ─────────── التصدير ─────────── */
  window.APP = {
    home, start, startVisit, setV, setF, pick, rmPhoto, submit, findings,
    close: closeF, logout, report, share
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => { });
  }
  boot();
})();
