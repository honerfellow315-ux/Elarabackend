import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { validateBody } from "../utils/validate.js";
import { comparePassword, hashPassword, isStrongPassword } from "../utils/password.js";

export const adminRouter = Router();
adminRouter.use(requireAdminAuth);

const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone || undefined,
  avatar: row.avatar || undefined,
  role: row.role,
  createdAt: row.created_at,
});

// ---------------------------------------------------------------- stats --
adminRouter.get("/stats", async (req, res, next) => {
  try {
    const [users, subs, messages, products, orders] = await Promise.all([
      pool.query("select count(*)::int as n from users"),
      pool.query("select count(*)::int as n from newsletter_subscribers"),
      pool.query("select count(*)::int as n from contact_messages where read = false"),
      pool.query("select count(*)::int as n from products"),
      pool.query("select count(*)::int as n from branding_requests"),
    ]);
    res.json({
      users: users.rows[0].n,
      subscribers: subs.rows[0].n,
      messages: messages.rows[0].n,
      products: products.rows[0].n,
      orders: orders.rows[0].n,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- users --
adminRouter.get("/users", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from users order by created_at desc limit 500");
    res.json(rows.map(publicUser));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from users where id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "User not found" });
    res.json(publicUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/users/:id", async (req, res, next) => {
  try {
    await pool.query("delete from users where id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------- newsletter --
adminRouter.get("/newsletter", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from newsletter_subscribers order by created_at desc limit 1000");
    res.json(rows.map((r) => ({ id: r.id, email: r.email, createdAt: r.created_at, source: r.source })));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/newsletter/:id", async (req, res, next) => {
  try {
    await pool.query("delete from newsletter_subscribers where id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------ messages --
adminRouter.get("/messages", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from contact_messages order by created_at desc limit 1000");
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone,
      subject: r.subject, message: r.message, createdAt: r.created_at, read: r.read,
    })));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/messages/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from contact_messages where id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Message not found" });
    await pool.query("update contact_messages set read = true where id = $1", [req.params.id]);
    const r = rows[0];
    res.json({ id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject, message: r.message, createdAt: r.created_at, read: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/messages/:id", async (req, res, next) => {
  try {
    await pool.query("delete from contact_messages where id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------- branding requests --
adminRouter.get("/branding-requests", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from branding_requests order by created_at desc limit 1000");
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, brand: r.brand, email: r.email, phone: r.phone,
      size: r.size, quantity: r.quantity, brief: r.brief, createdAt: r.created_at, read: r.read,
    })));
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/branding-requests/:id", async (req, res, next) => {
  try {
    await pool.query("delete from branding_requests where id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------- seo --
adminRouter.get("/seo", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from seo_settings where id = 1");
    const r = rows[0];
    res.json({
      title: r.title, description: r.description, keywords: r.keywords,
      canonical: r.canonical, ogImage: r.og_image, favicon: r.favicon,
      robots: r.robots, sitemap: r.sitemap,
    });
  } catch (err) {
    next(err);
  }
});

const seoSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  keywords: z.string().max(500).optional(),
  canonical: z.string().max(300).optional(),
  ogImage: z.string().max(500).optional(),
  favicon: z.string().max(300).optional(),
  robots: z.string().max(300).optional(),
  sitemap: z.string().max(300).optional(),
});

adminRouter.put("/seo", validateBody(seoSchema), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `update seo_settings set
        title = coalesce($1, title), description = coalesce($2, description),
        keywords = coalesce($3, keywords), canonical = coalesce($4, canonical),
        og_image = coalesce($5, og_image), favicon = coalesce($6, favicon),
        robots = coalesce($7, robots), sitemap = coalesce($8, sitemap),
        updated_at = now()
       where id = 1 returning *`,
      [b.title, b.description, b.keywords, b.canonical, b.ogImage, b.favicon, b.robots, b.sitemap],
    );
    const r = rows[0];
    res.json({
      title: r.title, description: r.description, keywords: r.keywords,
      canonical: r.canonical, ogImage: r.og_image, favicon: r.favicon,
      robots: r.robots, sitemap: r.sitemap,
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- settings --
adminRouter.get("/settings", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select settings from site_settings where id = 1");
    res.json(rows[0].settings || {});
  } catch (err) {
    next(err);
  }
});

adminRouter.put("/settings", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `update site_settings set settings = settings || $1::jsonb, updated_at = now() where id = 1 returning settings`,
      [JSON.stringify(req.body || {})],
    );
    res.json(rows[0].settings);
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------- credentials --
const changeCredsSchema = z.object({
  username: z.string().trim().min(3).max(120).optional(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200).optional(),
});

adminRouter.post("/credentials", validateBody(changeCredsSchema), async (req, res, next) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    const { rows } = await pool.query("select * from admin_users where id = $1", [req.admin.id]);
    const admin = rows[0];

    const match = await comparePassword(currentPassword, admin.password_hash);
    if (!match) return res.status(401).json({ message: "Current password is incorrect." });

    if (newPassword && !isStrongPassword(newPassword)) {
      return res.status(400).json({ message: "New password must be at least 8 characters and include a letter and a number." });
    }

    const nextUsername = username || admin.username;
    const nextHash = newPassword ? await hashPassword(newPassword) : admin.password_hash;

    await pool.query(
      "update admin_users set username = $1, password_hash = $2, updated_at = now() where id = $3",
      [nextUsername, nextHash, admin.id],
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Username already taken." });
    next(err);
  }
});
