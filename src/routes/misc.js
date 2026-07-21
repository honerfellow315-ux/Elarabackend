import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { validateBody } from "../utils/validate.js";
import { authLimiter, aiGenerateLimiter } from "../middleware/rateLimit.js";
import { generateBottleMockup } from "../utils/aiImage.js";

export const contactRouter = Router();
export const newsletterRouter = Router();
export const brandingRequestsRouter = Router();
export const seoRouter = Router();
export const reviewsRouter = Router();
export const customizerRouter = Router();

// ----------------------------------------------------------------- contact --
const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(1).max(4000),
});

contactRouter.post("/", authLimiter, validateBody(contactSchema), async (req, res, next) => {
  try {
    const { name, email, phone, message } = req.body;
    await pool.query(
      "insert into contact_messages (name, email, phone, message) values ($1, $2, $3, $4)",
      [name, email, phone || null, message],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- newsletter --
const subscribeSchema = z.object({ email: z.string().trim().email() });

newsletterRouter.post("/subscribe", authLimiter, validateBody(subscribeSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    await pool.query(
      "insert into newsletter_subscribers (email, source) values ($1, 'website') on conflict (email) do nothing",
      [email],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------- branding reqs --
const brandingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional(),
  size: z.string().trim().max(60),
  quantity: z.string().trim().max(60),
  brief: z.string().trim().max(4000).optional().default(""),
});

brandingRequestsRouter.post("/", authLimiter, validateBody(brandingSchema), async (req, res, next) => {
  try {
    const { name, brand, email, phone, size, quantity, brief } = req.body;
    await pool.query(
      `insert into branding_requests (name, brand, email, phone, size, quantity, brief)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [name, brand, email, phone || null, size, quantity, brief],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------- seo --
seoRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select title, description from seo_settings where id = 1");
    res.json(rows[0] || {});
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------- reviews --
reviewsRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "select * from reviews where approved = true order by review_date desc limit 200",
    );
    res.json(rows.map((r) => ({
      id: r.id, author: r.author, avatar: r.avatar, rating: r.rating,
      date: r.review_date, text: r.text, source: r.source,
    })));
  } catch (err) {
    next(err);
  }
});

const reviewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1).max(2000),
  email: z.string().trim().email().optional(),
});

reviewsRouter.post("/", authLimiter, validateBody(reviewSchema), async (req, res, next) => {
  try {
    const { name, rating, text, email } = req.body;
    // New submissions require admin approval before appearing publicly.
    await pool.query(
      "insert into reviews (author, rating, text, email, source, approved) values ($1,$2,$3,$4,'site', false)",
      [name, rating, text, email || null],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- customizer --
customizerRouter.get("/settings", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select settings from customizer_settings where id = 1");
    res.json(rows[0].settings || {});
  } catch (err) {
    next(err);
  }
});

customizerRouter.post("/", authLimiter, async (req, res, next) => {
  try {
    await pool.query("insert into customizer_submissions (payload) values ($1)", [JSON.stringify(req.body || {})]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------- AI bottle mockup --
// Powers the "Enhance with AI" button in BottleConfigurator.tsx.
// Returns 4 image angles as data URLs: { images: { front, back, top, bottom } }
const generateSchema = z.object({
  bottleId: z.string().trim().min(1).max(80),
  gradient: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).optional().default(""),
  logo: z.string().nullable().optional(),
});

customizerRouter.post("/generate", aiGenerateLimiter, validateBody(generateSchema), async (req, res, next) => {
  try {
    const { bottleId, gradient, brand } = req.body;
    const images = await generateBottleMockup({ bottleId, gradient, brand });
    res.json({ images });
  } catch (err) {
    next(err);
  }
});
