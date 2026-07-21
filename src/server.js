import express from "express";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import compression from "compression";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env, isProd } from "./config/env.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

import { authRouter } from "./routes/auth.js";
import { adminAuthRouter } from "./routes/adminAuth.js";
import { adminRouter } from "./routes/admin.js";
import { productsRouter } from "./routes/products.js";
import { galleryRouter } from "./routes/gallery.js";
import { wishlistRouter } from "./routes/wishlist.js";
import {
  contactRouter,
  newsletterRouter,
  brandingRequestsRouter,
  seoRouter,
  reviewsRouter,
  customizerRouter,
} from "./routes/misc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Render / any reverse proxy sits in front of us — needed for correct
// client IPs (rate limiting) and secure cookies/headers.
app.set("trust proxy", 1);

// ------------------------------------------------------------- security --
app.use(helmet());
app.use(hpp());
app.use(compression());

const allowedOrigins = env.FRONTEND_URL.split(",").map((s) => s.trim());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan(isProd ? "combined" : "dev"));
app.use(generalLimiter);

// Static avatar uploads (see routes/auth.js note re: ephemeral disk on Render)
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (req, res) => res.json({ ok: true, service: "elarawave-backend" }));

// --------------------------------------------------------------- routes --
app.use("/api/auth", authRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/products", productsRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/contact", contactRouter);
app.use("/api/newsletter", newsletterRouter);
app.use("/api/branding-requests", brandingRequestsRouter);
app.use("/api/seo", seoRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/customizer", customizerRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[elarawave-backend] listening on port ${env.PORT} (${env.NODE_ENV})`);
});
