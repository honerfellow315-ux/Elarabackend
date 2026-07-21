import bcrypt from "bcryptjs";
import { pool } from "./pool.js";
import { env } from "../config/env.js";

/**
 * One-time (idempotent) admin seeding.
 * Run with: npm run db:seed-admin
 *
 * Reads ADMIN_USERNAME / ADMIN_PASSWORD from environment variables
 * (set them in Render's dashboard, run this once, then you may remove
 * them from env — the admin's password is stored in the database only
 * as a bcrypt hash, never in plaintext, never hardcoded in source).
 */
async function main() {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    console.error(
      "[seed-admin] Set ADMIN_USERNAME and ADMIN_PASSWORD env vars before running this script.",
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_COST);

  const existing = await pool.query(
    "select id from admin_users where username = $1",
    [env.ADMIN_USERNAME],
  );

  if (existing.rows.length > 0) {
    await pool.query(
      "update admin_users set password_hash = $1, updated_at = now() where username = $2",
      [hash, env.ADMIN_USERNAME],
    );
    console.log(`[seed-admin] Updated password for existing admin "${env.ADMIN_USERNAME}".`);
  } else {
    await pool.query(
      "insert into admin_users (username, password_hash) values ($1, $2)",
      [env.ADMIN_USERNAME, hash],
    );
    console.log(`[seed-admin] Created admin "${env.ADMIN_USERNAME}".`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[seed-admin] failed:", err);
  process.exit(1);
});
