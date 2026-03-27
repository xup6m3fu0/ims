import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Db } from "../db";
import { get } from "../db";
import { cookieName, signToken, verifyToken } from "../auth";
import { z } from "zod";
import { env } from "../env";

type UserRow = {
  id: number;
  username: string;
  passwordHash: string;
  displayName: string;
  role: "admin" | "viewer" | "client";
  visibleFields: string | null;
  allowedOps: string | null;
  isActive: 0 | 1;
};

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export function authRouter(db: Db) {
  const r = Router();

  r.get("/me", async (req, res) => {
    const token = (req as any).cookies?.[cookieName()];
    if (!token) return res.status(200).json({ user: null });
    let user = verifyToken(token);
    if (!user) return res.status(200).json({ user: null });
    // client 一律從 DB 讀取最新 allowedOps/visibleFields，避免 admin 改權限後仍回傳舊 JWT 導致前端 403
    if (user.role === "client") {
      const row = await get<{ allowedOps: string | null; visibleFields: string | null }>(
        db,
        "SELECT allowedOps, visibleFields FROM users WHERE id = ? AND isActive = 1",
        [user.id]
      );
      if (row) {
        let allowedOps: string[] = [];
        if (row.allowedOps) {
          try {
            const parsed = JSON.parse(row.allowedOps) as string[];
            allowedOps = Array.isArray(parsed) ? parsed : [];
          } catch {}
        }
        if (allowedOps.length === 0 || !allowedOps.includes("list")) {
          allowedOps = allowedOps.includes("list") ? allowedOps : ["list", ...allowedOps];
        }
        let visibleFields: string[] | null = null;
        if (row.visibleFields) {
          try {
            const parsed = JSON.parse(row.visibleFields) as string[];
            visibleFields = Array.isArray(parsed) ? parsed : null;
          } catch {}
        }
        user = { ...user, allowedOps, visibleFields: visibleFields ?? undefined };
      }
    }
    return res.status(200).json({ user });
  });

  r.post("/login", async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    }

    const row = await get<UserRow>(
      db,
      "SELECT id, username, passwordHash, displayName, role, visibleFields, allowedOps, isActive FROM users WHERE username = ?",
      [parsed.data.username]
    );
    if (!row || row.isActive !== 1) {
      return res.status(401).json({ error: "unauthorized", message: "帳號或密碼錯誤" });
    }

    const ok = await bcrypt.compare(parsed.data.password, row.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "unauthorized", message: "帳號或密碼錯誤" });
    }

    let visibleFields: string[] | null = null;
    let allowedOps: string[] | null = null;
    if (row.visibleFields) {
      try {
        visibleFields = JSON.parse(row.visibleFields) as string[];
      } catch {}
    }
    if (row.allowedOps) {
      try {
        const parsed = JSON.parse(row.allowedOps) as string[];
        allowedOps = Array.isArray(parsed) ? parsed : null;
      } catch {}
    }
    if (row.role === "viewer") {
      allowedOps = ["list"];
    }
    if (row.role === "client") {
      if (!allowedOps || allowedOps.length === 0) {
        allowedOps = ["list"];
      } else if (!allowedOps.includes("list")) {
        allowedOps = ["list", ...allowedOps];
      }
    }

    const token = signToken({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      visibleFields: visibleFields ?? undefined,
      allowedOps: allowedOps ?? undefined,
    });

    res.cookie(cookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
      maxAge: 8 * 60 * 60 * 1000,
    });

    return res.json({
      user: {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        visibleFields: visibleFields ?? undefined,
        allowedOps: allowedOps ?? undefined,
      },
    });
  });

  r.post("/logout", async (_req, res) => {
    res.clearCookie(cookieName(), {
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
    });
    return res.status(204).send();
  });

  return r;
}

