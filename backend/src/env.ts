import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5175),
  /** 綁定位址；預設 0.0.0.0 讓同區網可透過主機 IP 存取（如 Mac Mini 當伺服器） */
  listenHost: process.env.LISTEN_HOST ?? "0.0.0.0",
  databasePath: process.env.DATABASE_PATH ?? "data/ims.sqlite",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",
  seed: (process.env.SEED_DATA ?? "true").toLowerCase() === "true",
  require: required,
};
