// Public Supabase client config. These are PUBLIC values by design — the
// publishable key ships in the browser bundle and security is enforced by
// Row Level Security (not by hiding the key). Env vars (.env.local) override
// the committed fallbacks so the Vercel build always has valid values.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bodkrhcmzdvbeqipsqzx.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_0CON3_AFnyEnyo1-N42_vA_03AScoJ2";
