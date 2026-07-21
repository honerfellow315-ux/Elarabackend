import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

export function generateOtp() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export async function createOtp(email, purpose, payload = null) {
  const code = generateOtp();
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000);

  await pool.query(
    "delete from otp_codes where email = $1 and purpose = $2 and consumed_at is null",
    [email, purpose],
  );

  await pool.query(
    `insert into otp_codes (email, purpose, otp_hash, max_attempts, expires_at, payload)
     values ($1, $2, $3, $4, $5, $6)`,
    [email, purpose, hash, env.OTP_MAX_ATTEMPTS, expiresAt, payload],
  );

  return code;
}

export async function verifyOtp(email, purpose, code) {
  const { rows } = await pool.query(
    `select * from otp_codes
     where email = $1 and purpose = $2 and consumed_at is null
     order by created_at desc limit 1`,
    [email, purpose],
  );
  const record = rows[0];
  if (!record) return { ok: false, reason: "No active code. Please request a new one." };

  if (new Date(record.expires_at) < new Date()) {
    return { ok: false, reason: "This code has expired. Please request a new one." };
  }
  if (record.attempts >= record.max_attempts) {
    return { ok: false, reason: "Too many attempts. Please request a new code." };
  }

  const match = await bcrypt.compare(code, record.otp_hash);
  if (!match) {
    await pool.query("update otp_codes set attempts = attempts + 1 where id = $1", [record.id]);
    return { ok: false, reason: "Invalid code." };
  }

  await pool.query("update otp_codes set consumed_at = now() where id = $1", [record.id]);
  return { ok: true, payload: record.payload };
}

export async function canResend(email, purpose) {
  const { rows } = await pool.query(
    `select created_at from otp_codes
     where email = $1 and purpose = $2
     order by created_at desc limit 1`,
    [email, purpose],
  );
  if (!rows[0]) return true;
  const elapsedMs = Date.now() - new Date(rows[0].created_at).getTime();
  return elapsedMs >= env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
}
