import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { validateBody } from "../utils/validate.js";
import { comparePassword } from "../utils/password.js";
import { signAdminToken } from "../utils/jwt.js";
import { adminLoginLimiter } from "../middleware/rateLimit.js";

export const adminAuthRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

adminAuthRouter.post("/login", adminLoginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query("select * from admin_users where username = $1", [username]);
    const admin = rows[0];

    // Constant-shape response regardless of which check fails.
    if (!admin) return res.status(401).json({ message: "Invalid username or password." });
    const match = await comparePassword(password, admin.password_hash);
    if (!match) return res.status(401).json({ message: "Invalid username or password." });

    const token = signAdminToken(admin);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});


