import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_COST);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Basic strength check — 8+ chars, at least one letter and one number.
export function isStrongPassword(pw) {
  return typeof pw === "string" && pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
}
