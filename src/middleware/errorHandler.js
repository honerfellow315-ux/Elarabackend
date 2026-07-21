import { isProd } from "../config/env.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ message: "Not found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error("[error]", err);
  const status = err.status || 500;
  res.status(status).json({
    message: status === 500 ? "Something went wrong. Please try again." : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}
