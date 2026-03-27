import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./env";
import { initSchema, openDb } from "./db";
import { productsRouter } from "./routes/products";
import { authRouter } from "./routes/auth";
import { adminUsersRouter } from "./routes/adminUsers";
import { requireAuth } from "./middleware/requireAuth";
import { enrichClientPermissions } from "./middleware/enrichClientPermissions";

async function main() {
  const db = openDb();
  await initSchema(db);

  const app = express();

  // --- 中介軟體 ---
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // --- 路由 ---
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter(db));
  app.use("/api/products", requireAuth, enrichClientPermissions(db), productsRouter(db));
  app.use("/api/admin/users", requireAuth, adminUsersRouter(db));

  // --- 生產環境：提供前端靜態檔（同源部署時使用）---
  const publicDir = path.join(__dirname, "..", "public");
  if (env.nodeEnv === "production" && fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // --- 錯誤處理 ---
  app.use((err: any, _req: any, res: any, _next: any) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  app.listen(env.port, env.listenHost, () => {
    // eslint-disable-next-line no-console
    console.log(`[backend] listening on http://${env.listenHost}:${env.port}`);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

