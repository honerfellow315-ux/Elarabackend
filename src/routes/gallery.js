import { Router } from "express";
import { pool } from "../db/pool.js";

export const galleryRouter = Router();

galleryRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query("select * from gallery_images order by created_at desc limit 300");
    res.json(rows.map((r) => ({ id: r.id, url: r.url, alt: r.alt })));
  } catch (err) {
    next(err);
  }
});
