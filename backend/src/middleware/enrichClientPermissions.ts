import type { RequestHandler } from "express";
import type { Db } from "../db";
import { get } from "../db";

/**
 * 對 role === 'client' 的使用者，從 DB 重新讀取 allowedOps、visibleFields，
 * 覆寫 token 內的值，確保 admin 修改權限後不需重新登入即可生效。
 */
export function enrichClientPermissions(db: Db): RequestHandler {
  return async (req, _res, next) => {
    const user = req.authUser;
    if (!user || user.role !== "client") return next();

    try {
      const row = await get<{ allowedOps: string | null; visibleFields: string | null }>(
        db,
        "SELECT allowedOps, visibleFields FROM users WHERE id = ? AND isActive = 1",
        [user.id]
      );
      if (!row) {
        // 找不到（已停用或不存在）時清空權限，避免沿用舊 token 導致 403 難以排查
        console.warn("[403] client 查無啟用紀錄，已清空權限", { userId: user.id, username: user.username });
        req.authUser = { ...user, allowedOps: [], visibleFields: undefined };
        return next();
      }

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

      req.authUser = {
        ...user,
        allowedOps,
        visibleFields: visibleFields ?? undefined,
      };
    } catch {
      // 若查詢失敗，保留原 token 權限
    }
    return next();
  };
}
