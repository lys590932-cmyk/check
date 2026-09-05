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

  async function boot() {
    $("#coName").textContent = C.company;
    const id = new URLSearchParams(location.search).get("i");
    if (!id) return void (V().innerHTML = `<div class="banner bad">لا يوجد رقم تقرير في الرابط.</div>`);
    const u = await me();
    if (!u) { location.replace("index.html"); return; }

    const { data: ins, error } = await sb.from("inspections")
      .select("*, branches(name_ar, code, brand_code, target_pct, lat, lng, geofence_m, phone), templates(name_ar, weighted)")
      .eq("id", id).single();
    if (error || !ins) return void (V().innerHTML =
      `<div class="banner bad">التقرير غير موجود أو لا صلاحية لك عليه.</div>`);

    const { data: ans } = await sb.from("answers")
      .select("*, items(title_ar, section_name, critical, weight, num_label, num_unit, sort)")
      .eq("inspection_id", id);

    const secs = {};
    (ans || []).sort((a, b) => (a.items?.sort || 0) - (b.items?.sort || 0))
      .forEach(a => {
        const s = a.items ? a.items.section_name : "—";
        (secs[s] = secs[s] || []).push(a);
      });

    const issues = (ans || []).filter(a => a.value === 0 || a.value === 1);
    const urls = {};
    await Promise.all((ans || []).flatMap(a => (a.photos || []).map(async p => {
      urls[p] = await signedUrl(p, 7200);
    })));

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

    V().innerHTML = `
      <div class="card">
        <div class="rep-head">
          <div>
            <h2 style="font-size:19px">${esc(ins.branches.name_ar)}</h2>
            <p class="sub" style="margin:4px 0 0">${esc(ins.templates.name_ar)}${
              ins.shift ? " — تشييك " + SHIFT_AR[ins.shift] : ""} · ${esc(fmtDate(ins.business_date))}</p>
          </div>
          <div class="ring" style="background:${cvar(ins.band)}">${n1(ins.score)}٪</div>
        </div>
        ${ins.critical_fails ? `<div class="banner bad" style="margin-top:12px">
          إنذار حرج — ${ins.critical_fails} بنداً حرجاً غير مطابق.</div>` : ""}
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
          return `<div class="it">
            <div class="st"><span class="pill ${cls}">${t}</span></div>
            <div class="bd"><b>${esc(a.items ? a.items.title_ar : a.item_code)}</b>
              ${a.items && a.items.critical ? '<span class="chip cr">حرج</span>' : ""}
              ${a.num_value != null ? `<span class="chip ph">${esc(a.items?.num_label || "قراءة")}: ${
                a.num_value}${esc(a.items?.num_unit || "")}</span>` : ""}
              <p><b>الملاحظة:</b> ${esc(a.note || "—")}</p>
              <p><b>الإجراء:</b> ${esc(a.action || "—")} — ${esc(a.owner_name || "بلا مسؤول")}
                 · استحقاق ${esc(a.due_date || "—")}</p>
              ${shots.length ? `<div class="shots">${shots.map(u =>
                `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="دليل مصوّر"></a>`).join("")}</div>` : ""}
            </div></div>`;
        }).join("")}</div>` : `<div class="card"><h2>الملاحظات</h2>
        <div class="empty">لا ملاحظات — كل البنود مطابقة.</div></div>`}

      <div class="card"><h2>كل البنود</h2>
        ${Object.keys(secs).map(s => `<div class="sec-h">${esc(s)}</div>` +
          secs[s].map(a => {
            const [t, cls] = a.value == null ? ["لا ينطبق", "n"] : (VAL[a.value] || ["—", "n"]);
            const shots = (a.photos || []).map(p => urls[p]).filter(Boolean);
            return `<div class="it"><div class="st"><span class="pill ${cls}">${t}</span></div>
              <div class="bd"><b>${esc(a.items ? a.items.title_ar : a.item_code)}</b>
              ${a.items && a.items.critical ? '<span class="chip cr">حرج</span>' : ""}
              ${a.num_value != null ? `<span class="chip ph">${esc(a.items?.num_label || "قراءة")}: ${
                a.num_value}${esc(a.items?.num_unit || "")}</span>` : ""}
              ${shots.length ? `<div class="shots">${shots.map(u =>
                `<img src="${u}" alt="دليل مصوّر">`).join("")}</div>` : ""}
              </div></div>`;
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

    function pdfDoc() {
      const S = `font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif`;
      const secRows = Object.keys(secs).map(s => {
        const p = secScore(secs[s]);
        const b = p == null ? "n" : p >= ins.branches.target_pct ? "green"
          : p >= ins.branches.target_pct - 10 ? "amber" : "red";
        return `<tr>
          <td style="padding:7px 4px;border-bottom:1px solid #eef2f0">${esc(s)}</td>
          <td style="padding:7px 4px;border-bottom:1px solid #eef2f0;width:210px">
            <div style="height:9px;background:#eef2f0;border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${p || 0}%;background:${bandHex(b)}"></div></div></td>
          <td style="padding:7px 4px;border-bottom:1px solid #eef2f0;width:52px;text-align:left;
            font-weight:700;direction:ltr">${p == null ? "—" : p}</td></tr>`;
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
          return `<div style="display:flex;gap:9px;align-items:center;padding:5px 0;
            border-bottom:1px solid #f2f6f4;font-size:11.5px">
            <span style="flex:0 0 68px;color:${cl};font-weight:700">${t}</span>
            <span style="flex:1">${esc(a.items ? a.items.title_ar : a.item_code)}${
              a.items && a.items.critical ? ' <span style="color:#a32222;font-size:9.5px">◆ حرج</span>' : ""}</span>
          </div>`;
        }).join("")).join("");

      return `<div style="${S};width:794px;background:#fff;color:#0d1a17;direction:rtl">

        <!-- ترويسة -->
        <section class="blk" style="padding:0 0 14px">
          <div style="height:9px;background:linear-gradient(90deg,${BR.dark},${BR.color})"></div>
          <div style="padding:18px 46px 0;display:flex;align-items:center;
            justify-content:space-between;gap:16px">
            <div style="display:flex;align-items:center;gap:12px">
              ${BR.logo ? `<div style="width:56px;height:56px;border-radius:12px;background:#fff;
                border:1px solid #e6ece9;display:flex;align-items:center;justify-content:center;
                overflow:hidden"><img src="${esc(BR.logo)}" style="width:100%;height:100%;
                object-fit:contain;padding:3px"></div>` : ""}
              <div><div style="font-size:17px;font-weight:800">${esc(ins.branches.name_ar)}</div>
                <div style="font-size:11.5px;color:#6d817a">${esc(C.company)} · تقرير تشييك ميداني</div></div>
            </div>
            <img src="logo-sevenicons.png" style="height:42px;object-fit:contain">
          </div>
        </section>

        <!-- العنوان والنتيجة -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="display:flex;align-items:center;gap:18px;background:#f6f9f7;
            border:1px solid #e6ece9;border-radius:12px;padding:15px 17px">
            <div style="flex:0 0 auto;width:86px;height:86px;border-radius:50%;
              background:${bandHex(ins.band)};color:#fff;display:flex;flex-direction:column;
              align-items:center;justify-content:center">
              <div style="font-size:22px;font-weight:800;direction:ltr">${n1(ins.score)}</div>
              <div style="font-size:10px;opacity:.9">من ١٠٠</div></div>
            <div style="flex:1">
              <div style="font-size:15px;font-weight:800">${esc(ins.templates.name_ar)}${
                ins.shift ? " — تشييك " + SHIFT_AR[ins.shift] : ""}</div>
              <div style="font-size:12px;color:#3d514b;margin-top:3px">${esc(fmtDate(ins.business_date))}</div>
              <div style="font-size:12px;margin-top:6px">الحالة:
                <b style="color:${bandHex(ins.band)}">${BAND_AR[ins.band] || "—"}</b>
                · المستهدف <span dir="ltr">${n1(ins.branches.target_pct)}٪</span></div>
            </div>
          </div>
          ${ins.critical_fails ? `<div style="margin-top:10px;background:#f8dede;
            border:1px solid #a32222;border-radius:9px;padding:10px 13px;font-size:12.5px">
            <b style="color:#a32222">إنذار حرج</b> — <span dir="ltr">${ins.critical_fails}</span>
            بنداً حرجاً غير مطابق. يجب إغلاقه خلال ٢٤ ساعة.</div>` : ""}
        </section>

        <!-- بيانات التوثيق -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">بيانات التوثيق</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${meta}</div>
        </section>

        <!-- أداء المحاور -->
        <section class="blk" style="padding:0 46px 16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px;
            padding-inline-start:9px;border-inline-start:3px solid ${BR.color}">أداء المحاور</div>
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

        <!-- التوقيعات والتذييل -->
        <section class="blk" style="padding:6px 46px 30px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:14px">
            <div style="border-top:1px solid #b9c8c2;padding-top:7px;font-size:11.5px;color:#6d817a">
              توقيع المنفِّذ — ${esc(ins.user_name)}</div>
            <div style="border-top:1px solid #b9c8c2;padding-top:7px;font-size:11.5px;color:#6d817a">
              توقيع مدير الفرع</div>
          </div>
          <div style="margin-top:18px;padding-top:11px;border-top:1px solid #eef2f0;
            font-size:10px;color:#8b9a95;line-height:1.85">
            كل صورة في هذا التقرير مختومة داخل بكسلاتها بالتاريخ والوقت والإحداثيات لحظة التقاطها،
            ولا يمكن رفعها من استوديو الجهاز.<br>
            رقم التقرير <span dir="ltr">${esc(ins.id)}</span> ·
            صدر في <span dir="ltr">${new Date().toLocaleString("ar-KW", { timeZone: C.TZ })}</span> ·
            ${esc(C.company)}
          </div>
        </section>
      </div>`;
    }

    const waitEl = document.getElementById("pdfwait");
    const stepEl = document.getElementById("pdfStep");
    const wait = (on, msg) => {
      waitEl.classList.toggle("hide", !on);
      if (msg) stepEl.textContent = msg;
    };

    async function makePdfBlob() {
      const stage = document.getElementById("pdfstage");
      stage.innerHTML = pdfDoc();

      wait(true, "تحميل الصور");
      /* لا نلتقط قبل اكتمال تحميل كل صورة، وإلا خرجت مربعات فارغة */
      await Promise.all(Array.from(stage.querySelectorAll("img")).map(img =>
        img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise(res => { img.onload = img.onerror = res; setTimeout(res, 9000); })));
      await new Promise(r => setTimeout(r, 120));

      wait(true, "رسم الصفحات");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "p" });
      const PW = 210, PH = 297, M = 0;
      const blocks = Array.from(stage.querySelectorAll(".blk"));
      let y = M, first = true;

      for (const blk of blocks) {
        const cv = await html2canvas(blk, {
          scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
          windowWidth: 794, width: 794
        });
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

      stage.innerHTML = "";
      return pdf.output("blob");
    }

    const pdfName = () => `تقرير-${(ins.branches.name_ar || "").replace(/\s+/g, "-")}` +
      `-${ins.business_date}${ins.shift ? "-" + SHIFT_AR[ins.shift] : ""}.pdf`;

    document.getElementById("sharePdfBtn").onclick = async () => {
      const btn = document.getElementById("sharePdfBtn");
      btn.disabled = true;
      try {
        const blob = await makePdfBlob();
        const file = new File([blob], pdfName(), { type: "application/pdf" });
        wait(true, "فتح قائمة المشاركة");

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          wait(false);
          await navigator.share({
            files: [file], title: "تقرير تشييك — " + ins.branches.name_ar,
            text: `${ins.branches.name_ar} · ${fmtDate(ins.business_date)} · النتيجة ${n1(ins.score)}٪`
          });
        } else {
          /* المتصفحات التي لا تدعم مشاركة الملفات: نزّل الملف */
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = pdfName();
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          wait(false);
        }
      } catch (e) {
        wait(false);
        if (String(e && e.name) !== "AbortError")
          alert("تعذّر تجهيز الـPDF: " + (e && e.message ? e.message : e));
      } finally { btn.disabled = false; wait(false); }
    };

    /* المشاركة المباشرة من التطبيق: report.html?i=…&share=1 */
    if (new URLSearchParams(location.search).get("share") === "1") {
      setTimeout(() => document.getElementById("sharePdfBtn").click(), 400);
    }
  }
  boot();
})();
