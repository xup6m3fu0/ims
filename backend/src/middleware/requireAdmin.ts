import type { RequestHandler } from "express";

/** 僅允許 role === 'admin' */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const user = req.authUser;
  if (!user || user.role !== "admin") {
    console.warn("[403 forbidden] admin only", {
      path: req.path,
      method: req.method,
      userId: user?.id,
      role: user?.role,
      reason: !user ? "no user" : "not admin",
    });
    return res.status(403).json({ error: "forbidden" });
  }
  return next();
};
