import { Router } from "express";
import { pool } from "../db/pool.js";

export const productsRouter = Router();

const toProduct = (r) => ({
  id: r.id, slug: r.slug, title: r.title, description: r.description,
  image: r.image, price: r.price !== null ? Number(r.price) : undefined,
  category: r.category, size: r.size,
});

productsRouter.get("/", async (req, res, next) => {
  try {
    const { category } = req.query;
    const { rows } = category
      ? await pool.query("select * from products where category = $1 order by created_at desc", [category])
      : await pool.query("select * from products order by created_at desc");
    res.json(rows.map(toProduct));
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:idOrSlug", async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const { rows } = isUuid
      ? await pool.query("select * from products where id = $1", [idOrSlug])
      : await pool.query("select * from products where slug = $1", [idOrSlug]);
    if (!rows[0]) return res.status(404).json({ message: "Product not found" });
    res.json(toProduct(rows[0]));
  } catch (err) {
    next(err);
  }
});
