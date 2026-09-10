/* ═══════════════════════════════════════════════════════════
   لوحة الإدارة — المتابعة والمستهدفات والتقارير
   ═══════════════════════════════════════════════════════════ */
(function () {
  const { sb, esc, $, businessDate, fmtDate, fmtTime, SHIFT_AR, catalog, me, getPosition } = window.SI;
  const C = window.CONFIG;
  const V = () => $("#view");
  let ME = null, CAT = null, TAB = "over";

  const bandCls = b => b === "green" ? "g" : b === "amber" ? "a" : b === "red" ? "r" : "n";
  const cvar = b => b === "g" ? "var(--ok)" : b === "a" ? "var(--warn)"
    : b === "r" ? "var(--bad)" : "var(--ink-3)";
  const bandOf = (p, t, cf) => cf ? "r" : p == null ? "n"
    : p >= t ? "g" : p >= t - 10 ? "a" : "r";
  const n1 = v => v == null ? "—" : Number(v).toFixed(1);

  function toast(m, bad) {
    const d = document.createElement("div"); d.textContent = m;
    d.style.cssText = "position:fixed;inset-inline:14px;bottom:18px;z-index:99;padding:12px 15px;" +
      "border-radius:6px;font-size:13.5px;font-weight:600;text-align:center;color:#fff;" +
      "background:" + (bad ? "var(--bad)" : "var(--accent)");
    document.body.appendChild(d); setTimeout(() => d.remove(), 4000);
  }

  async function boot() {
    $("#coName").textContent = C.company;
    if (C.SUPABASE_URL.includes("YOUR-PROJECT")) {
      V().innerHTML = `<div class="card"><h2>النظام غير مربوط بعد</h2>
        <p class="sub">اضبط <code>config.js</code> أولاً — التفاصيل في <code>README.md</code>.</p></div>`;
      return;
    }
    ME = await me();
    if (!ME) { location.replace("index.html"); return; }
    if (ME.role === "branch") { location.replace("index.html"); return; }
    $("#who").innerHTML = `<b>${esc(ME.full_name)}</b>${
      { admin: "الإدارة", area: "QA &amp; Training" }[ME.role] || ""}`;
    CAT = await catalog();
    go(TAB);
  }

  function tabs() {
    const t = [["over", "نظرة عامة"], ["shifts", "الورديات"],
      ["find", "الملاحظات"], ["hist", "السجل"]];
    if (ME.role === "admin") t.push(["set", "إعدادات الفروع"]);
    return `<nav class="tabs noprint">${t.map(([k, n]) =>
      `<button aria-selected="${TAB === k}" onclick="AD.go('${k}')">${n}</button>`).join("")}</nav>`;
  }
  function go(k) { TAB = k; ({ over, shifts, find, hist, set: settings }[k] || over)(); }

  /* ─────────── نظرة عامة ─────────── */
  async function over() {
    V().innerHTML = tabs() + `<div class="card"><h2>جارٍ الحساب…</h2></div>`;
    const [{ data: sum }, { data: top }] = await Promise.all([
      sb.from("v_branch_summary").select("*"),
      sb.from("v_top_items").select("*").limit(8)
    ]);
    const rows = (sum || []).slice().sort((a, b) =>
      (b.visit_pct ?? b.shift_pct ?? -1) - (a.visit_pct ?? a.shift_pct ?? -1));

    const withScore = rows.filter(r => r.visit_pct != null || r.shift_pct != null);
    const avg = withScore.length
      ? withScore.reduce((s, r) => s + (r.visit_pct ?? r.shift_pct), 0) / withScore.length : null;
    const below = rows.filter(r => {
      const p = r.visit_pct ?? r.shift_pct; return p != null && p < r.target_pct;
    }).length;
    const cf = rows.reduce((s, r) => s + (r.critical_fails || 0), 0);
    const open = rows.reduce((s, r) => s + (r.open_findings || 0), 0);
    const late = rows.reduce((s, r) => s + (r.late_findings || 0), 0);
    const noV = rows.filter(r => !r.visits).length;

    const kpi = (k, v, b, sub) => `<div class="kpi ${b || ""}"><div class="k">${k}</div>` +
      `<div class="v" dir="ltr">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;

    /* لون علامة كل فرع — يجعل الصف يُقرأ بالعين قبل قراءة الاسم */
    const brandCol = id => {
      const b = (CAT.branches || []).find(x => x.id === id);
      const m = (C.BRANDS || {})[b && b.brand_code];
      return (m && m.color) || "var(--accent)";
    };

    /* بطاقات الفروع — العرض على الجوال */
    const cards = rows.length ? rows.map((r, i) => {
      const p = r.visit_pct ?? r.shift_pct;
      const b = bandOf(p, r.target_pct, r.critical_fails > 0);
      const gap = p == null ? null : p - r.target_pct;
      return `<div class="brow" style="--bc:${brandCol(r.branch_id)}"
          onclick="AD.branchHist('${r.branch_id}')">
        <div class="rk">${p == null ? "—" : i + 1}</div>
        <div class="bd">
          <div class="nm">${esc(r.name_ar)}
            ${r.critical_fails ? `<span class="tag r">${r.critical_fails} حرج</span>` : ""}
            ${r.late_findings ? `<span class="tag a">${r.late_findings} متأخرة</span>` : ""}
            ${!r.visits ? `<span class="tag a">بلا زيارة</span>` : ""}</div>
          <div class="meta">
            <span>المستهدف <span dir="ltr">${n1(r.target_pct)}</span></span>
            <span>الفارق <span dir="ltr" style="color:${gap == null ? "var(--ink-3)"
              : gap >= 0 ? "var(--ok)" : "var(--bad)"};font-weight:800">${
                gap == null ? "—" : (gap > 0 ? "+" : "") + gap.toFixed(1)}</span></span>
            <span>ملاحظات <span dir="ltr">${r.open_findings || 0}</span></span>
            <span>${r.last_check ? "آخر تشييك " + esc(r.last_check) : "لا تشييك بعد"}</span>
          </div>
          <div class="bar"><i style="width:${p || 0}%;background:${cvar(b)}"></i>
            <u style="inset-inline-start:${r.target_pct || 0}%"></u></div>
        </div>
        <div class="sc"><b style="color:${cvar(b)}">${n1(p)}</b><span>من ١٠٠</span></div>
        <button class="go" aria-label="السجل">‹</button>
      </div>`;
    }).join("") : `<div class="empty">لا بيانات بعد.</div>`;

    V().innerHTML = tabs() +
      `<div class="kpis">
        ${kpi("متوسط ٢٨ يوماً", avg == null ? "—" : n1(avg),
          avg == null ? "" : (avg >= 90 ? "g" : avg >= 80 ? "a" : "r"),
          `${withScore.length} موقعاً مُقيَّماً`)}
        ${kpi("تحت المستهدف", below, below ? "r" : "g", `من ${rows.length} موقعاً`)}
        ${kpi("إخفاقات حرجة", cf, cf ? "r" : "g", cf ? "تُغلق خلال ٢٤ ساعة" : "لا شيء")}
        ${kpi("ملاحظات مفتوحة", open, open ? "a" : "g", late ? `منها ${late} متأخرة` : "لا متأخرات")}
        ${kpi("بلا زيارة QA &amp; Training", noV, noV ? "a" : "g", "خلال ٢٨ يوماً")}
      </div>
      <div class="card"><h2>الفروع مقابل المستهدف</h2>
      <p class="sub">آخر ٢٨ يوماً · مرتّبة بالنتيجة · الخط الداكن على الشريط = مستهدف الفرع.</p>
      <div class="adm-cards">${cards}</div>
      <div class="adm-table"><div class="tw"><table><thead><tr>
        <th>#</th><th>الموقع</th><th>زيارة QA &amp; Training</th><th>الورديات</th><th>المستهدف</th>
        <th>الفارق</th><th></th><th>حرج</th><th>ملاحظات</th><th>آخر تشييك</th><th></th>
      </tr></thead><tbody>` +
      (rows.length ? rows.map((r, i) => {
        const p = r.visit_pct ?? r.shift_pct;
        const b = bandOf(p, r.target_pct, r.critical_fails > 0);
        const gap = p == null ? null : p - r.target_pct;
        return `<tr>
          <td class="c">${p == null ? "—" : i + 1}</td>
          <td><b>${esc(r.name_ar)}</b></td>
          <td class="c"><span class="pill ${b}">${n1(r.visit_pct)}</span></td>
          <td class="c">${n1(r.shift_pct)}</td>
          <td class="c">${n1(r.target_pct)}</td>
          <td class="c" style="color:${gap == null ? "var(--ink-3)" : gap >= 0 ? "var(--ok)" : "var(--bad)"};font-weight:700">
            <span dir="ltr" style="display:inline-block">${
              gap == null ? "—" : (gap > 0 ? "+" : "") + gap.toFixed(1)}</span></td>
          <td><div class="mini"><i style="width:${p || 0}%;background:${cvar(b)}"></i></div></td>
          <td class="c">${r.critical_fails ? `<span class="pill r">${r.critical_fails}</span>` : "—"}</td>
          <td class="c">${r.open_findings}${r.late_findings ? ` <span class="pill r">${r.late_findings}</span>` : ""}</td>
          <td class="c" style="font-size:11.5px">${r.last_check || '<span class="pill n">لا شيء</span>'}</td>
          <td class="c noprint"><button class="btn g sm" onclick="AD.branchHist('${r.branch_id}')">السجل</button></td>
        </tr>`;
      }).join("") : `<tr><td colspan="11" class="empty">لا بيانات بعد.</td></tr>`) +
      `</tbody></table></div></div>
      <div class="row noprint"><button class="btn g" onclick="AD.exportCsv()">تصدير Excel</button>
        <button class="btn g" onclick="window.print()">طباعة / PDF</button>
        <button class="btn p" onclick="AD.shareSummary()">إرسال الملخص</button></div></div>

      <div class="card"><h2>أكثر البنود ملاحظات</h2>
      <p class="sub">البند المتصدر مشكلة نظام أو تدريب — لا مشكلة فرع واحد.</p>` +
      ((top || []).length ? (top || []).map(t => {
        const mx = top[0].still_open || top[0].total || 1;
        return `<div class="hb"><span class="n">${esc(t.item_title)}</span>
          <span class="t"><i style="width:${(t.still_open || 0) / mx * 100}%;background:var(--warn)"></i></span>
          <span class="v">${t.still_open}</span></div>
          <div style="font-size:11px;color:var(--ink-3);margin:-4px 0 8px">
            ${esc(t.section_name)} · ${t.branches} موقعاً · ${t.total} مرة خلال ٩٠ يوماً</div>`;
      }).join("") : '<div class="empty">لا ملاحظات.</div>') + `</div>`;
    window.__SUM = rows;
  }

  /* ─────────── شبكة الورديات ─────────── */
  async function shifts() {
    V().innerHTML = tabs() + `<div class="card"><h2>جارٍ التحميل…</h2></div>`;
    const { data, error } = await sb.from("v_shift_status").select("*");
    if (error) return void (V().innerHTML = tabs() + `<div class="banner bad">${esc(error.message)}</div>`);

    const days = [...new Set(data.map(r => r.business_date))].sort().slice(-14);
    const branches = [...new Map(data.map(r => [r.branch_id, r])).values()]
      .sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"));
    const key = (b, d, s) => `${b}|${d}|${s}`;
    const map = new Map(data.map(r => [key(r.branch_id, r.business_date, r.shift), r]));
    const order = ["open", "mid", "close"];
    const today = businessDate();

    let head = `<tr><th>الموقع</th>` + days.map(d =>
      `<th colspan="3" style="text-align:center;font-size:10px">${d.slice(5)}</th>`).join("") + `</tr>`;

    const body = branches.map(b => {
      const cells = days.map(d => order.map(s => {
        const r = map.get(key(b.branch_id, d, s));
        if (!r) return `<td class="c"><div class="cellv na">·</div></td>`;
        if (r.done) return `<td class="c" title="${esc(SHIFT_AR[s])} ${d} — ${r.score}٪">
          <div class="cellv done">${Math.round(r.score)}</div></td>`;
        const future = d > today;
        return `<td class="c"><div class="cellv ${future ? "na" : "miss"}"
          title="${esc(SHIFT_AR[s])} ${d} — لم يُنفَّذ">${future ? "·" : "✗"}</div></td>`;
      }).join("")).join("");
      return `<tr><td style="white-space:nowrap"><b>${esc(b.name_ar)}</b></td>${cells}</tr>`;
    }).join("");

    const total = data.filter(r => r.business_date <= today).length;
    const doneN = data.filter(r => r.done && r.business_date <= today).length;

    V().innerHTML = tabs() +
      `<div class="kpis">
        <div class="kpi ${doneN / total >= .9 ? "g" : doneN / total >= .75 ? "a" : "r"}">
          <div class="k">نسبة تنفيذ الورديات (١٤ يوماً)</div>
          <div class="v">${total ? Math.round(doneN / total * 100) : 0}٪</div></div>
        <div class="kpi"><div class="k">ورديات منفَّذة</div><div class="v">${doneN}</div></div>
        <div class="kpi ${total - doneN ? "r" : "g"}"><div class="k">ورديات فائتة</div>
          <div class="v">${total - doneN}</div></div>
      </div>
      <div class="card"><h2>خريطة تنفيذ الورديات</h2>
      <p class="sub">ثلاث خانات لكل يوم: الفتح · الذروة · الإغلاق. الرقم = النتيجة، و✗ = لم يُنفَّذ.</p>
      <div class="tw"><table><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
  }

  /* ─────────── الملاحظات ─────────── */
  async function find() {
    V().innerHTML = tabs() + `<div class="card"><h2>جارٍ التحميل…</h2></div>`;
    const { data } = await sb.from("findings").select("*, branches(name_ar)")
      .eq("status", "open").order("due_date", { ascending: true }).limit(400);
    const today = businessDate();
    const rows = (data || []).map(f => {
      const late = f.due_date && f.due_date < today;
      return `<tr class="${late ? "late" : ""}">
        <td class="c" dir="ltr" style="white-space:nowrap;${late ? "color:var(--bad);font-weight:700" : ""}">${esc(f.due_date || "—")}</td>
        <td>${esc(f.branches ? f.branches.name_ar : "")}</td>
        <td>${esc(f.item_title)}${f.critical ? '<span class="chip cr">حرج</span>' : ""}</td>
        <td class="c"><span class="pill ${f.value === 0 ? "r" : "a"}">${f.value === 0 ? "غير مطابق" : "جزئي"}</span></td>
        <td>${esc(f.note || "")}</td>
        <td>${esc(f.action || "")}</td>
        <td>${esc(f.owner_name || "")}</td>
        <td class="c">${(f.photos || []).length ? `<button class="btn g sm" onclick="AD.pics('${f.id}')">صور</button>` : "—"}</td>
        <td class="c noprint"><button class="btn g sm" onclick="AD.close('${f.id}')">إغلاق</button></td></tr>`;
    }).join("");
    window.__FIND = data || [];
    V().innerHTML = tabs() + `<div class="card"><h2>الملاحظات المفتوحة (${(data || []).length})</h2>
      <p class="sub">مرتبة بتاريخ الاستحقاق. المتأخر بالأحمر.</p>
      <div class="tw"><table><thead><tr><th>الاستحقاق</th><th>الموقع</th><th>البند</th><th>التقييم</th>
      <th>الملاحظة</th><th>الإجراء</th><th>المسؤول</th><th>صور</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="empty">لا ملاحظات مفتوحة.</td></tr>'}</tbody></table></div>
      <div class="row noprint"><button class="btn g" onclick="AD.exportFindings()">تصدير Excel</button>
      <button class="btn p" onclick="AD.shareFindings()">إرسال قائمة المتأخر</button></div></div>
      <div id="pics"></div>`;
  }

  async function pics(id) {
    const f = (window.__FIND || []).find(x => x.id === id); if (!f) return;
    const urls = (await Promise.all((f.photos || []).map(p => window.SI.signedUrl(p, 3600)))).filter(Boolean);
    $("#pics").innerHTML = `<div class="card"><h2>${esc(f.item_title)}</h2>
      <p class="sub">${esc(f.branches ? f.branches.name_ar : "")} · ${esc(f.due_date || "")}</p>
      <div style="display:flex;gap:9px;flex-wrap:wrap">${urls.map(u =>
        `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" style="max-width:260px;border-radius:5px;border:1px solid var(--rule)"></a>`).join("")}</div></div>`;
    $("#pics").scrollIntoView({ behavior: "smooth" });
  }

  async function closeF(id) {
    const note = prompt("ماذا نُفِّذ؟ (اختياري)") ?? "";
    const { error } = await sb.rpc("fn_close_finding", { p_id: id, p_note: note || null });
    if (error) return toast(error.message, true);
    toast("أُغلقت"); find();
  }

  /* ─────────── السجل ─────────── */
  async function hist(branchId) {
    V().innerHTML = tabs() + `<div class="card"><h2>جارٍ التحميل…</h2></div>`;
    let q = sb.from("inspections")
      .select("id,business_date,template_key,shift,score,band,critical_fails,user_name,submitted_at,distance_m,geofence_ok,branch_id")
      .eq("status", "submitted").order("submitted_at", { ascending: false }).limit(200);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    const bn = id => (CAT.branches.find(b => b.id === id) || {}).name_ar || "";
    const tn = k => (CAT.templates.find(t => t.key === k) || {}).name_ar || k;
    const rows = (data || []).map(r => `<tr>
      <td class="c" style="font-size:11.5px">${esc(r.business_date)}</td>
      <td>${esc(bn(r.branch_id))}</td>
      <td>${esc(tn(r.template_key))}${r.shift ? " — " + SHIFT_AR[r.shift] : ""}</td>
      <td class="c"><span class="pill ${bandCls(r.band)}">${n1(r.score)}</span></td>
      <td class="c">${r.critical_fails || "—"}</td>
      <td>${esc(r.user_name)}</td>
      <td class="c" style="font-size:11.5px">${r.geofence_ok === false
        ? '<span class="pill r">خارج النطاق</span>' : (r.distance_m ?? "—") + " م"}</td>
      <td class="c noprint"><button class="btn g sm" onclick="location.href='report.html?i=${r.id}'">التقرير</button></td>
    </tr>`).join("");
    V().innerHTML = tabs() + `<div class="card">
      <h2>سجل التشييك${branchId ? " — " + esc(bn(branchId)) : ""}</h2>
      <p class="sub">آخر ٢٠٠ تشييك مُرسَل.</p>
      <div class="tw"><table><thead><tr><th>اليوم</th><th>الموقع</th><th>النوع</th><th>النتيجة</th>
      <th>حرج</th><th>المنفِّذ</th><th>المسافة</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty">لا سجل.</td></tr>'}</tbody></table></div></div>`;
  }
  const branchHist = id => { TAB = "hist"; hist(id); };

  /* ─────────── إعدادات الفروع ─────────── */
  async function settings() {
    CAT = await catalog(true);
    V().innerHTML = tabs() + `<div class="card"><h2>إعدادات الفروع</h2>
      <p class="sub">حدّد لكل فرع مستهدفه («الريت»)، ونطاقه الجغرافي، وورديّاته.
      لضبط الإحداثيات: قف داخل الفرع واضغط «موقعي الآن».</p>
      <div class="tw"><table><thead><tr>
        <th>الموقع</th><th>المستهدف ٪</th><th>النطاق (م)</th><th>منع خارج النطاق</th>
        <th>الإحداثيات</th><th>الورديات</th><th>واتساب</th><th></th>
      </tr></thead><tbody>` +
      CAT.branches.map(b => `<tr data-id="${b.id}">
        <td><b>${esc(b.name_ar)}</b><br><span style="font-size:11px;color:var(--ink-3)">${esc(b.code)}</span></td>
        <td><input type="number" step="0.5" min="50" max="100" value="${b.target_pct}" style="width:78px" data-f="target_pct"></td>
        <td><input type="number" step="10" min="30" max="2000" value="${b.geofence_m}" style="width:78px" data-f="geofence_m"></td>
        <td class="c"><input type="checkbox" ${b.enforce_geo ? "checked" : ""} data-f="enforce_geo"></td>
        <td style="min-width:190px">
          <div style="display:flex;gap:5px;align-items:center">
            <input type="text" value="${b.lat != null ? b.lat.toFixed(6) + ", " + b.lng.toFixed(6) : ""}"
              placeholder="غير مضبوط" data-f="latlng" dir="ltr"
              style="width:150px;font-size:12px;text-align:left">
            <button class="btn g sm" onclick="AD.here('${b.id}',this)">موقعي الآن</button></div></td>
        <td style="min-width:150px">${["open", "mid", "close"].map(s =>
          `<label style="font-size:11.5px;margin-inline-end:7px"><input type="checkbox" data-shift="${s}"
            ${(b.shifts || []).includes(s) ? "checked" : ""}> ${SHIFT_AR[s]}</label>`).join("")}</td>
        <td><input type="text" value="${esc(b.phone || "")}" placeholder="965xxxxxxxx"
          data-f="phone" style="width:120px;font-size:12px"></td>
        <td class="c"><button class="btn p sm" onclick="AD.saveBranch('${b.id}',this)">حفظ</button></td>
      </tr>`).join("") +
      `</tbody></table></div></div>`;
  }

  async function here(id, btn) {
    btn.disabled = true; btn.textContent = "…";
    try {
      const p = await getPosition();
      const row = btn.closest("tr");
      row.querySelector('[data-f=latlng]').value = p.lat.toFixed(6) + ", " + p.lng.toFixed(6);
      toast(`تم — دقة ${p.accuracy} متر`);
    } catch (e) { toast(e.message, true); }
    btn.disabled = false; btn.textContent = "موقعي الآن";
  }

  async function saveBranch(id, btn) {
    const row = btn.closest("tr");
    const g = f => row.querySelector(`[data-f="${f}"]`);
    const ll = (g("latlng").value || "").split(",").map(x => parseFloat(x.trim()));
    const patch = {
      target_pct: parseFloat(g("target_pct").value),
      geofence_m: parseInt(g("geofence_m").value, 10),
      enforce_geo: g("enforce_geo").checked,
      phone: g("phone").value.trim() || null,
      shifts: Array.from(row.querySelectorAll("[data-shift]"))
        .filter(c => c.checked).map(c => c.dataset.shift),
      lat: ll.length === 2 && !isNaN(ll[0]) ? ll[0] : null,
      lng: ll.length === 2 && !isNaN(ll[1]) ? ll[1] : null
    };
    btn.disabled = true;
    const { error } = await sb.from("branches").update(patch).eq("id", id);
    btn.disabled = false;
    if (error) return toast(error.message, true);
    toast("حُفظ"); await catalog(true);
  }

  /* ─────────── تصدير ومشاركة ─────────── */
  function csv(rows, name) {
    const s = "﻿" + rows.map(r => r.map(c =>
      `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([s], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click();
  }
  function exportCsv() {
    const rows = [["الموقع", "زيارة QA & Training", "الورديات", "المستهدف", "الفارق",
      "إخفاقات حرجة", "ملاحظات مفتوحة", "متأخرة", "آخر تشييك"]];
    (window.__SUM || []).forEach(r => {
      const p = r.visit_pct ?? r.shift_pct;
      rows.push([r.name_ar, n1(r.visit_pct), n1(r.shift_pct), n1(r.target_pct),
        p == null ? "" : (p - r.target_pct).toFixed(1),
        r.critical_fails, r.open_findings, r.late_findings, r.last_check || ""]);
    });
    csv(rows, `تشييك-الفروع-${businessDate()}.csv`);
  }
  function exportFindings() {
    const rows = [["الاستحقاق", "الموقع", "المحور", "البند", "التقييم", "الملاحظة",
      "الإجراء", "المسؤول", "متأخرة"]];
    const t = businessDate();
    (window.__FIND || []).forEach(f => rows.push([f.due_date || "",
      f.branches ? f.branches.name_ar : "", f.section_name, f.item_title,
      f.value === 0 ? "غير مطابق" : "جزئي", f.note || "", f.action || "",
      f.owner_name || "", (f.due_date && f.due_date < t) ? "نعم" : "لا"]));
    csv(rows, `الملاحظات-المفتوحة-${t}.csv`);
  }

  function shareSummary() {
    const rows = (window.__SUM || []).filter(r => (r.visit_pct ?? r.shift_pct) != null);
    const low = rows.filter(r => (r.visit_pct ?? r.shift_pct) < r.target_pct);
    const txt = `📋 ملخص تشييك الفروع — ${fmtDate(businessDate())}\n\n` +
      rows.slice(0, 20).map(r => {
        const p = r.visit_pct ?? r.shift_pct;
        const m = p >= r.target_pct ? "🟢" : p >= r.target_pct - 10 ? "🟡" : "🔴";
        return `${m} ${r.name_ar}: ${n1(p)}٪ (المستهدف ${n1(r.target_pct)})`;
      }).join("\n") +
      `\n\nتحت المستهدف: ${low.length}` +
      `\nملاحظات مفتوحة: ${rows.reduce((s, r) => s + r.open_findings, 0)}` +
      ` — منها متأخرة: ${rows.reduce((s, r) => s + r.late_findings, 0)}`;
    sendOut(txt, "ملخص تشييك الفروع");
  }
  function shareFindings() {
    const t = businessDate();
    const late = (window.__FIND || []).filter(f => f.due_date && f.due_date < t);
    if (!late.length) return toast("لا ملاحظات متأخرة 👌");
    const txt = `⚠️ ملاحظات متأخرة (${late.length}) — ${fmtDate(t)}\n\n` +
      late.slice(0, 25).map(f => `• ${f.branches ? f.branches.name_ar : ""} — ${f.item_title}` +
        `\n  ${f.action || ""} (${f.owner_name || "بلا مسؤول"}) — استحقاق ${f.due_date}`).join("\n");
    sendOut(txt, "ملاحظات متأخرة");
  }
  async function sendOut(text, subject) {
    if (navigator.share) { try { await navigator.share({ title: subject, text }); return; } catch (_) { } }
    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML = `<h2>${esc(subject)}</h2>
      <textarea style="min-height:180px">${esc(text)}</textarea>
      <div class="row">
        <a class="btn p" style="text-align:center;text-decoration:none"
           href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">واتساب</a>
        <a class="btn g" style="text-align:center;text-decoration:none"
           href="mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}">إيميل</a>
        <button class="btn g" onclick="this.closest('.card').remove()">إغلاق</button></div>`;
    V().prepend(box); box.scrollIntoView({ behavior: "smooth" });
  }

  window.AD = { go, close: closeF, pics, branchHist, here, saveBranch,
    exportCsv, exportFindings, shareSummary, shareFindings };
  boot();
})();
