import { verifyUserToken } from "../utils/jwt.js";
import { pool } from "../db/pool.js";

/** Requires a valid user Bearer token. Attaches req.user (fresh from DB). */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const payload = verifyUserToken(token);
    const { rows } = await pool.query(
      "select id, name, email, phone, avatar, role, created_at from users where id = $1",
      [payload.sub],
    );
    if (!rows[0]) return res.status(401).json({ message: "Not authenticated" });

    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}
