/* ═══════════════════════════════════════════════════════════════
   سفن ايكونز — نظام الصيانة  ·  Seven Icons — Maintenance
   ───────────────────────────────────────────────────────────────
   قاعدتان تحكمان هذا الملف، لا تُكسرا عند أي تعديل لاحق:

   ١) لا استعلام قبل وجود جلسة. عميل Supabase يُرسل مفتاح anon
      وحده لو لم يكن هناك دخول — فيخرج الطلب بدور anon لا بدور
      المستخدم، وتنهار كل قواعد الأدوار بصمت. guard() يمنع ذلك.

   ٢) القراءة من v_maint_live لا من maint_tickets. المنظور يضيف
      الحالة الزمنية محسوبة لحظة القراءة (تأخير، تصعيد، التزام
      بالمهلة) — فالشاشة صادقة بلا أي وظيفة مجدولة تعمل بالخلفية.

   والحماية كلها في القاعدة لا هنا: إخفاء زر من الواجهة ترتيبٌ
   للشاشة، والرفض الحقيقي يأتي من التريجر والسياسات.
   ═══════════════════════════════════════════════════════════════ */
(function () {
"use strict";

/* شاشة ميتة بصمت أسوأ من شاشة بتقول إن فيه غلط. لو نقص ملف،
   الزر يفضل شكله سليم والضغطة ماتعملش حاجة، ويقعد المستخدم
   يجرّب الباسورد وهو مظبوط. فنقولها صريحة. */
if(!window.SI || !window.SI.sb){
  document.addEventListener("DOMContentLoaded", function(){
    document.body.innerHTML =
      '<div style="font-family:system-ui;direction:rtl;max-width:420px;margin:60px auto;'
    + 'padding:24px;border-radius:14px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;'
    + 'line-height:1.9;font-size:14px">'
    + '<b style="font-size:16px">ملف ناقص على الخادم</b><br>'
    + 'الصفحة تحتاج <code>lib.js</code> و <code>config.js</code> في نفس المجلد.<br>'
    + 'ارفعهما مع <code>maint.html</code> و <code>maint.js</code>.'
    + '</div>';
  });
  throw new Error("SI missing — lib.js not loaded");
}
const { sb, esc, $, $$, processPhoto, uploadPhoto, signedUrl, idbPut, idbAll, idbDel } = window.SI;
const C = window.CONFIG;

/* ═══════════ الترجمة ═══════════ */
const L = {
ar: {
  app_title:"نظام الصيانة", company:"سفن ايكونز",
  email:"البريد الإلكتروني", password:"كلمة المرور", signin:"دخول",
  signing:"جارٍ الدخول…", bad_login:"البريد أو كلمة المرور غير صحيحة",
  no_profile:"حسابك غير مفعّل في النظام — كلّم الإدارة",
  sess_out:"انتهت الجلسة — سجّل الدخول من جديد",

  t_home:"الرئيسية", t_tickets:"التذاكر", t_assets:"الأجهزة",
  t_intel:"التحليلات", t_setup:"الإعداد",

  r_admin:"الإدارة", r_area:"مشرف منطقة", r_branch:"مدير فرع",

  /* لوحة المؤشرات */
  k_open:"مفتوحة", k_overdue:"متأخرة", k_urgent:"عاجلة",
  k_unassigned:"بلا إسناد", k_resolved30:"أُصلحت (٣٠ يوم)",
  k_cost30:"تكلفة ٣٠ يوم", k_cost365:"تكلفة السنة",
  k_avgfix:"متوسط الإصلاح", k_sla:"الالتزام بالمهلة",
  k_pm:"صيانة وقائية مستحقة",
  hours:"ساعة", kd:"د.ك", pct:"٪",

  new_ticket:"تذكرة صيانة جديدة", report_fault:"بلّغ عن عطل",
  needs_you:"يحتاج تدخلك الآن", all_clear:"لا شيء متأخر — كل التذاكر ضمن مهلتها",
  branches_tbl:"الفروع", branch:"الفرع", opened:"مفتوحة", overdue:"متأخرة",
  cost30:"تكلفة ٣٠ يوم", sla90:"الالتزام ٩٠ يوم", fix90:"متوسط الإصلاح",

  /* التذاكر */
  search_ph:"ابحث برقم التذكرة أو العنوان…",
  f_all:"الكل", f_status:"الحالة", f_priority:"الأولوية",
  f_cat:"الفئة", f_branch:"الفرع", f_open_only:"المفتوحة فقط",
  no_tickets:"لا توجد تذاكر مطابقة",
  s_new:"جديدة", s_assigned:"مُسندة", s_in_progress:"جارٍ العمل",
  s_on_hold:"معلّقة", s_resolved:"تم الإصلاح", s_closed:"مقفلة",
  s_cancelled:"ملغاة",
  due_in:"باقٍ", overdue_by:"متأخرة", esc_area:"صُعِّدت لمشرف المنطقة",
  esc_admin:"صُعِّدت للإدارة", near_due:"قاربت المهلة",
  d:"ي", h:"س", m:"د",

  /* نموذج جديد */
  nt_cat:"ما نوع العطل؟", nt_prio:"ما مدى إلحاحه؟",
  nt_title:"عنوان مختصر", nt_title_ph:"مثال: ثلاجة العرض لا تبرّد",
  nt_desc:"وصف تفصيلي", nt_desc_ph:"إيه اللي بيحصل بالظبط؟ من إمتى؟ بيأثر على إيه؟",
  nt_asset:"الجهاز (اختياري)", nt_asset_none:"غير محدد",
  nt_photos:"صور العطل", nt_photos_hint:"الصور تُختم بالفرع والوقت داخل الصورة نفسها",
  nt_submit:"إرسال التذكرة", nt_sending:"جارٍ الإرسال…",
  e_cat:"اختر نوع العطل", e_title:"اكتب عنواناً مختصراً للعطل",
  e_title_short:"العنوان قصير جداً — وضّح أكتر",
  ok_created:"تم فتح التذكرة",
  asset_hist:"سجل هذا الجهاز: {n} عطل خلال ٩٠ يوم",

  /* التفاصيل */
  det_reported:"بلّغ عنه", det_at:"في", det_asset:"الجهاز",
  det_vendor:"المنفّذ", det_assignee:"المسؤول", det_due:"المهلة",
  det_cost:"التكلفة", det_invoice:"الفاتورة", det_resolution:"ما تم عمله",
  det_downtime:"مدة التوقف", det_rating:"تقييم الفرع",
  det_timeline:"سجل التذكرة", det_photos:"الصور",
  det_comment_ph:"اكتب تعليقاً أو تحديثاً…", det_send:"إرسال",
  a_assign:"إسناد", a_start:"بدء العمل", a_hold:"تعليق",
  a_resolve:"تسجيل الإصلاح", a_close:"إقفال التذكرة", a_cancel:"إلغاء",
  a_reopen:"إعادة فتح",
  m_assign:"إسناد التذكرة", m_vendor:"المنفّذ", m_int:"داخلي", m_ext:"خارجي",
  m_hold:"سبب التعليق", m_hold_ph:"مثال: بانتظار قطعة الغيار",
  m_res:"تسجيل الإصلاح", m_res_what:"ما تم عمله بالضبط",
  m_res_ph:"استُبدل الكمبروسر ونُظّف المكثّف",
  m_parts:"تكلفة القطع", m_labour:"تكلفة العمالة", m_inv:"رقم الفاتورة",
  m_down:"مدة التوقف (دقيقة)",
  m_close:"إقفال التذكرة", m_rate:"كيف كان الإصلاح؟",
  m_cancel:"سبب الإلغاء", ok_saved:"تم الحفظ",
  ev_created:"فُتحت التذكرة", ev_status:"الحالة", ev_assign:"الإسناد",
  ev_comment:"تعليق", ev_cost:"التكلفة", ev_photo:"صور",
  confirm_cancel:"إلغاء التذكرة نهائياً؟",

  /* الأجهزة */
  as_new:"جهاز جديد", as_code:"رمز الملصق", as_name:"اسم الجهاز",
  as_cat:"الفئة", as_branch:"الفرع", as_make:"الشركة", as_model:"الموديل",
  as_serial:"الرقم التسلسلي", as_loc:"مكانه في الفرع",
  as_install:"تاريخ التركيب", as_warranty:"الضمان حتى", as_cost:"سعر الشراء",
  as_status:"الحالة", as_active:"يعمل", as_replace:"يحتاج استبدال",
  as_retired:"خارج الخدمة", as_none:"لا أجهزة مسجّلة",
  as_qr:"طباعة ملصقات QR", as_faults:"الأعطال", as_spent:"صُرف عليه",
  as_warranty_on:"تحت الضمان", as_warranty_off:"انتهى الضمان",

  /* التحليلات */
  in_repeat:"أجهزة تستنزفك", in_repeat_sub:"٣ أعطال أو أكثر خلال ٩٠ يوم",
  in_none:"لا يوجد جهاز متكرر العطل — وضع جيد",
  v_replace_cost:"استبدله — إصلاحه بلغ نصف ثمنه",
  v_replace_freq:"استبدله — ٥ أعطال في ٩٠ يوم",
  v_watch:"راقبه",
  in_faults:"أعطال", in_cost:"تكلفة ٩٠ يوم", in_gap:"كل",
  in_days:"يوم", in_cat:"التكلفة بالفئة", in_vendors:"أداء المنفّذين",
  in_jobs:"مهمة", in_rate:"التقييم", in_hours:"متوسط الساعات",
  in_billed:"إجمالي المطالبات", in_pm:"الصيانة الوقائية",
  pm_gen:"توليد التذاكر المستحقة", pm_none:"لا خطط وقائية",
  pm_due:"مستحقة", pm_every:"كل", pm_next:"التالية",
  pm_made:"تم توليد {n} تذكرة وقائية", pm_made0:"لا تذاكر وقائية مستحقة الآن",

  /* الإعداد */
  se_vendors:"المنفّذون", se_vendor_new:"منفّذ جديد",
  se_name:"الاسم", se_phone:"الهاتف", se_kind:"النوع",
  se_spec:"التخصصات", se_pm_new:"خطة وقائية جديدة",
  se_pm_title:"عنوان الخطة", se_pm_every:"كل كم يوم؟",
  se_sla:"سياسة المهل", se_respond:"أول رد", se_resolve:"الإغلاق",
  se_sla_note:"المهلة تُحسب من لحظة فتح التذكرة. تعديل هذه الأرقام يغيّر مهل التذاكر الجديدة فقط.",
  save:"حفظ", cancel:"إلغاء", close:"إغلاق", del:"حذف", edit:"تعديل",
  loading:"جارٍ التحميل…", err_generic:"حصل خطأ — حاول تاني",
  offline_photo:"الصورة محفوظة وسترفع لما ترجع الشبكة",
  nothing:"لا شيء هنا بعد"
},
en: {
  app_title:"Maintenance", company:"Seven Icons",
  email:"Email", password:"Password", signin:"Sign in",
  signing:"Signing in…", bad_login:"Wrong email or password",
  no_profile:"Your account is not active — contact the office",
  sess_out:"Session expired — please sign in again",

  t_home:"Home", t_tickets:"Tickets", t_assets:"Assets",
  t_intel:"Insights", t_setup:"Setup",

  r_admin:"Management", r_area:"Area manager", r_branch:"Branch manager",

  k_open:"Open", k_overdue:"Overdue", k_urgent:"Urgent",
  k_unassigned:"Unassigned", k_resolved30:"Fixed (30d)",
  k_cost30:"Cost 30d", k_cost365:"Cost 12m",
  k_avgfix:"Avg. fix time", k_sla:"SLA met",
  k_pm:"Preventive due",
  hours:"h", kd:"KD", pct:"%",

  new_ticket:"New maintenance ticket", report_fault:"Report a fault",
  needs_you:"Needs you now", all_clear:"Nothing overdue — every ticket is within its SLA",
  branches_tbl:"Branches", branch:"Branch", opened:"Open", overdue:"Overdue",
  cost30:"Cost 30d", sla90:"SLA 90d", fix90:"Avg. fix",

  search_ph:"Search ticket no. or title…",
  f_all:"All", f_status:"Status", f_priority:"Priority",
  f_cat:"Category", f_branch:"Branch", f_open_only:"Open only",
  no_tickets:"No matching tickets",
  s_new:"New", s_assigned:"Assigned", s_in_progress:"In progress",
  s_on_hold:"On hold", s_resolved:"Resolved", s_closed:"Closed",
  s_cancelled:"Cancelled",
  due_in:"due in", overdue_by:"overdue by", esc_area:"Escalated to area manager",
  esc_admin:"Escalated to management", near_due:"Approaching SLA",
  d:"d", h:"h", m:"m",

  nt_cat:"What kind of fault?", nt_prio:"How urgent is it?",
  nt_title:"Short title", nt_title_ph:"e.g. Display fridge not cooling",
  nt_desc:"Details", nt_desc_ph:"What exactly happens? Since when? What does it affect?",
  nt_asset:"Asset (optional)", nt_asset_none:"Not specified",
  nt_photos:"Photos", nt_photos_hint:"Branch and time are burned into the photo itself",
  nt_submit:"Submit ticket", nt_sending:"Sending…",
  e_cat:"Pick the fault type", e_title:"Write a short title",
  e_title_short:"Title too short — add a little more",
  ok_created:"Ticket opened",
  asset_hist:"This asset: {n} faults in 90 days",

  det_reported:"Reported by", det_at:"at", det_asset:"Asset",
  det_vendor:"Contractor", det_assignee:"Owner", det_due:"Due",
  det_cost:"Cost", det_invoice:"Invoice", det_resolution:"What was done",
  det_downtime:"Downtime", det_rating:"Branch rating",
  det_timeline:"History", det_photos:"Photos",
  det_comment_ph:"Write a comment or update…", det_send:"Send",
  a_assign:"Assign", a_start:"Start work", a_hold:"Put on hold",
  a_resolve:"Record the fix", a_close:"Close ticket", a_cancel:"Cancel",
  a_reopen:"Reopen",
  m_assign:"Assign ticket", m_vendor:"Contractor", m_int:"In-house", m_ext:"External",
  m_hold:"Reason for hold", m_hold_ph:"e.g. waiting for the spare part",
  m_res:"Record the fix", m_res_what:"What exactly was done",
  m_res_ph:"Compressor replaced, condenser cleaned",
  m_parts:"Parts cost", m_labour:"Labour cost", m_inv:"Invoice no.",
  m_down:"Downtime (minutes)",
  m_close:"Close ticket", m_rate:"How good was the fix?",
  m_cancel:"Reason for cancelling", ok_saved:"Saved",
  ev_created:"Ticket opened", ev_status:"Status", ev_assign:"Assignment",
  ev_comment:"Comment", ev_cost:"Cost", ev_photo:"Photos",
  confirm_cancel:"Cancel this ticket for good?",

  as_new:"New asset", as_code:"Label code", as_name:"Asset name",
  as_cat:"Category", as_branch:"Branch", as_make:"Make", as_model:"Model",
  as_serial:"Serial no.", as_loc:"Where in the branch",
  as_install:"Installed on", as_warranty:"Warranty until", as_cost:"Purchase cost",
  as_status:"Status", as_active:"Working", as_replace:"Needs replacement",
  as_retired:"Retired", as_none:"No assets registered",
  as_qr:"Print QR labels", as_faults:"Faults", as_spent:"Spent on it",
  as_warranty_on:"Under warranty", as_warranty_off:"Warranty ended",

  in_repeat:"Assets draining you", in_repeat_sub:"3+ faults within 90 days",
  in_none:"No repeat offenders — healthy estate",
  v_replace_cost:"Replace — repairs reached half its price",
  v_replace_freq:"Replace — 5 faults in 90 days",
  v_watch:"Watch it",
  in_faults:"faults", in_cost:"90-day cost", in_gap:"every",
  in_days:"days", in_cat:"Cost by category", in_vendors:"Contractor performance",
  in_jobs:"jobs", in_rate:"Rating", in_hours:"Avg. hours",
  in_billed:"Total billed", in_pm:"Preventive maintenance",
  pm_gen:"Generate due tickets", pm_none:"No preventive plans",
  pm_due:"due", pm_every:"every", pm_next:"next",
  pm_made:"{n} preventive ticket(s) generated", pm_made0:"Nothing preventive is due right now",

  se_vendors:"Contractors", se_vendor_new:"New contractor",
  se_name:"Name", se_phone:"Phone", se_kind:"Type",
  se_spec:"Specialties", se_pm_new:"New preventive plan",
  se_pm_title:"Plan title", se_pm_every:"Every how many days?",
  se_sla:"SLA policy", se_respond:"First response", se_resolve:"Resolution",
  se_sla_note:"The clock starts when the ticket opens. Changing these numbers affects new tickets only.",
  save:"Save", cancel:"Cancel", close:"Close", del:"Delete", edit:"Edit",
  loading:"Loading…", err_generic:"Something went wrong — try again",
  offline_photo:"Photo saved, it will upload when you're back online",
  nothing:"Nothing here yet"
}};

let LANG = localStorage.getItem("si_maint_lang") || "ar";
const t = k => (L[LANG] && L[LANG][k]) || L.ar[k] || k;

/* ═══════════ الحالة ═══════════ */
let ME = null, TAB = "home";
let DASH = null, CATS = [], SLA = [], BRANCHES = [], VENDORS = [], ASSETS = [], STAFF = [];
let TICKETS = [], CUR = null;
const F = { q:"", status:"open", priority:"", cat:"", branch:"" };

/* ═══════════ أدوات ═══════════ */
const num = n => new Intl.NumberFormat(LANG === "ar" ? "ar-KW-u-nu-latn" : "en-US").format(n ?? 0);
const money = n => num(Math.round((+n || 0) * 1000) / 1000) + " " + t("kd");
const catName = c => LANG === "ar" ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar);
function nameOf(o){
  if(!o) return "—";
  const v = LANG === "ar" ? (o.name_ar || o.name_en) : (o.name_en || o.name_ar);
  return v || "—";
}

function dt(ts){
  if(!ts) return "—";
  return new Intl.DateTimeFormat(LANG === "ar" ? "ar-KW-u-nu-latn" : "en-GB",
    { timeZone:C.TZ, day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:false })
    .format(new Date(ts));
}
function dateOnly(d){
  if(!d) return "—";
  return new Intl.DateTimeFormat(LANG === "ar" ? "ar-KW-u-nu-latn" : "en-GB",
    { timeZone:C.TZ, day:"2-digit", month:"short", year:"numeric" })
    .format(new Date(String(d).length === 10 ? d + "T12:00:00Z" : d));
}
/* دقائق → «٣ ي ٤ س» أو «٤٥ د» */
function dur(mins){
  const v = Math.abs(Math.round(mins || 0));
  const dd = Math.floor(v / 1440), hh = Math.floor((v % 1440) / 60), mm = v % 60;
  if(dd) return num(dd) + t("d") + " " + num(hh) + t("h");
  if(hh) return num(hh) + t("h") + " " + num(mm) + t("m");
  return num(mm) + t("m");
}
function toast(msg, bad){
  const el = $("#toast");
  el.textContent = msg; el.classList.toggle("bad", !!bad); el.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 3200);
}
const isStaff = () => ME && (ME.role === "admin" || ME.role === "area");
const isAdmin = () => ME && ME.role === "admin";

/* الجلسة شرط كل استعلام — بدونها يخرج الطلب بدور anon */
async function guard(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session || !session.access_token){ signOut(true); throw new Error(t("sess_out")); }
  return session;
}
async function q(fn){
  await guard();
  const r = await fn();
  if(r.error){
    if(/JWT|token|expired/i.test(r.error.message || "")) { signOut(true); }
    throw r.error;
  }
  return r.data;
}

/* ═══════════ الدخول ═══════════ */
async function doLogin(){
  const btn = $("#gBtn"), err = $("#gErr");
  const email = $("#gEmail").value.trim(), pass = $("#gPass").value;
  err.classList.add("hide");
  if(!email || !pass){ err.textContent = t("bad_login"); err.classList.remove("hide"); return; }
  btn.disabled = true; btn.textContent = t("signing");
  try{
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if(error) throw new Error(t("bad_login"));
    await boot();
  }catch(e){
    err.textContent = e.message || t("bad_login"); err.classList.remove("hide");
  }finally{
    btn.disabled = false; btn.textContent = t("signin");
  }
}
async function signOut(silent){
  try{ await sb.auth.signOut(); }catch(_){}
  ME = null;
  $("#app").classList.add("hide");
  $("#gate").classList.remove("hide");
  if(silent) { const e = $("#gErr"); e.textContent = t("sess_out"); e.classList.remove("hide"); }
}

/* ═══════════ الإقلاع ═══════════ */
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return;

  const { data:p } = await sb.from("profiles")
    .select("id, full_name, role, branch_id, phone, active").eq("id", session.user.id).single();
  if(!p || !p.active || p.role === "none"){
    const e = $("#gErr"); e.textContent = t("no_profile"); e.classList.remove("hide");
    await sb.auth.signOut(); return;
  }
  ME = { ...p, email: session.user.email };

  $("#gate").classList.add("hide");
  $("#app").classList.remove("hide");
  applyLang();
  buildTabs();
  await loadRefs();
  await refreshAll();
  flushPhotoQueue();
}

async function loadRefs(){
  const [cats, sla, brs] = await Promise.all([
    q(() => sb.from("maint_categories").select("*").eq("active", true).order("sort_order")),
    q(() => sb.from("maint_sla").select("*")),
    /* name_en أُضيف في 072 — نطلبه بأمان: لو لم يُشغَّل الملف بعد
       يسقط الطلب كله بخطأ عمود غير موجود، فنعيد المحاولة بدونه */
    q(() => sb.from("branches").select("id, code, name_ar, name_en, brand_code, active, sort").order("sort"))
      .catch(() => q(() => sb.from("branches").select("id, code, name_ar, brand_code, active, sort").order("sort")))
  ]);
  CATS = cats || []; BRANCHES = (brs || []).filter(b => b.active !== false);
  const order = { urgent:1, high:2, normal:3, low:4 };
  SLA = (sla || []).sort((a,b) => order[a.priority] - order[b.priority]);

  const my = BRANCHES.find(b => b.id === ME.branch_id);
  $("#who").textContent = (ME.full_name || ME.email) + " · " +
    (ME.role === "branch" ? nameOf(my) || t("r_branch") : t("r_" + ME.role));

  try{
    ASSETS = await q(() => sb.from("maint_assets")
      .select("id, code, branch_id, category, name_ar, name_en, make, model, serial_no, location_note, install_date, warranty_until, purchase_cost, status")
      .neq("status","retired").order("code"));
  }catch(_){ ASSETS = []; }

  if(isStaff()){
    try{
      VENDORS = await q(() => sb.from("maint_vendors").select("*").eq("active", true).order("name_ar"));
      STAFF   = await q(() => sb.from("profiles").select("id, full_name, role")
                  .in("role", ["admin","area"]).eq("active", true));
    }catch(_){ VENDORS = []; STAFF = []; }
  }
}

async function refreshAll(){
  try{
    const jobs = [loadTickets()];
    jobs.push(q(() => sb.rpc("fn_maint_dashboard")).then(d => { DASH = d; }));
    await Promise.all(jobs);
  }catch(e){ toast(e.message || t("err_generic"), true); }
  render();
}

async function loadTickets(){
  let sel = sb.from("v_maint_live").select("*").order("created_at", { ascending:false }).limit(400);
  TICKETS = await q(() => sel) || [];
}

/* ═══════════ اللغة والتبويبات ═══════════ */
function toggleLang(){
  LANG = LANG === "ar" ? "en" : "ar";
  localStorage.setItem("si_maint_lang", LANG);
  applyLang();
  if(ME){ buildTabs(); render(); if(CUR) openTicket(CUR.id); }
}
function applyLang(){
  document.documentElement.lang = LANG;
  document.documentElement.dir  = LANG === "ar" ? "rtl" : "ltr";
  document.title = t("company") + " — " + t("app_title");
  $$("[data-t]").forEach(el => el.textContent = t(el.dataset.t));
  const sw = $("#gLang"); if(sw) sw.textContent = LANG === "ar" ? "English" : "العربية";
  const sw2 = $("#tLang"); if(sw2) sw2.textContent = LANG === "ar" ? "EN" : "ع";
  const em = $("#gEmail"), pw = $("#gPass");
  if(em) em.placeholder = ""; if(pw) pw.placeholder = "";
}

const TABS = [
  { id:"home",    k:"t_home"    },
  { id:"tickets", k:"t_tickets" },
  { id:"assets",  k:"t_assets"  },
  { id:"intel",   k:"t_intel",  staff:true },
  { id:"setup",   k:"t_setup",  admin:true }
];
function buildTabs(){
  const vis = TABS.filter(x => (!x.staff || isStaff()) && (!x.admin || isAdmin()));
  $("#tabs").innerHTML = vis.map(x =>
    `<button class="tb ${x.id === TAB ? "on" : ""}" data-tab="${x.id}" onclick="MT.go('${x.id}')">
       ${esc(t(x.k))}<span class="n hide" id="badge_${x.id}"></span></button>`).join("");
}
function go(id){
  TAB = id;
  $$(".tb").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  $$(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + id));
  render();
  window.scrollTo({ top:0 });
}

/* ═══════════ العرض ═══════════ */
function render(){
  if(!ME) return;
  const bad = TICKETS.filter(x => x.escalation >= 2).length;
  const bd = $("#badge_tickets");
  if(bd){ bd.textContent = num(bad); bd.classList.toggle("hide", !bad); }

  if(TAB === "home")    renderHome();
  if(TAB === "tickets") renderTickets();
  if(TAB === "assets")  renderAssets();
  if(TAB === "intel")   renderIntel();
  if(TAB === "setup")   renderSetup();
}

/* ── الرئيسية ── */
function renderHome(){
  const el = $("#v-home");
  const k = (DASH && DASH.kpi) || {};
  const mine = TICKETS.filter(x => !["closed","cancelled"].includes(x.status));
  const hot  = TICKETS.filter(x => x.escalation >= 2)
                 .sort((a,b) => a.mins_to_due - b.mins_to_due);

  const kpi = (l, v, s, c) =>
    `<div class="kpi" style="--c:${c}"><div class="l">${esc(l)}</div>
       <div class="v">${v}</div>${s ? `<div class="s">${esc(s)}</div>` : ""}</div>`;

  let h = "";

  /* زر البلاغ أولاً — هو الفعل الأهم لمدير الفرع */
  h += `<button class="btn p btn-lg" style="width:100%;justify-content:center;margin-bottom:12px"
          onclick="MT.newTicket()"><i class="ti ti-plus"></i> ${esc(t("report_fault"))}</button>`;

  h += `<div class="kpis">
    ${kpi(t("k_open"),    num(k.open || 0),    "", "#0B5F4E")}
    ${kpi(t("k_overdue"), num(k.overdue || 0), "", k.overdue ? "#dc2626" : "#94a3b8")}
    ${kpi(t("k_urgent"),  num(k.urgent || 0),  "", k.urgent ? "#ea580c" : "#94a3b8")}
    ${isStaff() ? kpi(t("k_unassigned"), num(k.unassigned || 0), "", "#2563eb") : ""}
    ${kpi(t("k_resolved30"), num(k.resolved_30d || 0), "", "#16a34a")}
    ${k.avg_fix_hours != null ? kpi(t("k_avgfix"), num(k.avg_fix_hours) + " " + t("hours"), "", "#2563eb") : ""}
    ${k.sla_pct != null ? kpi(t("k_sla"), num(k.sla_pct) + t("pct"), "",
        k.sla_pct >= 80 ? "#16a34a" : k.sla_pct >= 60 ? "#d97706" : "#dc2626") : ""}
    ${isStaff() ? kpi(t("k_cost30"), money(k.cost_30d), t("k_cost365") + " " + money(k.cost_365d), "#475569") : ""}
  </div>`;

  /* ما يحتاج تدخّلاً الآن */
  h += `<div class="card"><div class="card-h"><i class="ti ti-alert-triangle"
          style="color:#dc2626"></i> ${esc(t("needs_you"))}
          <span class="sp">${num(hot.length)}</span></div><div class="card-b">`;
  h += hot.length ? hot.slice(0, 8).map(ticketCard).join("")
     : `<div class="empty"><i class="ti ti-circle-check" style="font-size:28px;color:#16a34a;display:block;margin-bottom:6px"></i>${esc(t("all_clear"))}</div>`;
  h += `</div></div>`;

  /* الفروع — للإدارة فقط */
  if(isStaff() && DASH && DASH.branches){
    const rows = DASH.branches.filter(b => b.open_tickets > 0 || b.tickets_30d > 0);
    h += `<div class="card"><div class="card-h"><i class="ti ti-building-store"></i> ${esc(t("branches_tbl"))}</div>
      <div style="overflow-x:auto"><table><thead><tr>
        <th>${esc(t("branch"))}</th><th>${esc(t("opened"))}</th><th>${esc(t("overdue"))}</th>
        <th>${esc(t("cost30"))}</th><th>${esc(t("sla90"))}</th><th>${esc(t("fix90"))}</th>
      </tr></thead><tbody>` +
      (rows.length ? rows.map(b => `<tr class="clk" onclick="MT.byBranch('${b.branch_id}')">
        <td><b>${esc(b.branch_name)}</b></td>
        <td>${num(b.open_tickets)}</td>
        <td>${b.overdue_tickets ? `<span class="pill r">${num(b.overdue_tickets)}</span>` : "—"}</td>
        <td class="mono">${money(b.cost_30d)}</td>
        <td>${b.sla_pct_90d == null ? "—" :
          `<span class="pill ${b.sla_pct_90d >= 80 ? "g" : b.sla_pct_90d >= 60 ? "a" : "r"}">${num(b.sla_pct_90d)}${t("pct")}</span>`}</td>
        <td>${b.avg_fix_hours_90d == null ? "—" : num(b.avg_fix_hours_90d) + " " + t("hours")}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">${esc(t("nothing"))}</td></tr>`) +
      `</tbody></table></div></div>`;
  }

  /* تذاكري المفتوحة — لمدير الفرع */
  if(!isStaff()){
    h += `<div class="card"><div class="card-h"><i class="ti ti-ticket"></i> ${esc(t("k_open"))}
          <span class="sp">${num(mine.length)}</span></div><div class="card-b">` +
      (mine.length ? mine.slice(0, 10).map(ticketCard).join("")
                   : `<div class="empty">${esc(t("nothing"))}</div>`) + `</div></div>`;
  }

  el.innerHTML = h;
}
function byBranch(id){ F.branch = id; F.status = ""; go("tickets"); }

/* ── بطاقة تذكرة ── */
function ticketCard(x){
  const sl = SLA.find(s => s.priority === x.priority) || {};
  const closed = ["resolved","closed","cancelled"].includes(x.status);
  let pct = 100, barc = "#16a34a";
  if(!closed && x.mins_to_due != null){
    const span = (new Date(x.resolve_due) - new Date(x.created_at)) / 60000;
    const used = span - x.mins_to_due;
    pct = Math.max(2, Math.min(100, Math.round(used / span * 100)));
    barc = x.escalation >= 2 ? "#dc2626" : x.escalation === 1 ? "#d97706" : "#16a34a";
  }
  const timeTxt = closed ? ""
    : x.mins_to_due < 0 ? `<span style="color:#dc2626;font-weight:700">${esc(t("overdue_by"))} ${dur(x.mins_to_due)}</span>`
    : `${esc(t("due_in"))} ${dur(x.mins_to_due)}`;
  const cat = CATS.find(c => c.code === x.category);

  return `<div class="tk esc${x.escalation}" onclick="MT.open('${x.id}')">
    <div class="tk-top">
      <span class="mono tk-no">${esc(x.ticket_no || "")}</span>
      <span class="pill ${statusPill(x.status)}">${esc(t("s_" + x.status))}</span>
      <span class="pill" style="background:${sl.color || "#64748b"}22;color:${sl.color || "#64748b"}">${esc(nameOf(sl).split("—")[0].trim())}</span>
      ${x.source === "preventive" ? `<span class="pill p"><i class="ti ti-calendar-repeat"></i></span>` : ""}
    </div>
    <div class="tk-title">${esc(x.title)}</div>
    <div class="tk-meta">
      <span><i class="ti ${cat ? cat.icon : "ti-dots"}"></i> ${esc(cat ? catName(cat) : x.category)}</span>
      ${isStaff() ? `<span><i class="ti ti-building-store"></i> ${esc(x.branch_name)}</span>` : ""}
      ${x.asset_code ? `<span><i class="ti ti-qrcode"></i> ${esc(x.asset_code)}</span>` : ""}
      ${timeTxt ? `<span><i class="ti ti-clock"></i> ${timeTxt}</span>` : ""}
    </div>
    ${closed ? "" : `<div class="sla"><i style="width:${pct}%;background:${barc}"></i></div>`}
  </div>`;
}
const statusPill = s => ({ new:"b", assigned:"b", in_progress:"a", on_hold:"n",
                           resolved:"g", closed:"n", cancelled:"n" })[s] || "n";

/* ── التذاكر ── */
function renderTickets(){
  const el = $("#v-tickets");
  const opt = (v, txt, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(txt)}</option>`;

  let h = `<button class="btn p btn-lg" style="width:100%;justify-content:center;margin-bottom:11px"
      onclick="MT.newTicket()"><i class="ti ti-plus"></i> ${esc(t("new_ticket"))}</button>`;

  h += `<div class="bar">
    <input id="fq" style="flex:1;min-width:150px" placeholder="${esc(t("search_ph"))}" value="${esc(F.q)}"
           oninput="MT.setF('q', this.value)">
    <select onchange="MT.setF('status', this.value)">
      ${opt("open", t("f_open_only"), F.status)}${opt("", t("f_all"), F.status)}
      ${["new","assigned","in_progress","on_hold","resolved","closed","cancelled"]
        .map(s => opt(s, t("s_" + s), F.status)).join("")}
    </select>
    <select onchange="MT.setF('priority', this.value)">
      ${opt("", t("f_priority") + ": " + t("f_all"), F.priority)}
      ${SLA.map(s => opt(s.priority, nameOf(s).split("—")[0].trim(), F.priority)).join("")}
    </select>
    <select onchange="MT.setF('cat', this.value)">
      ${opt("", t("f_cat") + ": " + t("f_all"), F.cat)}
      ${CATS.map(c => opt(c.code, catName(c), F.cat)).join("")}
    </select>
    ${isStaff() ? `<select onchange="MT.setF('branch', this.value)">
      ${opt("", t("f_branch") + ": " + t("f_all"), F.branch)}
      ${BRANCHES.map(b => opt(b.id, nameOf(b), F.branch)).join("")}
    </select>` : ""}
  </div>`;

  const rows = filtered();
  h += `<div class="card"><div class="card-b">` +
    (rows.length ? rows.map(ticketCard).join("") : `<div class="empty">${esc(t("no_tickets"))}</div>`) +
    `</div></div>`;
  el.innerHTML = h;
}
function filtered(){
  const s = F.q.trim().toLowerCase();
  return TICKETS.filter(x => {
    if(F.status === "open" && ["closed","cancelled"].includes(x.status)) return false;
    if(F.status && F.status !== "open" && x.status !== F.status) return false;
    if(F.priority && x.priority !== F.priority) return false;
    if(F.cat && x.category !== F.cat) return false;
    if(F.branch && x.branch_id !== F.branch) return false;
    if(s && !((x.ticket_no || "") + " " + (x.title || "") + " " + (x.description || "") +
              " " + (x.asset_code || "")).toLowerCase().includes(s)) return false;
    return true;
  }).sort((a,b) => (b.escalation - a.escalation) ||
        (new Date(b.created_at) - new Date(a.created_at)));
}
function setF(k, v){
  F[k] = v;
  if(k === "q"){ clearTimeout(setF._t); setF._t = setTimeout(() => {
      const box = $("#fq"), pos = box && box.selectionStart;
      renderTickets(); const nb = $("#fq");
      if(nb){ nb.focus(); try{ nb.setSelectionRange(pos, pos); }catch(_){ } }
    }, 220); return; }
  renderTickets();
}

/* ═══════════ الأوراق (sheets) ═══════════ */
function sheet(title, body, footer){
  $("#sheetHost").innerHTML =
    `<div class="sheet-bg" onclick="if(event.target===this)MT.closeSheet()"><div class="sheet">
      <div class="sheet-h"><h3>${esc(title)}</h3>
        <button class="sheet-x" onclick="MT.closeSheet()">×</button></div>
      <div class="sheet-b">${body}</div>
      ${footer ? `<div class="sheet-f">${footer}</div>` : ""}
    </div></div>`;
  document.body.style.overflow = "hidden";
}
function closeSheet(){ $("#sheetHost").innerHTML = ""; document.body.style.overflow = ""; CUR = null; }

/* ── تذكرة جديدة ── */
const NT = { cat:"", priority:"normal", asset:"", photos:[], thumbs:[], folder:"" };
function newTicket(){
  NT.cat = ""; NT.priority = "normal"; NT.asset = ""; NT.photos = []; NT.thumbs = [];
  NT.folder = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const myAssets = ASSETS.filter(a => isStaff() ? true : a.branch_id === ME.branch_id);

  const body = `
    <div id="ntErr" class="err hide"></div>

    <div class="fld"><label>${esc(t("nt_cat"))}</label>
      <div class="cats" id="ntCats">${CATS.map(c =>
        `<div class="cat" data-c="${esc(c.code)}" onclick="MT.pickCat('${esc(c.code)}')">
           <i class="ti ${esc(c.icon || "ti-dots")}"></i><span>${esc(catName(c))}</span></div>`).join("")}
      </div></div>

    <div class="fld"><label>${esc(t("nt_prio"))}</label>
      <div class="prios" id="ntPrio">${SLA.map(s =>
        `<div class="prio ${s.priority === "normal" ? "on" : ""}" data-p="${s.priority}"
              style="${s.priority === "normal" ? "border-color:" + s.color : ""}"
              onclick="MT.pickPrio('${s.priority}')">
           <b style="color:${s.color}">${esc(nameOf(s).split("—")[0].trim())}</b>
           <small>${num(s.resolve_hours)} ${esc(t("hours"))}</small></div>`).join("")}
      </div></div>

    <div class="fld"><label>${esc(t("nt_title"))}</label>
      <input id="ntTitle" maxlength="120" placeholder="${esc(t("nt_title_ph"))}"></div>

    <div class="fld"><label>${esc(t("nt_desc"))}</label>
      <textarea id="ntDesc" rows="3" placeholder="${esc(t("nt_desc_ph"))}"></textarea></div>

    ${isStaff() ? `<div class="fld"><label>${esc(t("f_branch"))}</label>
      <select id="ntBranch" onchange="MT.assetList()">${BRANCHES.map(b =>
        `<option value="${b.id}" ${b.id === ME.branch_id ? "selected" : ""}>${esc(nameOf(b))}</option>`).join("")}
      </select></div>` : ""}

    <div class="fld"><label>${esc(t("nt_asset"))}</label>
      <select id="ntAsset" onchange="MT.pickAsset(this.value)">
        <option value="">${esc(t("nt_asset_none"))}</option>
        ${myAssets.map(a => `<option value="${a.id}" data-b="${a.branch_id}">${esc(a.code)} — ${esc(nameOf(a))}${a.location_note ? " · " + esc(a.location_note) : ""}</option>`).join("")}
      </select>
      <div id="ntAssetHint" class="note w hide" style="margin-top:8px;margin-bottom:0"></div></div>

    <div class="fld"><label>${esc(t("nt_photos"))}</label>
      <div class="shots" id="ntShots"></div>
      <div style="font-size:11px;color:var(--ink-3);margin-top:6px">${esc(t("nt_photos_hint"))}</div>
      <input type="file" id="ntFile" accept="image/*" capture="environment" class="hide"
             onchange="MT.addPhoto(this)"></div>`;

  sheet(t("new_ticket"), body,
    `<button class="btn g" onclick="MT.closeSheet()">${esc(t("cancel"))}</button>
     <button class="btn p" id="ntGo" onclick="MT.submitTicket()">${esc(t("nt_submit"))}</button>`);
  drawShots();
}
function pickCat(c){
  NT.cat = c;
  $$("#ntCats .cat").forEach(el => el.classList.toggle("on", el.dataset.c === c));
}
function pickPrio(p){
  NT.priority = p;
  $$("#ntPrio .prio").forEach(el => {
    const on = el.dataset.p === p;
    el.classList.toggle("on", on);
    const s = SLA.find(x => x.priority === el.dataset.p);
    el.style.borderColor = on ? (s && s.color) : "";
  });
}
function assetList(){
  const bid = $("#ntBranch") ? $("#ntBranch").value : ME.branch_id;
  const sel = $("#ntAsset");
  const list = ASSETS.filter(a => a.branch_id === bid);
  sel.innerHTML = `<option value="">${esc(t("nt_asset_none"))}</option>` +
    list.map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(nameOf(a))}</option>`).join("");
  pickAsset("");
}
function pickAsset(id){
  NT.asset = id;
  const hint = $("#ntAssetHint"); if(!hint) return;
  if(!id){ hint.classList.add("hide"); return; }
  const rep = (DASH && DASH.repeat || []).find(r => r.asset_id === id);
  if(rep){
    hint.innerHTML = `<b>${esc(t("asset_hist").replace("{n}", num(rep.failures_90d)))}</b> · ${money(rep.cost_90d)}`;
    hint.classList.remove("hide");
  } else hint.classList.add("hide");
}
function drawShots(){
  const box = $("#ntShots"); if(!box) return;
  box.innerHTML = NT.thumbs.map((src, i) =>
    `<div class="shot"><img src="${src}" alt="">
       <div class="x" onclick="event.stopPropagation();MT.rmPhoto(${i})">×</div></div>`).join("") +
    (NT.thumbs.length < 6
      ? `<div class="shot" onclick="document.getElementById('ntFile').click()"><i class="ti ti-camera-plus"></i></div>` : "");
}
async function addPhoto(input){
  const f = input.files && input.files[0]; input.value = "";
  if(!f) return;
  const br = BRANCHES.find(b => b.id === ($("#ntBranch") ? $("#ntBranch").value : ME.branch_id));
  const stamp = [
    (br ? nameOf(br) : "") + " · " + t("app_title"),
    new Intl.DateTimeFormat("en-GB", { timeZone:C.TZ, dateStyle:"short", timeStyle:"short", hour12:false }).format(new Date()),
    ME.full_name || ME.email
  ];
  let blob;
  try{ blob = await processPhoto(f, stamp); }
  catch(e){ return toast(e.message || t("err_generic"), true); }

  const path = `maint/${(br && br.code) || "x"}/${NT.folder}/${Date.now()}_${NT.photos.length}.jpg`;
  NT.photos.push(path); NT.thumbs.push(URL.createObjectURL(blob));
  drawShots();
  try{
    if(!navigator.onLine) throw new Error("offline");
    await uploadPhoto(path, blob);
  }catch(_){
    await idbPut({ key:path, path, blob });
    toast(t("offline_photo"));
  }
}
function rmPhoto(i){ NT.photos.splice(i, 1); NT.thumbs.splice(i, 1); drawShots(); }

async function submitTicket(){
  const err = $("#ntErr"), btn = $("#ntGo");
  const title = $("#ntTitle").value.trim();
  const desc  = $("#ntDesc").value.trim();
  const bid   = $("#ntBranch") ? $("#ntBranch").value : ME.branch_id;

  const fail = m => { err.textContent = m; err.classList.remove("hide");
                      err.scrollIntoView({ behavior:"smooth", block:"center" }); };
  err.classList.add("hide");
  if(!NT.cat)          return fail(t("e_cat"));
  if(!title)           return fail(t("e_title"));
  if(title.length < 5) return fail(t("e_title_short"));
  if(!bid)             return fail(t("no_profile"));

  btn.disabled = true; btn.textContent = t("nt_sending");
  try{
    await q(() => sb.from("maint_tickets").insert({
      branch_id: bid, category: NT.cat, priority: NT.priority,
      asset_id: NT.asset || null, title, description: desc || null,
      photos: NT.photos
    }));
    closeSheet();
    toast(t("ok_created"));
    await refreshAll();
  }catch(e){
    btn.disabled = false; btn.textContent = t("nt_submit");
    fail(cleanErr(e));
  }
}
const cleanErr = e => String((e && e.message) || e).replace(/^.*NOT_ALLOWED:\s*/, "") || t("err_generic");

/* ── تفاصيل التذكرة ── */
async function openTicket(id){
  const x = TICKETS.find(r => r.id === id);
  if(!x) return;
  CUR = x;
  sheet(x.ticket_no || t("app_title"), `<div class="empty">${esc(t("loading"))}</div>`, "");

  let events = [];
  try{ events = await q(() => sb.from("maint_events").select("*")
        .eq("ticket_id", id).order("at", { ascending:true })); }catch(_){}

  const sl  = SLA.find(s => s.priority === x.priority) || {};
  const cat = CATS.find(c => c.code === x.category);
  const line = (l, v) => v == null || v === "" || v === "—" ? "" :
    `<div class="rowline"><span style="color:var(--ink-3);font-size:11.5px;min-width:96px">${esc(l)}</span>
       <span class="grow" style="font-weight:600;font-size:12.5px">${v}</span></div>`;

  let b = "";
  if(x.escalation >= 2)
    b += `<div class="note d"><b>${esc(x.escalate_to === "admin" ? t("esc_admin") : t("esc_area"))}</b> · ${esc(t("overdue_by"))} ${dur(x.mins_to_due)}</div>`;
  else if(x.escalation === 1)
    b += `<div class="note w"><b>${esc(t("near_due"))}</b> · ${esc(t("due_in"))} ${dur(x.mins_to_due)}</div>`;

  b += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    <span class="pill ${statusPill(x.status)}">${esc(t("s_" + x.status))}</span>
    <span class="pill" style="background:${sl.color}22;color:${sl.color}">${esc(nameOf(sl))}</span>
    <span class="pill n"><i class="ti ${cat ? cat.icon : "ti-dots"}"></i> ${esc(cat ? catName(cat) : x.category)}</span>
    ${x.source !== "manual" ? `<span class="pill p">${esc(x.source === "preventive" ? t("in_pm") : "QR")}</span>` : ""}
  </div>
  <h3 style="font-size:16px;line-height:1.5;margin-bottom:8px">${esc(x.title)}</h3>
  ${x.description ? `<div style="font-size:13px;line-height:1.85;color:var(--ink-2);margin-bottom:12px;white-space:pre-wrap">${esc(x.description)}</div>` : ""}`;

  b += `<div style="margin-bottom:12px">
    ${line(t("branch"),      esc(x.branch_name))}
    ${line(t("det_asset"),   x.asset_code ? esc(x.asset_code) + " — " + esc(x.asset_name) : "")}
    ${line(t("det_reported"),esc(x.reporter_name || "") + " · " + dt(x.created_at))}
    ${line(t("det_due"),     dt(x.resolve_due) + (x.met_sla != null ?
        ` <span class="pill ${x.met_sla ? "g" : "r"}">${x.met_sla ? "✓" : "✕"}</span>` : ""))}
    ${line(t("det_vendor"),  x.assignee_name ? esc(x.assignee_name) : "")}
    ${line(t("det_cost"),    +x.cost_total ? `<span class="mono">${money(x.cost_total)}</span>
        <small style="color:var(--ink-3)"> (${esc(t("m_parts"))} ${money(x.cost_parts)} · ${esc(t("m_labour"))} ${money(x.cost_labour)})</small>` : "")}
    ${line(t("det_invoice"), x.invoice_no ? `<span class="mono">${esc(x.invoice_no)}</span>` : "")}
    ${line(t("det_downtime"),x.downtime_min ? dur(x.downtime_min) : "")}
    ${line(t("det_resolution"), x.resolution ? esc(x.resolution) : "")}
    ${line(t("det_rating"),  x.rating ? "★".repeat(x.rating) + "☆".repeat(5 - x.rating) : "")}
    ${x.hold_reason && x.status === "on_hold" ? line(t("m_hold"), esc(x.hold_reason)) : ""}
  </div>`;

  /* الصور */
  const paths = Array.isArray(x.photos) ? x.photos : [];
  if(paths.length){
    b += `<div class="card-h" style="padding:0 0 8px;border:0"><i class="ti ti-photo"></i> ${esc(t("det_photos"))}
            <span class="sp">${num(paths.length)}</span></div>
          <div class="shots" id="dPhotos">${paths.map((_, i) =>
            `<div class="shot" id="dp${i}"><i class="ti ti-photo"></i></div>`).join("")}</div>`;
  }

  /* السجل */
  b += `<div class="card-h" style="padding:14px 0 8px;border:0"><i class="ti ti-history"></i> ${esc(t("det_timeline"))}</div>
    <div class="tl">${events.map(evRow).join("") || `<div class="empty">${esc(t("nothing"))}</div>`}</div>
    <div style="display:flex;gap:7px;margin-top:10px">
      <input id="cmt" class="grow" style="padding:10px;border:1px solid var(--rule);border-radius:9px;font-size:12.5px"
             placeholder="${esc(t("det_comment_ph"))}">
      <button class="btn g" onclick="MT.comment('${x.id}')">${esc(t("det_send"))}</button>
    </div>`;

  sheet(x.ticket_no || "", b, actionsFor(x));

  /* روابط الصور الموقّعة بعد الرسم — لا تُبطئ فتح الورقة */
  paths.forEach(async (p, i) => {
    const u = await signedUrl(p, 3600);
    const box = $("#dp" + i); if(!box) return;
    if(u) box.innerHTML = `<img src="${u}" alt="" onclick="window.open('${u}','_blank')">`;
  });
}
function evRow(e){
  const who = e.kind;
  const label = { created:t("ev_created"), status:t("ev_status"), assign:t("ev_assign"),
                  comment:t("ev_comment"), cost:t("ev_cost"), photo:t("ev_photo"),
                  escalate:t("esc_admin") }[who] || who;
  let txt = label;
  if(who === "status") txt = `${label}: ${e.from_val ? t("s_" + e.from_val) + " ← " : ""}${e.to_val ? t("s_" + e.to_val) : ""}`;
  if(who === "comment") txt = e.note || label;
  if(who === "cost")   txt = `${label}: ${money(e.to_val)}`;
  return `<div class="tl-i"><div class="w">${esc(txt)}</div>
    <div class="m">${dt(e.at)}${e.note && who !== "comment" ? " · " + esc(e.note) : ""}</div></div>`;
}
function actionsFor(x){
  const B = [];
  if(isStaff()){
    if(["new","assigned","on_hold"].includes(x.status))
      B.push(`<button class="btn g" onclick="MT.mAssign('${x.id}')"><i class="ti ti-user-plus"></i> ${esc(t("a_assign"))}</button>`);
    if(["new","assigned","on_hold"].includes(x.status))
      B.push(`<button class="btn p" onclick="MT.setStatus('${x.id}','in_progress')">${esc(t("a_start"))}</button>`);
    if(["assigned","in_progress"].includes(x.status))
      B.push(`<button class="btn warn" onclick="MT.mHold('${x.id}')">${esc(t("a_hold"))}</button>`);
    if(["new","assigned","in_progress","on_hold"].includes(x.status))
      B.push(`<button class="btn ok" onclick="MT.mResolve('${x.id}')"><i class="ti ti-check"></i> ${esc(t("a_resolve"))}</button>`);
    if(x.status === "resolved")
      B.push(`<button class="btn ok" onclick="MT.mClose('${x.id}')">${esc(t("a_close"))}</button>`);
    if(x.status === "closed")
      B.push(`<button class="btn g" onclick="MT.setStatus('${x.id}','in_progress')">${esc(t("a_reopen"))}</button>`);
  }else{
    if(x.status === "resolved")
      B.push(`<button class="btn ok" onclick="MT.mClose('${x.id}')"><i class="ti ti-check"></i> ${esc(t("a_close"))}</button>`);
    if(x.status === "new")
      B.push(`<button class="btn g" onclick="MT.cancelTicket('${x.id}')">${esc(t("a_cancel"))}</button>`);
  }
  if(!B.length) B.push(`<button class="btn g" onclick="MT.closeSheet()">${esc(t("close"))}</button>`);
  return B.join("");
}

/* ── أفعال ── */
async function patch(id, obj, msg){
  try{
    await q(() => sb.from("maint_tickets").update(obj).eq("id", id));
    closeSheet(); toast(msg || t("ok_saved"));
    await refreshAll();
  }catch(e){ toast(cleanErr(e), true); }
}
const setStatus = (id, s) => patch(id, { status:s });

async function comment(id){
  const box = $("#cmt"); const note = box.value.trim();
  if(!note) return;
  box.value = "";
  try{
    await q(() => sb.rpc("fn_maint_comment", { p_ticket:id, p_note:note }));
    await openTicket(id);
  }catch(e){ toast(cleanErr(e), true); }
}

function mAssign(id){
  const opts = [
    ...VENDORS.map(v => `<option value="v:${v.id}">${esc(nameOf(v))} — ${esc(t(v.kind === "internal" ? "m_int" : "m_ext"))}</option>`),
    ...STAFF.map(p => `<option value="p:${p.id}">${esc(p.full_name)}</option>`)
  ].join("");
  sheet(t("m_assign"),
    `<div class="fld"><label>${esc(t("m_vendor"))}</label>
       <select id="asgn"><option value="">—</option>${opts}</select></div>`,
    `<button class="btn g" onclick="MT.open('${id}')">${esc(t("cancel"))}</button>
     <button class="btn p" onclick="MT.doAssign('${id}')">${esc(t("save"))}</button>`);
}
function doAssign(id){
  const v = $("#asgn").value;
  const o = { status:"assigned", vendor_id:null, assignee_id:null };
  if(v.startsWith("v:")) o.vendor_id = v.slice(2);
  if(v.startsWith("p:")) o.assignee_id = v.slice(2);
  patch(id, o);
}
function mHold(id){
  sheet(t("m_hold"),
    `<div class="fld"><textarea id="hld" rows="3" placeholder="${esc(t("m_hold_ph"))}"></textarea></div>`,
    `<button class="btn g" onclick="MT.open('${id}')">${esc(t("cancel"))}</button>
     <button class="btn warn" onclick="MT.doHold('${id}')">${esc(t("save"))}</button>`);
}
const doHold = id => patch(id, { status:"on_hold", hold_reason: $("#hld").value.trim() || null });

function mResolve(id){
  sheet(t("m_res"),
    `<div class="fld"><label>${esc(t("m_res_what"))}</label>
       <textarea id="rsx" rows="3" placeholder="${esc(t("m_res_ph"))}"></textarea></div>
     <div style="display:flex;gap:9px">
       <div class="fld grow"><label>${esc(t("m_parts"))}</label>
         <input id="rcp" type="number" inputmode="decimal" step="0.001" min="0" value="0" dir="ltr"></div>
       <div class="fld grow"><label>${esc(t("m_labour"))}</label>
         <input id="rcl" type="number" inputmode="decimal" step="0.001" min="0" value="0" dir="ltr"></div>
     </div>
     <div style="display:flex;gap:9px">
       <div class="fld grow"><label>${esc(t("m_inv"))}</label><input id="rin" dir="ltr"></div>
       <div class="fld grow"><label>${esc(t("m_down"))}</label>
         <input id="rdn" type="number" inputmode="numeric" min="0" dir="ltr"></div>
     </div>`,
    `<button class="btn g" onclick="MT.open('${id}')">${esc(t("cancel"))}</button>
     <button class="btn ok" onclick="MT.doResolve('${id}')">${esc(t("save"))}</button>`);
}
function doResolve(id){
  patch(id, {
    status:"resolved",
    resolution: $("#rsx").value.trim() || null,
    cost_parts:  +$("#rcp").value || 0,
    cost_labour: +$("#rcl").value || 0,
    invoice_no:  $("#rin").value.trim() || null,
    downtime_min: $("#rdn").value ? +$("#rdn").value : null
  });
}
function mClose(id){
  sheet(t("m_close"),
    `<div class="fld"><label>${esc(t("m_rate"))}</label>
       <div style="display:flex;gap:7px;justify-content:center;font-size:34px" id="stars">
         ${[1,2,3,4,5].map(i => `<span data-s="${i}" onclick="MT.star(${i})"
             style="cursor:pointer;color:var(--rule-2)">★</span>`).join("")}
       </div></div>`,
    `<button class="btn g" onclick="MT.open('${id}')">${esc(t("cancel"))}</button>
     <button class="btn ok" onclick="MT.doClose('${id}')">${esc(t("a_close"))}</button>`);
  mClose.val = 0;
}
function star(n){
  mClose.val = n;
  $$("#stars span").forEach(s => s.style.color = +s.dataset.s <= n ? "#f59e0b" : "var(--rule-2)");
}
const doClose = id => patch(id, mClose.val ? { status:"closed", rating:mClose.val } : { status:"closed" });

function cancelTicket(id){
  if(!confirm(t("confirm_cancel"))) return;
  patch(id, { status:"cancelled" });
}

/* ═══════════ الأجهزة ═══════════ */
function renderAssets(){
  const el = $("#v-assets");
  const mine = ASSETS.filter(a => isStaff() ? true : a.branch_id === ME.branch_id);
  const rep = (DASH && DASH.repeat) || [];

  let h = "";
  if(isStaff())
    h += `<div class="bar">
      <button class="btn p" onclick="MT.assetForm()"><i class="ti ti-plus"></i> ${esc(t("as_new"))}</button>
      <button class="btn g" onclick="MT.qrSheet()"><i class="ti ti-qrcode"></i> ${esc(t("as_qr"))}</button>
    </div>`;

  const byBr = {};
  mine.forEach(a => { (byBr[a.branch_id] = byBr[a.branch_id] || []).push(a); });

  if(!mine.length) h += `<div class="card"><div class="empty">${esc(t("as_none"))}</div></div>`;

  Object.keys(byBr).forEach(bid => {
    const br = BRANCHES.find(b => b.id === bid);
    h += `<div class="card"><div class="card-h"><i class="ti ti-building-store"></i>
        ${esc(br ? nameOf(br) : "—")}<span class="sp">${num(byBr[bid].length)}</span></div>
      <div class="card-b">` + byBr[bid].map(a => {
        const c = CATS.find(x => x.code === a.category);
        const r = rep.find(x => x.asset_id === a.id);
        const warr = a.warranty_until && new Date(a.warranty_until) > new Date();
        return `<div class="tk" onclick="MT.assetSheet('${a.id}')">
          <div class="tk-top">
            <span class="mono tk-no">${esc(a.code)}</span>
            ${r ? `<span class="pill r">${num(r.failures_90d)} ${esc(t("in_faults"))}</span>` : ""}
            ${a.status === "needs_replacement" ? `<span class="pill a">${esc(t("as_replace"))}</span>` : ""}
            ${warr ? `<span class="pill g">${esc(t("as_warranty_on"))}</span>` : ""}
          </div>
          <div class="tk-title">${esc(nameOf(a))}</div>
          <div class="tk-meta">
            <span><i class="ti ${c ? c.icon : "ti-dots"}"></i> ${esc(c ? catName(c) : a.category)}</span>
            ${a.location_note ? `<span><i class="ti ti-map-pin"></i> ${esc(a.location_note)}</span>` : ""}
            ${a.make ? `<span>${esc(a.make)} ${esc(a.model || "")}</span>` : ""}
          </div></div>`;
      }).join("") + `</div></div>`;
  });
  el.innerHTML = h;
}

async function assetSheet(id){
  const a = ASSETS.find(x => x.id === id); if(!a) return;
  const c = CATS.find(x => x.code === a.category);
  const br = BRANCHES.find(b => b.id === a.branch_id);
  const hist = TICKETS.filter(x => x.asset_id === id);
  const spent = hist.reduce((s, x) => s + (+x.cost_total || 0), 0);
  const line = (l, v) => !v ? "" : `<div class="rowline">
    <span style="color:var(--ink-3);font-size:11.5px;min-width:96px">${esc(l)}</span>
    <span class="grow" style="font-weight:600;font-size:12.5px">${v}</span></div>`;

  let b = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><div class="l">${esc(t("as_faults"))}</div><div class="v">${num(hist.length)}</div></div>
      <div class="kpi" style="--c:#475569"><div class="l">${esc(t("as_spent"))}</div>
        <div class="v" style="font-size:16px">${money(spent)}</div></div>
      <div class="kpi" style="--c:#2563eb"><div class="l">${esc(t("as_cost"))}</div>
        <div class="v" style="font-size:16px">${a.purchase_cost ? money(a.purchase_cost) : "—"}</div></div>
    </div>
    ${line(t("as_cat"), esc(c ? catName(c) : a.category))}
    ${line(t("as_branch"), esc(br ? nameOf(br) : ""))}
    ${line(t("as_loc"), esc(a.location_note || ""))}
    ${line(t("as_make"), esc([a.make, a.model].filter(Boolean).join(" ")))}
    ${line(t("as_serial"), a.serial_no ? `<span class="mono">${esc(a.serial_no)}</span>` : "")}
    ${line(t("as_install"), a.install_date ? dateOnly(a.install_date) : "")}
    ${line(t("as_warranty"), a.warranty_until ?
        dateOnly(a.warranty_until) + ` <span class="pill ${new Date(a.warranty_until) > new Date() ? "g" : "n"}">${
          esc(new Date(a.warranty_until) > new Date() ? t("as_warranty_on") : t("as_warranty_off"))}</span>` : "")}
    <div class="card-h" style="padding:14px 0 8px;border:0"><i class="ti ti-history"></i> ${esc(t("as_faults"))}</div>`;

  b += hist.length ? hist.map(ticketCard).join("") : `<div class="empty">${esc(t("nothing"))}</div>`;

  sheet(a.code + " — " + nameOf(a), b,
    (isStaff() ? `<button class="btn g" onclick="MT.assetForm('${a.id}')">${esc(t("edit"))}</button>` : "") +
    `<button class="btn p" onclick="MT.newFromAsset('${a.id}')">${esc(t("report_fault"))}</button>`);
}
function newFromAsset(id){
  const a = ASSETS.find(x => x.id === id);
  newTicket();
  if(a){
    if($("#ntBranch")){ $("#ntBranch").value = a.branch_id; assetList(); }
    pickCat(a.category);
    $("#ntAsset").value = a.id; pickAsset(a.id);
  }
}

function assetForm(id){
  const a = ASSETS.find(x => x.id === id) || {};
  const fl = (lbl, key, type, extra) => `<div class="fld"><label>${esc(lbl)}</label>
    <input id="af_${key}" type="${type || "text"}" ${extra || ""} value="${esc(a[key] ?? "")}"></div>`;
  sheet(id ? t("edit") : t("as_new"),
    `<div id="afErr" class="err hide"></div>
     ${fl(t("as_code"), "code", "text", 'dir="ltr" placeholder="RG-FRZ-01"')}
     ${fl(t("as_name") + " (ع)", "name_ar")}
     ${fl(t("as_name") + " (EN)", "name_en", "text", 'dir="ltr"')}
     <div class="fld"><label>${esc(t("as_cat"))}</label><select id="af_category">
       ${CATS.map(c => `<option value="${c.code}" ${a.category === c.code ? "selected" : ""}>${esc(catName(c))}</option>`).join("")}
     </select></div>
     <div class="fld"><label>${esc(t("as_branch"))}</label><select id="af_branch_id">
       ${BRANCHES.map(b => `<option value="${b.id}" ${a.branch_id === b.id ? "selected" : ""}>${esc(nameOf(b))}</option>`).join("")}
     </select></div>
     <div style="display:flex;gap:9px">${fl(t("as_make"), "make")}${fl(t("as_model"), "model")}</div>
     ${fl(t("as_serial"), "serial_no", "text", 'dir="ltr"')}
     ${fl(t("as_loc"), "location_note")}
     <div style="display:flex;gap:9px">${fl(t("as_install"), "install_date", "date")}${fl(t("as_warranty"), "warranty_until", "date")}</div>
     ${fl(t("as_cost"), "purchase_cost", "number", 'step="0.001" min="0" dir="ltr"')}
     <div class="fld"><label>${esc(t("as_status"))}</label><select id="af_status">
       ${[["active","as_active"],["needs_replacement","as_replace"],["retired","as_retired"]]
         .map(([v,k]) => `<option value="${v}" ${a.status === v ? "selected" : ""}>${esc(t(k))}</option>`).join("")}
     </select></div>`,
    `<button class="btn g" onclick="MT.closeSheet()">${esc(t("cancel"))}</button>
     <button class="btn p" onclick="MT.saveAsset('${id || ""}')">${esc(t("save"))}</button>`);
}
async function saveAsset(id){
  const g = k => { const e = $("#af_" + k); return e ? e.value.trim() : ""; };
  const row = {
    code:g("code"), name_ar:g("name_ar"), name_en:g("name_en") || null,
    category:g("category"), branch_id:g("branch_id"),
    make:g("make") || null, model:g("model") || null, serial_no:g("serial_no") || null,
    location_note:g("location_note") || null,
    install_date:g("install_date") || null, warranty_until:g("warranty_until") || null,
    purchase_cost:g("purchase_cost") ? +g("purchase_cost") : null,
    status:g("status")
  };
  const err = $("#afErr");
  if(!row.code || !row.name_ar){
    err.textContent = t("e_title"); err.classList.remove("hide"); return;
  }
  try{
    if(id) await q(() => sb.from("maint_assets").update(row).eq("id", id));
    else   await q(() => sb.from("maint_assets").insert(row));
    closeSheet(); toast(t("ok_saved"));
    await loadRefs(); render();
  }catch(e){ err.textContent = cleanErr(e); err.classList.remove("hide"); }
}

/* ملصقات QR — صفحة طباعة مستقلة، كل ملصق يفتح بلاغاً لهذا الجهاز */
function qrSheet(){
  const mine = ASSETS.filter(a => a.status !== "retired");
  sheet(t("as_qr"),
    `<div class="note">${esc(t("nt_photos_hint"))}</div>
     <div class="fld"><label>${esc(t("f_branch"))}</label>
       <select id="qrB"><option value="">${esc(t("f_all"))}</option>
         ${BRANCHES.map(b => `<option value="${b.id}">${esc(nameOf(b))}</option>`).join("")}</select></div>
     <div style="font-size:12px;color:var(--ink-3)">${num(mine.length)} ${esc(t("t_assets"))}</div>`,
    `<button class="btn g" onclick="MT.closeSheet()">${esc(t("cancel"))}</button>
     <button class="btn p" onclick="MT.printQR()"><i class="ti ti-printer"></i> ${esc(t("as_qr"))}</button>`);
}
function printQR(){
  const bid = $("#qrB").value;
  const list = ASSETS.filter(a => a.status !== "retired" && (!bid || a.branch_id === bid));
  if(!list.length) return toast(t("as_none"), true);
  const base = location.href.split("?")[0].replace(/maint\.html.*$/, "maint.html");
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
    <title>QR</title>
    <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"><\/script>
    <style>
      @page{size:A4;margin:8mm}
      body{font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;margin:0}
      .g{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}
      .l{border:1.2px dashed #94a3b8;border-radius:4mm;padding:4mm;text-align:center;
         break-inside:avoid;page-break-inside:avoid}
      .l .q img{width:33mm;height:33mm}
      .l .c{font-family:ui-monospace,monospace;font-weight:700;font-size:11pt;margin-top:2mm}
      .l .n{font-size:9.5pt;margin-top:1mm;line-height:1.4}
      .l .b{font-size:8pt;color:#64748b;margin-top:1mm}
      .l .h{font-size:7.5pt;color:#0B5F4E;font-weight:700;margin-bottom:2mm}
    </style></head><body><div class="g">` +
    list.map(a => {
      const br = BRANCHES.find(b => b.id === a.branch_id);
      const url = base + "?asset=" + encodeURIComponent(a.code);
      return `<div class="l"><div class="h">سفن ايكونز · صيانة</div>
        <div class="q" data-u="${encodeURIComponent(url)}"></div>
        <div class="c">${esc(a.code)}</div>
        <div class="n">${esc(a.name_ar)}</div>
        <div class="b">${esc(br ? br.name_ar : "")}${a.location_note ? " · " + esc(a.location_note) : ""}</div>
      </div>`;
    }).join("") +
    `</div><script>
      document.querySelectorAll('.q').forEach(function(d){
        var q=qrcode(0,'M'); q.addData(decodeURIComponent(d.dataset.u)); q.make();
        d.innerHTML=q.createImgTag(6,0);
      });
      setTimeout(function(){ window.print(); },500);
    <\/script></body></html>`);
  w.document.close();
}

/* ═══════════ التحليلات ═══════════ */
function renderIntel(){
  const el = $("#v-intel");
  const D = DASH || {};
  let h = "";

  /* الأجهزة المتكررة — أهم شاشة في النظام كله */
  const rep = D.repeat || [];
  h += `<div class="card"><div class="card-h"><i class="ti ti-alert-octagon" style="color:#dc2626"></i>
      ${esc(t("in_repeat"))}<span class="sp">${esc(t("in_repeat_sub"))}</span></div><div class="card-b">`;
  h += rep.length ? rep.map(r => {
    const verdict = { replace_cost:["r", t("v_replace_cost")], replace_freq:["r", t("v_replace_freq")],
                      watch:["a", t("v_watch")] }[r.verdict] || ["n", ""];
    return `<div class="tk" onclick="MT.assetSheet('${r.asset_id}')">
      <div class="tk-top"><span class="mono tk-no">${esc(r.asset_code)}</span>
        <span class="pill ${verdict[0]}">${esc(verdict[1])}</span></div>
      <div class="tk-title">${esc(r.asset_name)}</div>
      <div class="tk-meta">
        <span><i class="ti ti-building-store"></i> ${esc(r.branch_name)}</span>
        <span><i class="ti ti-alert-triangle"></i> ${num(r.failures_90d)} ${esc(t("in_faults"))}</span>
        <span><i class="ti ti-coin"></i> ${money(r.cost_90d)}${r.purchase_cost ?
          ` / ${money(r.purchase_cost)}` : ""}</span>
        ${r.days_between_failures ? `<span><i class="ti ti-repeat"></i> ${esc(t("in_gap"))} ${num(r.days_between_failures)} ${esc(t("in_days"))}</span>` : ""}
      </div>
      ${r.purchase_cost ? `<div class="sla"><i style="width:${Math.min(100, Math.round(r.cost_90d / r.purchase_cost * 100))}%;background:#dc2626"></i></div>` : ""}
    </div>`;
  }).join("") : `<div class="empty"><i class="ti ti-mood-check" style="font-size:28px;color:#16a34a;display:block;margin-bottom:6px"></i>${esc(t("in_none"))}</div>`;
  h += `</div></div>`;

  /* التكلفة بالفئة */
  const cc = D.by_cat || [];
  const maxc = Math.max(1, ...cc.map(x => +x.cost_total || 0));
  h += `<div class="card"><div class="card-h"><i class="ti ti-chart-bar"></i> ${esc(t("in_cat"))}</div>
    <div class="card-b"><div class="bars">` +
    (cc.length ? cc.map(c => `<div class="barrow">
      <span class="nm"><i class="ti ${esc(c.icon || "ti-dots")}"></i> ${esc(LANG === "ar" ? c.name_ar : c.name_en)}</span>
      <span class="tr"><i style="width:${Math.round((+c.cost_total || 0) / maxc * 100)}%"></i></span>
      <span class="vl mono">${money(c.cost_total)}</span></div>`).join("")
    : `<div class="empty">${esc(t("nothing"))}</div>`) + `</div></div></div>`;

  /* المنفّذون */
  const vv = D.vendors || [];
  h += `<div class="card"><div class="card-h"><i class="ti ti-tools"></i> ${esc(t("in_vendors"))}</div>
    <div style="overflow-x:auto"><table><thead><tr>
      <th>${esc(t("se_name"))}</th><th>${esc(t("in_jobs"))}</th><th>${esc(t("in_hours"))}</th>
      <th>${esc(t("k_sla"))}</th><th>${esc(t("in_rate"))}</th><th>${esc(t("in_billed"))}</th>
    </tr></thead><tbody>` +
    (vv.length ? vv.map(v => `<tr>
      <td><b>${esc(v.name_ar)}</b><div style="font-size:10px;color:var(--ink-3)">${esc(t(v.kind === "internal" ? "m_int" : "m_ext"))}</div></td>
      <td>${num(v.done)}/${num(v.jobs)}</td>
      <td>${v.avg_hours == null ? "—" : num(v.avg_hours)}</td>
      <td>${v.sla_pct == null ? "—" : `<span class="pill ${v.sla_pct >= 80 ? "g" : v.sla_pct >= 60 ? "a" : "r"}">${num(v.sla_pct)}${t("pct")}</span>`}</td>
      <td>${v.avg_rating == null ? "—" : "★ " + num(v.avg_rating)}</td>
      <td class="mono">${money(v.billed_total)}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty">${esc(t("nothing"))}</td></tr>`) +
    `</tbody></table></div></div>`;

  /* الوقائية */
  h += `<div class="card"><div class="card-h"><i class="ti ti-calendar-repeat"></i> ${esc(t("in_pm"))}
      <span class="sp">${num((D.pm_due) || 0)} ${esc(t("pm_due"))}</span></div>
    <div class="card-b"><div id="pmBox" class="empty">${esc(t("loading"))}</div>
      ${isAdmin() ? `<button class="btn p" style="width:100%;justify-content:center;margin-top:9px"
        onclick="MT.genPM()"><i class="ti ti-wand"></i> ${esc(t("pm_gen"))}</button>` : ""}
    </div></div>`;

  el.innerHTML = h;
  loadPM();
}
async function loadPM(){
  const box = $("#pmBox"); if(!box) return;
  try{
    const rows = await q(() => sb.from("maint_pm_plans").select("*").eq("active", true)
                    .order("next_due_on"));
    if(!rows.length){ box.className = "empty"; box.textContent = t("pm_none"); return; }
    box.className = "";
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = rows.map(p => {
      const due = p.next_due_on <= today;
      const a = ASSETS.find(x => x.id === p.asset_id);
      const c = CATS.find(x => x.code === p.category);
      return `<div class="rowline">
        <i class="ti ti-calendar-repeat" style="color:${due ? "#d97706" : "var(--ink-3)"}"></i>
        <div class="grow"><div style="font-weight:600;font-size:12.5px">${esc(LANG === "ar" ? p.title_ar : (p.title_en || p.title_ar))}</div>
          <div style="font-size:10.5px;color:var(--ink-3)">
            ${a ? esc(a.code + " — " + nameOf(a)) : c ? esc(catName(c)) : ""} ·
            ${esc(t("pm_every"))} ${num(p.every_days)} ${esc(t("in_days"))}</div></div>
        <span class="pill ${due ? "a" : "n"}">${dateOnly(p.next_due_on)}</span>
        ${isAdmin() ? `<button class="btn g" style="padding:5px 9px" onclick="MT.pmForm('${p.id}')">${esc(t("edit"))}</button>` : ""}
      </div>`;
    }).join("") +
    (isAdmin() ? `<button class="btn g" style="width:100%;justify-content:center;margin-top:9px"
        onclick="MT.pmForm()"><i class="ti ti-plus"></i> ${esc(t("se_pm_new"))}</button>` : "");
  }catch(e){ box.className = "empty"; box.textContent = cleanErr(e); }
}
async function genPM(){
  try{
    const r = await q(() => sb.rpc("fn_maint_generate_pm"));
    const made = Array.isArray(r) ? (r[0] && r[0].created) || 0 : (r && r.created) || 0;
    toast(made ? t("pm_made").replace("{n}", num(made)) : t("pm_made0"));
    await refreshAll();
  }catch(e){ toast(cleanErr(e), true); }
}
function pmForm(id){
  q(() => sb.from("maint_pm_plans").select("*").eq("id", id || "00000000-0000-0000-0000-000000000000"))
   .catch(() => []).then(rows => {
    const p = (rows && rows[0]) || {};
    sheet(id ? t("edit") : t("se_pm_new"),
      `<div id="pmErr" class="err hide"></div>
       <div class="fld"><label>${esc(t("se_pm_title"))} (ع)</label>
         <input id="pm_title_ar" value="${esc(p.title_ar || "")}"></div>
       <div class="fld"><label>${esc(t("se_pm_title"))} (EN)</label>
         <input id="pm_title_en" dir="ltr" value="${esc(p.title_en || "")}"></div>
       <div class="fld"><label>${esc(t("nt_asset"))}</label>
         <select id="pm_asset_id"><option value="">${esc(t("nt_asset_none"))}</option>
           ${ASSETS.map(a => `<option value="${a.id}" ${p.asset_id === a.id ? "selected" : ""}>${esc(a.code)} — ${esc(nameOf(a))}</option>`).join("")}
         </select></div>
       <div class="fld"><label>${esc(t("as_cat"))}</label>
         <select id="pm_category"><option value="">—</option>
           ${CATS.map(c => `<option value="${c.code}" ${p.category === c.code ? "selected" : ""}>${esc(catName(c))}</option>`).join("")}
         </select></div>
       <div class="fld"><label>${esc(t("f_branch"))}</label>
         <select id="pm_branch_id"><option value="">${esc(t("f_all"))}</option>
           ${BRANCHES.map(b => `<option value="${b.id}" ${p.branch_id === b.id ? "selected" : ""}>${esc(nameOf(b))}</option>`).join("")}
         </select></div>
       <div style="display:flex;gap:9px">
         <div class="fld grow"><label>${esc(t("se_pm_every"))}</label>
           <input id="pm_every_days" type="number" min="1" max="3650" dir="ltr" value="${esc(p.every_days || 90)}"></div>
         <div class="fld grow"><label>${esc(t("pm_next"))}</label>
           <input id="pm_next_due_on" type="date" value="${esc(p.next_due_on || new Date().toISOString().slice(0,10))}"></div>
       </div>
       <div class="fld"><label>${esc(t("f_priority"))}</label>
         <select id="pm_priority">${SLA.map(s => `<option value="${s.priority}" ${(p.priority || "low") === s.priority ? "selected" : ""}>${esc(nameOf(s))}</option>`).join("")}</select></div>
       <div class="fld"><label>${esc(t("nt_desc"))}</label>
         <textarea id="pm_checklist" rows="3">${esc(p.checklist || "")}</textarea></div>`,
      `<button class="btn g" onclick="MT.closeSheet()">${esc(t("cancel"))}</button>
       <button class="btn p" onclick="MT.savePM('${id || ""}')">${esc(t("save"))}</button>`);
  });
}
async function savePM(id){
  const g = k => { const e = $("#pm_" + k); return e ? e.value.trim() : ""; };
  const row = {
    title_ar:g("title_ar"), title_en:g("title_en") || null,
    asset_id:g("asset_id") || null, category:g("category") || null,
    branch_id:g("branch_id") || null,
    every_days:+g("every_days") || 90, next_due_on:g("next_due_on"),
    priority:g("priority") || "low", checklist:g("checklist") || null, active:true
  };
  const err = $("#pmErr");
  if(!row.title_ar || (!row.asset_id && !row.category)){
    err.textContent = t("e_title"); err.classList.remove("hide"); return;
  }
  try{
    if(id) await q(() => sb.from("maint_pm_plans").update(row).eq("id", id));
    else   await q(() => sb.from("maint_pm_plans").insert(row));
    closeSheet(); toast(t("ok_saved")); renderIntel();
  }catch(e){ err.textContent = cleanErr(e); err.classList.remove("hide"); }
}

/* ═══════════ الإعداد ═══════════ */
function renderSetup(){
  const el = $("#v-setup");
  let h = `<div class="card"><div class="card-h"><i class="ti ti-tools"></i> ${esc(t("se_vendors"))}
      <span class="sp">${num(VENDORS.length)}</span></div><div class="card-b">` +
    (VENDORS.length ? VENDORS.map(v => `<div class="rowline">
      <i class="ti ${v.kind === "internal" ? "ti-user-cog" : "ti-building"}" style="color:var(--brand)"></i>
      <div class="grow"><div style="font-weight:600;font-size:12.5px">${esc(nameOf(v))}</div>
        <div style="font-size:10.5px;color:var(--ink-3)">${esc(t(v.kind === "internal" ? "m_int" : "m_ext"))}
          ${v.phone ? " · " + esc(v.phone) : ""}
          ${(v.specialties || []).length ? " · " + (v.specialties || []).map(s => {
            const c = CATS.find(x => x.code === s); return esc(c ? catName(c) : s); }).join("، ") : ""}</div></div>
      <button class="btn g" style="padding:5px 9px" onclick="MT.vendorForm('${v.id}')">${esc(t("edit"))}</button>
    </div>`).join("") : `<div class="empty">${esc(t("nothing"))}</div>`) +
    `<button class="btn p" style="width:100%;justify-content:center;margin-top:9px"
       onclick="MT.vendorForm()"><i class="ti ti-plus"></i> ${esc(t("se_vendor_new"))}</button>
    </div></div>`;

  h += `<div class="card"><div class="card-h"><i class="ti ti-clock-cog"></i> ${esc(t("se_sla"))}</div>
    <div class="card-b"><div class="note">${esc(t("se_sla_note"))}</div>
    <div style="overflow-x:auto"><table><thead><tr>
      <th>${esc(t("f_priority"))}</th><th>${esc(t("se_respond"))}</th><th>${esc(t("se_resolve"))}</th><th></th>
    </tr></thead><tbody>` + SLA.map(s => `<tr>
      <td><span class="pill" style="background:${s.color}22;color:${s.color}">${esc(nameOf(s))}</span></td>
      <td><input id="sla_r_${s.priority}" type="number" step="0.5" min="0.25" dir="ltr"
            value="${s.respond_hours}" style="width:74px;padding:6px;border:1px solid var(--rule);border-radius:7px"></td>
      <td><input id="sla_s_${s.priority}" type="number" step="0.5" min="0.25" dir="ltr"
            value="${s.resolve_hours}" style="width:74px;padding:6px;border:1px solid var(--rule);border-radius:7px"></td>
      <td><button class="btn g" style="padding:5px 9px" onclick="MT.saveSLA('${s.priority}')">${esc(t("save"))}</button></td>
    </tr>`).join("") + `</tbody></table></div></div></div>`;

  el.innerHTML = h;
}
function vendorForm(id){
  const v = VENDORS.find(x => x.id === id) || {};
  const sp = v.specialties || [];
  sheet(id ? t("edit") : t("se_vendor_new"),
    `<div id="veErr" class="err hide"></div>
     <div class="fld"><label>${esc(t("se_name"))} (ع)</label><input id="ve_name_ar" value="${esc(v.name_ar || "")}"></div>
     <div class="fld"><label>${esc(t("se_name"))} (EN)</label><input id="ve_name_en" dir="ltr" value="${esc(v.name_en || "")}"></div>
     <div class="fld"><label>${esc(t("se_kind"))}</label><select id="ve_kind">
       <option value="external" ${v.kind === "external" ? "selected" : ""}>${esc(t("m_ext"))}</option>
       <option value="internal" ${v.kind === "internal" ? "selected" : ""}>${esc(t("m_int"))}</option></select></div>
     <div class="fld"><label>${esc(t("se_phone"))}</label><input id="ve_phone" dir="ltr" inputmode="tel" value="${esc(v.phone || "")}"></div>
     <div class="fld"><label>${esc(t("se_spec"))}</label>
       <div class="cats">${CATS.map(c => `<div class="cat ${sp.includes(c.code) ? "on" : ""}"
         data-c="${c.code}" onclick="this.classList.toggle('on')">
         <i class="ti ${esc(c.icon || "ti-dots")}"></i><span>${esc(catName(c))}</span></div>`).join("")}</div></div>`,
    `<button class="btn g" onclick="MT.closeSheet()">${esc(t("cancel"))}</button>
     <button class="btn p" onclick="MT.saveVendor('${id || ""}')">${esc(t("save"))}</button>`);
}
async function saveVendor(id){
  const g = k => { const e = $("#ve_" + k); return e ? e.value.trim() : ""; };
  const spec = $$(".sheet .cat.on").map(el => el.dataset.c);
  const row = { name_ar:g("name_ar"), name_en:g("name_en") || null, kind:g("kind"),
                phone:g("phone") || null, specialties:spec, active:true };
  const err = $("#veErr");
  if(!row.name_ar){ err.textContent = t("e_title"); err.classList.remove("hide"); return; }
  try{
    if(id) await q(() => sb.from("maint_vendors").update(row).eq("id", id));
    else   await q(() => sb.from("maint_vendors").insert(row));
    closeSheet(); toast(t("ok_saved"));
    await loadRefs(); render();
  }catch(e){ err.textContent = cleanErr(e); err.classList.remove("hide"); }
}
async function saveSLA(p){
  const r = +$("#sla_r_" + p).value, s = +$("#sla_s_" + p).value;
  if(!(r > 0) || !(s > 0) || s < r) return toast(t("err_generic"), true);
  try{
    await q(() => sb.from("maint_sla").update({ respond_hours:r, resolve_hours:s }).eq("priority", p));
    toast(t("ok_saved"));
    await loadRefs();
  }catch(e){ toast(cleanErr(e), true); }
}

/* ═══════════ الطابور والقالب ═══════════ */
async function flushPhotoQueue(){
  if(!navigator.onLine) return;
  try{
    const all = await idbAll();
    for(const rec of all){
      try{ await uploadPhoto(rec.path, rec.blob); await idbDel(rec.key); }catch(_){ }
    }
  }catch(_){ }
}
window.addEventListener("online", flushPhotoQueue);

/* فتح بلاغ من مسح QR: maint.html?asset=RG-FRZ-01 */
async function handleQRParam(){
  const code = new URLSearchParams(location.search).get("asset");
  if(!code) return;
  history.replaceState(null, "", location.pathname);
  const a = ASSETS.find(x => x.code.toLowerCase() === code.toLowerCase());
  if(!a) return toast(t("as_none"), true);
  go("assets"); assetSheet(a.id);
}

/* ═══════════ الإقلاع ═══════════ */
const MT = { go, open:openTicket, newTicket, pickCat, pickPrio, pickAsset, assetList,
  addPhoto, rmPhoto, submitTicket, closeSheet, setF, byBranch,
  setStatus, comment, mAssign, doAssign, mHold, doHold, mResolve, doResolve,
  mClose, star, doClose, cancelTicket,
  assetSheet, assetForm, saveAsset, newFromAsset, qrSheet, printQR,
  genPM, pmForm, savePM, vendorForm, saveVendor, saveSLA };
window.MT = MT;
window.toggleLang = toggleLang;
window.doLogin = doLogin;
window.doLogout = () => signOut(false);
window.refreshAll = () => refreshAll();

applyLang();
$("#gPass").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
boot().then(handleQRParam).catch(() => {});

/* عامل الخدمة — نفس ملف النظام */
if("serviceWorker" in navigator)
  navigator.serviceWorker.register("sw.js").catch(() => {});

})();
