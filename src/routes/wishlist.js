import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

wishlistRouter.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select p.* from wishlist_items w join products p on p.id = w.product_id
       where w.user_id = $1 order by w.created_at desc`,
      [req.user.id],
    );
    res.json(rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, description: r.description,
      image: r.image, price: r.price !== null ? Number(r.price) : undefined,
      category: r.category, size: r.size,
    })));
  } catch (err) {
    next(err);
  }
});

wishlistRouter.post("/", async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ message: "productId is required" });
    await pool.query(
      "insert into wishlist_items (user_id, product_id) values ($1, $2) on conflict do nothing",
      [req.user.id, productId],
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.delete("/:productId", async (req, res, next) => {
  try {
    await pool.query("delete from wishlist_items where user_id = $1 and product_id = $2", [req.user.id, req.params.productId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
