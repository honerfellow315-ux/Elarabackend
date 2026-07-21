import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import path from "node:path";
import multer from "multer";
import { pool } from "../db/pool.js";
import { validateBody } from "../utils/validate.js";
import { hashPassword, comparePassword, isStrongPassword } from "../utils/password.js";
import { signUserToken, verifyUserToken } from "../utils/jwt.js";
import { createOtp, verifyOtp, canResend } from "../utils/otp.js";
import { sendOtpEmail, sendPasswordResetLinkEmail } from "../utils/email.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimit.js";
import { env } from "../config/env.js";

export const authRouter = Router();

const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone || undefined,
  avatar: row.avatar || undefined,
  role: row.role,
  createdAt: row.created_at,
});

// ---------------------------------------------------------------- register --
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

authRouter.post("/register", authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and include a letter and a number." });
    }

    const existing = await pool.query("select id, email_verified from users where email = $1", [email]);
    if (existing.rows[0]?.email_verified) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(password);

    if (!(await canResend(email, "register"))) {
      return res.status(429).json({ message: "Please wait before requesting another code." });
    }

    const code = await createOtp(email, "register", { name, email, passwordHash });
    await sendOtpEmail(email, code, "register");

    res.json({ ok: true, message: "Verification code sent to your email." });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- verify-otp --
const verifyOtpSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().length(6),
});

authRouter.post("/verify-otp", otpLimiter, validateBody(verifyOtpSchema), async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyOtp(email, "register", otp);
    if (!result.ok) return res.status(400).json({ message: result.reason });

    const { name, passwordHash } = result.payload;

    const upsert = await pool.query(
      `insert into users (name, email, password_hash, email_verified)
       values ($1, $2, $3, true)
       on conflict (email) do update
         set name = excluded.name, password_hash = excluded.password_hash, email_verified = true, updated_at = now()
       returning id, name, email, phone, avatar, role, created_at`,
      [name, email, passwordHash],
    );

    const user = upsert.rows[0];
    const token = signUserToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------- resend-otp --
const resendSchema = z.object({ email: z.string().trim().email() });

authRouter.post("/resend-otp", otpLimiter, validateBody(resendSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const pending = await pool.query(
      `select payload from otp_codes where email = $1 and purpose = 'register'
       order by created_at desc limit 1`,
      [email],
    );
    if (!pending.rows[0]) {
      return res.status(400).json({ message: "No pending registration for this email." });
    }
    if (!(await canResend(email, "register"))) {
      return res.status(429).json({ message: "Please wait before requesting another code." });
    }
    const code = await createOtp(email, "register", pending.rows[0].payload);
    await sendOtpEmail(email, code, "register");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------- login --
const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

authRouter.post("/login", authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query("select * from users where email = $1", [email]);
    const user = rows[0];

    // Generic message either way — never reveal whether the email exists.
    const invalid = () => res.status(401).json({ message: "Invalid email or password." });

    if (!user) return invalid();
    if (!user.email_verified) {
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }
    const match = await comparePassword(password, user.password_hash);
    if (!match) return invalid();

    const token = signUserToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------- me --
authRouter.get("/me", requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

authRouter.post("/logout", requireAuth, (req, res) => {
  // Stateless JWT — client just discards the token. Nothing to invalidate
  // server-side unless you add a token-blocklist table.
  res.json({ ok: true });
});

authRouter.post("/refresh", requireAuth, (req, res) => {
  const token = signUserToken(req.user);
  res.json({ token });
});

// --------------------------------------------------------- profile update --
const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(30).optional(),
  avatar: z.string().url().optional(),
});

authRouter.put("/profile", requireAuth, validateBody(profileSchema), async (req, res, next) => {
  try {
    const fields = req.body;
    const keys = Object.keys(fields);
    if (keys.length === 0) return res.json(publicUser(req.user));

    const sets = keys.map((k, i) => `${k === "email" ? "email" : k} = $${i + 2}`);
    const values = keys.map((k) => fields[k]);

    const { rows } = await pool.query(
      `update users set ${sets.join(", ")}, updated_at = now() where id = $1
       returning id, name, email, phone, avatar, role, created_at`,
      [req.user.id, ...values],
    );
    res.json(publicUser(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Email already in use." });
    next(err);
  }
});

// ------------------------------------------------------------ avatar upload --
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

// NOTE: Render's local disk is ephemeral (wiped on redeploy). This stores
// files under /uploads for simplicity; for durable storage, swap this
// for a Supabase Storage bucket upload (few lines, same route contract).
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const __dirnameAuth = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirnameAuth, "..", "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

authRouter.post("/avatar", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });
    const ext = path.extname(req.file.originalname) || ".jpg";
    const filename = `${req.user.id}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);

    const url = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
    await pool.query("update users set avatar = $1, updated_at = now() where id = $2", [url, req.user.id]);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------- forgot pw --
const forgotSchema = z.object({ email: z.string().trim().email() });

authRouter.post("/password/forgot", authLimiter, validateBody(forgotSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const { rows } = await pool.query("select id, email from users where email = $1", [email]);
    // Always respond ok — don't leak whether the account exists.
    if (rows[0]) {
      const user = rows[0];
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      await pool.query(
        "insert into password_resets (user_id, token_hash, expires_at) values ($1, $2, $3)",
        [user.id, tokenHash, expiresAt],
      );
      const resetUrl = `${env.FRONTEND_URL.split(",")[0]}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
      await sendPasswordResetLinkEmail(email, resetUrl);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

authRouter.post("/password/reset", authLimiter, validateBody(resetSchema), async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and include a letter and a number." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { rows } = await pool.query(
      `select * from password_resets where token_hash = $1 and used_at is null and expires_at > now()`,
      [tokenHash],
    );
    const record = rows[0];
    if (!record) return res.status(400).json({ message: "This reset link is invalid or has expired." });

    const passwordHash = await hashPassword(password);
    await pool.query("update users set password_hash = $1, updated_at = now() where id = $2", [passwordHash, record.user_id]);
    await pool.query("update password_resets set used_at = now() where id = $1", [record.id]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------ password change via OTP --
authRouter.post("/password/otp/request", requireAuth, otpLimiter, async (req, res, next) => {
  try {
    const email = req.user.email;
    if (!(await canResend(email, "password_change"))) {
      return res.status(429).json({ message: "Please wait before requesting another code." });
    }
    const code = await createOtp(email, "password_change", { userId: req.user.id });
    await sendOtpEmail(email, code, "password_change");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const verifyPwOtpSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().length(6),
  newPassword: z.string().min(8).max(200),
});

authRouter.post("/password/otp/verify", requireAuth, otpLimiter, validateBody(verifyPwOtpSchema), async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (email !== req.user.email) return res.status(400).json({ message: "Email mismatch." });
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and include a letter and a number." });
    }
    const result = await verifyOtp(email, "password_change", otp);
    if (!result.ok) return res.status(400).json({ message: result.reason });

    const passwordHash = await hashPassword(newPassword);
    await pool.query("update users set password_hash = $1, updated_at = now() where id = $2", [passwordHash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { verifyUserToken };
