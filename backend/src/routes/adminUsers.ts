import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Db } from "../db";
import { all, get, run } from "../db";
import { requireAdmin } from "../middleware/requireAdmin";
import { PRODUCT_FIELDS, PRODUCT_OPS } from "../permissions";
import { z } from "zod";

const AllowedRoles = z.enum(["viewer", "client"]);

const CreateUserSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(128),
  role: AllowedRoles,
  visibleFields: z.array(z.string()).optional(),
  allowedOps: z.array(z.enum(["list", "create", "update", "delete"])).optional(),
});

const UpdateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  password: z.string().min(1).max(128).optional(),
  role: AllowedRoles.optional(),
  visibleFields: z.array(z.string()).optional().nullable(),
  allowedOps: z.array(z.enum(["list", "create", "update", "delete"])).optional().nullable(),
  isActive: z.boolean().optional(),
});

type UserRow = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  visibleFields: string | null;
  allowedOps: string | null;
  createdBy: number | null;
  isActive: number;
  createdAt: string;
};

export function adminUsersRouter(db: Db) {
  const r = Router({ mergeParams: true });
  r.use(requireAdmin);

  r.get("/", async (_req, res) => {
    const rows = await all<UserRow>(
      db,
      "SELECT id, username, displayName, role, visibleFields, allowedOps, createdBy, isActive, createdAt FROM users ORDER BY id"
    );
    const list = rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      visibleFields: row.visibleFields ? (JSON.parse(row.visibleFields) as string[]) : null,
      allowedOps: row.allowedOps ? (JSON.parse(row.allowedOps) as string[]) : null,
      createdBy: row.createdBy,
      isActive: !!row.isActive,
      createdAt: row.createdAt,
    }));
    return res.json({ data: list });
  });

  r.get("/fields", (_req, res) => {
    return res.json({ data: [...PRODUCT_FIELDS] });
  });

  r.get("/ops", (_req, res) => {
    return res.json({ data: [...PRODUCT_OPS] });
  });

  r.post("/", async (req, res) => {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    }

    const adminId = req.authUser!.id;
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const visibleFields =
      parsed.data.role === "client" && parsed.data.visibleFields
        ? JSON.stringify(parsed.data.visibleFields)
        : null;
    let allowedOps: string | null = null;
    if (parsed.data.role === "viewer") {
      allowedOps = JSON.stringify(["list"]);
    } else if (parsed.data.role === "client") {
      const ops = parsed.data.allowedOps && parsed.data.allowedOps.length > 0
        ? parsed.data.allowedOps
        : ["list"];
      const withList = ops.includes("list") ? ops : ["list", ...ops];
      allowedOps = JSON.stringify(withList);
    }

    try {
      const result = await run(
        db,
        `INSERT INTO users (username, passwordHash, displayName, role, visibleFields, allowedOps, createdBy, isActive, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          parsed.data.username,
          passwordHash,
          parsed.data.displayName,
          parsed.data.role,
          visibleFields,
          allowedOps,
          adminId,
          now,
        ]
      );
      const row = await get<UserRow>(db, "SELECT id, username, displayName, role, visibleFields, allowedOps, createdBy, isActive, createdAt FROM users WHERE id = ?", [result.lastID]);
      if (!row) return res.status(500).json({ error: "internal_error" });
      return res.status(201).json({
        data: {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          role: row.role,
          visibleFields: row.visibleFields ? (JSON.parse(row.visibleFields) as string[]) : null,
          allowedOps: row.allowedOps ? (JSON.parse(row.allowedOps) as string[]) : null,
          createdBy: row.createdBy,
          isActive: !!row.isActive,
          createdAt: row.createdAt,
        },
      });
    } catch (e: any) {
      if (String(e?.message ?? "").includes("UNIQUE")) {
        return res.status(409).json({ error: "conflict", message: "帳號已存在" });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  });

  r.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "bad_request" });
    }

    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "bad_request", details: parsed.error.flatten() });
    }

    const existing = await get<UserRow>(db, "SELECT * FROM users WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "not_found" });

    if (existing.role === "admin") {
      console.warn("[403 forbidden] 不可修改管理員帳號", { path: req.path, targetUserId: id });
      return res.status(403).json({ error: "forbidden", message: "不可修改管理員帳號" });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (parsed.data.displayName !== undefined) {
      updates.push("displayName = ?");
      params.push(parsed.data.displayName);
    }
    if (parsed.data.password !== undefined) {
      const hash = await bcrypt.hash(parsed.data.password, 10);
      updates.push("passwordHash = ?");
      params.push(hash);
    }
    if (parsed.data.role !== undefined) {
      updates.push("role = ?");
      params.push(parsed.data.role);
    }
    if (parsed.data.visibleFields !== undefined) {
      updates.push("visibleFields = ?");
      params.push(parsed.data.visibleFields === null ? null : JSON.stringify(parsed.data.visibleFields));
    }
    if (parsed.data.allowedOps !== undefined) {
      let ops = parsed.data.allowedOps;
      if (Array.isArray(ops) && (existing.role === "client" || parsed.data.role === "client")) {
        if (!ops.includes("list")) ops = ["list", ...ops];
      }
      updates.push("allowedOps = ?");
      params.push(ops === null ? null : JSON.stringify(ops));
    }
    if (parsed.data.isActive !== undefined) {
      updates.push("isActive = ?");
      params.push(parsed.data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      const row = await get<UserRow>(db, "SELECT id, username, displayName, role, visibleFields, allowedOps, createdBy, isActive, createdAt FROM users WHERE id = ?", [id]);
      if (!row) return res.status(404).json({ error: "not_found" });
      return res.json({
        data: {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          role: row.role,
          visibleFields: row.visibleFields ? (JSON.parse(row.visibleFields) as string[]) : null,
          allowedOps: row.allowedOps ? (JSON.parse(row.allowedOps) as string[]) : null,
          createdBy: row.createdBy,
          isActive: !!row.isActive,
          createdAt: row.createdAt,
        },
      });
    }

    params.push(id);
    await run(db, `UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    const row = await get<UserRow>(db, "SELECT id, username, displayName, role, visibleFields, allowedOps, createdBy, isActive, createdAt FROM users WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "not_found" });
    return res.json({
      data: {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        visibleFields: row.visibleFields ? (JSON.parse(row.visibleFields) as string[]) : null,
        allowedOps: row.allowedOps ? (JSON.parse(row.allowedOps) as string[]) : null,
        createdBy: row.createdBy,
        isActive: !!row.isActive,
        createdAt: row.createdAt,
      },
    });
  });

  return r;
}
