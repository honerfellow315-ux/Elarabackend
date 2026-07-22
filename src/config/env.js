import "dotenv/config";

/**
 * Central env config. Every secret / config value comes from Render's
 * environment variables (or a local .env file for dev). Nothing is
 * hardcoded anywhere else in the codebase — always import from here.
 */
function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name, fallback) {
  const v = process.env[name];
  return v && v.trim() ? v : fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "production"),
  PORT: Number(optional("PORT", "10000")),

  // Postgres (Supabase) connection string, e.g.
  // postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres
  DATABASE_URL: required("DATABASE_URL"),
  DATABASE_SSL: optional("DATABASE_SSL", "true") === "true",

  // JWT secrets — keep these separate so a leaked user token can never
  // be used to forge an admin token.
  JWT_USER_SECRET: required("JWT_USER_SECRET"),
  JWT_ADMIN_SECRET: required("JWT_ADMIN_SECRET"),
  JWT_USER_EXPIRES_IN: optional("JWT_USER_EXPIRES_IN", "7d"),
  JWT_ADMIN_EXPIRES_IN: optional("JWT_ADMIN_EXPIRES_IN", "12h"),

  // Brevo (Sendinblue) transactional email — used for OTP + reset emails.
  // Optional now that user login/register is disabled; if unset, email
  // sending simply won't work (fine, since nothing calls it anymore).
  BREVO_API_KEY: optional("BREVO_API_KEY", ""),
  BREVO_SENDER_EMAIL: optional("BREVO_SENDER_EMAIL", ""),
  BREVO_SENDER_NAME: optional("BREVO_SENDER_NAME", "ELARA WAVE"),

  // Hugging Face Inference API — powers the "Enhance with AI" bottle
  // mockup generator on the custom-branding page. Optional: if unset,
  // that one endpoint returns a clear 503 instead of crashing the server.
  HUGGINGFACE_API_KEY: optional("HUGGINGFACE_API_KEY", ""),
  HUGGINGFACE_MODEL: optional("HUGGINGFACE_MODEL", "black-forest-labs/FLUX.1-schnell"),

  // Google Places API — pulls the business's real Google reviews into
  // GET /api/reviews (merged with site-submitted reviews). Optional: if
  // either is unset, the endpoint simply skips Google and returns only
  // site reviews (no error, nothing breaks).
  GOOGLE_PLACES_API_KEY: optional("GOOGLE_PLACES_API_KEY", ""),
  GOOGLE_PLACE_ID: optional("GOOGLE_PLACE_ID", ""),
  // How long fetched Google reviews are cached in memory before
  // re-fetching. Keeps us from burning API quota on every page load.
  GOOGLE_REVIEWS_CACHE_MINUTES: Number(optional("GOOGLE_REVIEWS_CACHE_MINUTES", "60")),


  // Frontend origin(s) allowed to call this API (comma separated)
  FRONTEND_URL: required("FRONTEND_URL"),

  // Used to seed the very first admin account (see src/db/seedAdmin.js).
  // These are only ever read once, by the seed script, and are never
  // exposed by any API route.
  ADMIN_USERNAME: optional("ADMIN_USERNAME", ""),
  ADMIN_PASSWORD: optional("ADMIN_PASSWORD", ""),

  BCRYPT_COST: Number(optional("BCRYPT_COST", "12")),
  OTP_TTL_MINUTES: Number(optional("OTP_TTL_MINUTES", "10")),
  OTP_MAX_ATTEMPTS: Number(optional("OTP_MAX_ATTEMPTS", "5")),
  OTP_RESEND_COOLDOWN_SECONDS: Number(optional("OTP_RESEND_COOLDOWN_SECONDS", "60")),
};

export const isProd = env.NODE_ENV === "production";
