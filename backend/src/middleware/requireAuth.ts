import type { RequestHandler } from "express";
import { getTokenFromReq, verifyToken } from "../auth";

/** 從 cookie 讀取 JWT，驗證通過後將使用者寫入 req.authUser */
declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: number;
        username: string;
        displayName: string;
        role: "admin" | "viewer" | "client";
        visibleFields?: string[] | null;
        allowedOps?: string[] | null;
      };
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.authUser = user;
  return next();
};

