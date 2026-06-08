// ============================================================
// SUPABASE CLIENT
// ============================================================

(function () {
  const config = window.APP_CONFIG || {};

  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error("Configuration Supabase manquante.");
    return;
  }

  if (config.SUPABASE_URL.includes("TON-PROJET") || config.SUPABASE_ANON_KEY.includes("TON_ANON_KEY")) {
    console.warn("Pense à renseigner SUPABASE_URL et SUPABASE_ANON_KEY dans js/config.js");
  }

  window.sb = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
