// ==========================================
// SUPABASE CONNECTION
// ==========================================
// Paste in the two values from your Supabase project:
// Project Settings > API > Project URL / anon public key

const SUPABASE_URL = "https://wtutryytiyiforpmxqce.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_2YAXDjrEC8SwAzDfz8nysw_PisAOg-v";

const supabaseConfigured =
  SUPABASE_URL.startsWith("http") && !SUPABASE_ANON_KEY.startsWith("PASTE_");

// If the keys above haven't been filled in yet, this stays null and
// clock.js shows a clear on-screen message instead of a cryptic error.
const supabaseClient = supabaseConfigured
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
