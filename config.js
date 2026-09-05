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

  APP_VERSION: "1.0.0"
};
