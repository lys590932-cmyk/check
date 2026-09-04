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
      .select("*, branches(name_ar, code, target_pct, lat, lng, geofence_m, phone), templates(name_ar, weighted)")
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

    $("#shareBtn").onclick = async () => {
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
  }
  boot();
})();
