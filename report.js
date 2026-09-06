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
          return `<div style="display:flex;gap:9px;align-items:center;padding:5px 0;
            border-bottom:1px solid #f2f6f4;font-size:11.5px">
            <span style="flex:0 0 68px;color:${cl};font-weight:700">${t}</span>
            <span style="flex:1">${esc(a.items ? a.items.title_ar : a.item_code)}${
              a.items && a.items.critical ? ' <span style="color:#a32222;font-size:9.5px">◆ حرج</span>' : ""}</span>
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
      wait(true, "تجهيز بطاقة المشاركة");
      await Promise.all(Array.from(stage.querySelectorAll("img")).map(img =>
        img.complete && img.naturalWidth ? Promise.resolve()
          : new Promise(res => { img.onload = img.onerror = res; setTimeout(res, 9000); })));
      await new Promise(r => setTimeout(r, 100));
      const cv = await html2canvas(stage.firstElementChild, {
        scale: 1, useCORS: true, backgroundColor: null, logging: false,
        width: 1080, height: 1350, windowWidth: 1080
      });
      stage.innerHTML = "";
      return new Promise(res => cv.toBlob(res, "image/jpeg", 0.92));
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

    /* ── المشاركة الكاملة: صورة تظهر في المحادثة + PDF للتفاصيل ── */
    const dl = (blob, name) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    const cardName = () => pdfName().replace(/\.pdf$/, "") + ".jpg";

    document.getElementById("shareAllBtn").onclick = async () => {
      const btn = document.getElementById("shareAllBtn");
      btn.disabled = true;
      try {
        const [cardBlob, pdfBlob] = [await makeCardBlob(), await makePdfBlob()];
        const files = [
          new File([cardBlob], cardName(), { type: "image/jpeg" }),
          new File([pdfBlob], pdfName(), { type: "application/pdf" })
        ];
        const cap = `${ins.branches.name_ar} · ${fmtDate(ins.business_date)}` +
          `${ins.shift ? " — تشييك " + SHIFT_AR[ins.shift] : ""}\n` +
          `النتيجة ${n1(ins.score)}٪ (المستهدف ${n1(ins.branches.target_pct)}٪)` +
          `${critN ? `\n⚠️ ${critN} إخفاق حرج` : ""}`;

        wait(true, "فتح قائمة المشاركة");
        if (navigator.canShare && navigator.canShare({ files })) {
          wait(false);
          await navigator.share({ files, title: "تقرير تشييك — " + ins.branches.name_ar, text: cap });
        } else if (navigator.canShare && navigator.canShare({ files: [files[0]] })) {
          /* بعض الأجهزة تشارك ملفاً واحداً فقط — الصورة أولى بالظهور */
          wait(false);
          await navigator.share({ files: [files[0]], title: "تقرير تشييك", text: cap });
          dl(pdfBlob, pdfName());
        } else {
          wait(false);
          dl(cardBlob, cardName());
          setTimeout(() => dl(pdfBlob, pdfName()), 700);
        }
      } catch (e) {
        wait(false);
        if (String(e && e.name) !== "AbortError")
          alert("تعذّر تجهيز التقرير: " + (e && e.message ? e.message : e));
      } finally { btn.disabled = false; wait(false); }
    };

    /* المشاركة المباشرة من التطبيق: report.html?i=…&share=1 */
    if (new URLSearchParams(location.search).get("share") === "1") {
      setTimeout(() => document.getElementById("shareAllBtn").click(), 400);
    }
  }
  boot();
})();
