/* ═══════════════════════════════════════════════════════════
   إعدادات النظام — الملف الوحيد الذي تعدّله بعد التركيب
   ═══════════════════════════════════════════════════════════ */
window.CONFIG = {
  company: "سفن ايكونز",

  /* من Supabase → Project Settings → Data API
     URL  = Project URL
     KEY  = Publishable key (أو Legacy → anon public) */
  SUPABASE_URL: "https://ntwbbuweottxgwohrxpv.supabase.co",
  SUPABASE_KEY: "sb_publishable_5TJpMeZup9M2YHnLycW9jA_JccORmq0",

  /* المنطقة الزمنية لحساب «يوم العمل» */
  TZ: "Asia/Kuwait",

  /* ساعة بدء يوم العمل — تشييك الإغلاق بعد منتصف الليل
     يُحتسب على اليوم السابق. ٥ = الخامسة صباحاً. */
  DAY_START_HOUR: 5,

  /* جودة الصورة المرفوعة */
  PHOTO_MAX_PX: 1280,
  PHOTO_QUALITY: 0.72,

  /* دقة الموقع المقبولة بالمتر — أعلى من كده يطلب إعادة المحاولة */
  GPS_MAX_ACCURACY_M: 100,
  GPS_TIMEOUT_MS: 20000,

  APP_VERSION: "1.1.0",

  /* ═══════════════════════════════════════════════════════════
     هوية العلامات — اللون والشعار لكل علامة
     ───────────────────────────────────────────────────────────
     المفتاح = رمز العلامة في قاعدة البيانات (brands.code).
     الألوان مستخرجة من ملفات الشعارات نفسها.
     لتغيير لون علامة: عدّل السطر هنا فقط — لا يحتاج قاعدة بيانات.
     ═══════════════════════════════════════════════════════════ */
  BRANDS: {
    wahed:    { color: "#00B0B2", dark: "#006E6F", logo: "brand-wahed.png",    name: "واحد ساندوتش" },
    shawarma: { color: "#C42426", dark: "#901517", logo: "brand-shawarma.png", name: "شاورما آند جريل" },
    karak:    { color: "#8E2A20", dark: "#5E1A13", logo: "brand-karak.png",    name: "كرك الشايب" },
    hangar:   { color: "#1F5F8A", dark: "#123A56", logo: "",                   name: "ذا هانجر" },
    ck:       { color: "#0B5F4E", dark: "#063B30", logo: "",                   name: "المطبخ المركزي" }
  },

  /* اللون الافتراضي لمن لا علامة له (الإدارة و QA & Training) */
  BRAND_FALLBACK: { color: "#0B5F4E", dark: "#063B30", logo: "logo-sevenicons.png" }
};
