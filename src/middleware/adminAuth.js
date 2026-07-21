import { verifyAdminToken } from "../utils/jwt.js";
import { pool } from "../db/pool.js";

export async function requireAdminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const payload = verifyAdminToken(token);
    const { rows } = await pool.query(
      "select id, username, created_at from admin_users where id = $1",
      [payload.sub],
    );
    if (!rows[0]) return res.status(401).json({ message: "Not authenticated" });

    req.admin = rows[0];
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired admin session" });
  }
}
