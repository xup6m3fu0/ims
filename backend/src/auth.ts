import jwt from "jsonwebtoken";
import type { Request } from "express";
import { env } from "./env";

/** 登入後寫入 JWT 的 payload 型別 */
export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "viewer" | "client";
  /** client 可見欄位；admin/viewer 為 null 表示全部 */
  visibleFields?: string[] | null;
  /** client 允許操作 list/create/update/delete；admin 為 null 表示全部；viewer 僅 list */
  allowedOps?: string[] | null;
};

const COOKIE_NAME = "ims_token";

export function signToken(user: AuthUser): string {
  return jwt.sign({ ...user }, env.jwtSecret, { expiresIn: "8h" });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as any;
    if (!payload?.id || !payload?.username) return null;
    const role =
      payload.role === "admin"
        ? "admin"
        : payload.role === "client"
          ? "client"
          : "viewer";
    return {
      id: Number(payload.id),
      username: String(payload.username),
      displayName: String(payload.displayName ?? payload.username),
      role,
      visibleFields: Array.isArray(payload.visibleFields) ? payload.visibleFields : null,
      allowedOps: Array.isArray(payload.allowedOps) ? payload.allowedOps : null,
    };
  } catch {
    return null;
  }
}

export function getTokenFromReq(req: Request): string | null {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return cookies?.[COOKIE_NAME] ?? null;
}

export function cookieName() {
  return COOKIE_NAME;
}

