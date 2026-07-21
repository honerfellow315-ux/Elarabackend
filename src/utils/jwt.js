import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signUserToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, typ: "user" },
    env.JWT_USER_SECRET,
    { expiresIn: env.JWT_USER_EXPIRES_IN },
  );
}

export function verifyUserToken(token) {
  const payload = jwt.verify(token, env.JWT_USER_SECRET);
  if (payload.typ !== "user") throw new Error("Wrong token type");
  return payload;
}

export function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, role: "admin", typ: "admin" },
    env.JWT_ADMIN_SECRET,
    { expiresIn: env.JWT_ADMIN_EXPIRES_IN },
  );
}

export function verifyAdminToken(token) {
  const payload = jwt.verify(token, env.JWT_ADMIN_SECRET);
  if (payload.typ !== "admin") throw new Error("Wrong token type");
  return payload;
}
