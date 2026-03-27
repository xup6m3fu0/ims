/**
 * 權限測試：以 admin 建立「全權限客戶端」，再以該客戶端測試 list/create/update/delete，
 * 並確認回傳資料一律含 id（即使 visibleFields 不含 id）。
 *
 * 執行前請先啟動後端：npm run dev
 * 執行：cd backend && npm run test:permissions
 */

import http from "node:http";

const BASE = process.env.API_BASE || "http://localhost:5175";
const url = new URL(BASE);

const PRODUCT_FIELDS = [
  "id", "code", "customerName", "productName", "quantity", "location", "status", "note", "updatedAt",
];
const PRODUCT_OPS = ["list", "create", "update", "delete"];

let cookieHeader: string = "";

type ApiResponse = { ok: boolean; status: number; body: string; headers: http.IncomingHttpHeaders };

function request(
  path: string,
  options: { method?: string; body?: object } = {}
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const pathWithQuery = path.startsWith("http") ? new URL(path).pathname + new URL(path).search : path;
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: pathWithQuery,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr, "utf8") } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const setCookie = res.headers["set-cookie"];
          if (setCookie) {
            const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
            cookieHeader = arr.map((s) => s.split(";")[0].trim()).join("; ");
          }
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          });
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function fetchApi(path: string, options: { method?: string; body?: object } = {}): Promise<ApiResponse> {
  return request(path, options);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("=== 權限測試開始 ===\n");
  const errors: string[] = [];

  // 1) 登入 admin
  const loginRes = await fetchApi("/api/auth/login", {
    method: "POST",
    body: { username: "admin", password: "86180017" },
  });
  assert(loginRes.ok, `admin 登入失敗: ${loginRes.status}`);
  const loginBody = JSON.parse(loginRes.body);
  assert(loginBody.user?.role === "admin", "登入後應為 admin");
  console.log("1. Admin 登入成功");

  // 2) 建立客戶端（全欄位、全操作）
  const clientUsername = `client_full_${Date.now()}`;
  const createRes = await fetchApi("/api/admin/users", {
    method: "POST",
    body: {
      username: clientUsername,
      password: "test123",
      displayName: "全權限測試客戶端",
      role: "client",
      visibleFields: PRODUCT_FIELDS,
      allowedOps: PRODUCT_OPS,
    },
  });
  if (!createRes.ok) {
    const err = JSON.parse(createRes.body || "{}");
    errors.push(`建立客戶端失敗: ${createRes.status} ${JSON.stringify(err)}`);
  } else {
    console.log("2. 建立全權限客戶端成功:", clientUsername);
  }

  // 3) 登出 admin，改登入客戶端
  await fetchApi("/api/auth/logout", { method: "POST" });
  cookieHeader = "";
  const clientLoginRes = await fetchApi("/api/auth/login", {
    method: "POST",
    body: { username: clientUsername, password: "test123" },
  });
  assert(clientLoginRes.ok, `客戶端登入失敗: ${clientLoginRes.status}`);
  const clientUser = JSON.parse(clientLoginRes.body).user;
  assert(clientUser.role === "client", "應為 client");
  assert(
    Array.isArray(clientUser.allowedOps) && clientUser.allowedOps.includes("list"),
    "allowedOps 應含 list"
  );
  console.log("3. 客戶端登入成功，allowedOps:", clientUser.allowedOps);

  // 4) 客戶端：列表（應有 id）
  const listRes = await fetchApi("/api/products?page=1&pageSize=5");
  if (!listRes.ok) {
    errors.push(`客戶端 GET /api/products 失敗: ${listRes.status}`);
  } else {
    const listData = JSON.parse(listRes.body);
    const rows = listData.data || [];
    if (rows.length > 0 && rows[0].id === undefined) {
      errors.push("客戶端列表回傳資料應一律含 id");
    } else {
      console.log("4. 客戶端列表成功，每筆含 id:", rows.length ? "是" : "無資料");
    }
  }

  // 5) 客戶端：新增
  const createProductRes = await fetchApi("/api/products", {
    method: "POST",
    body: {
      code: `T-${Date.now()}`,
      customerName: "測試客戶",
      productName: "測試產品",
      quantity: 10,
      location: "A",
      status: "成品",
      note: "權限測試",
    },
  });
  if (!createProductRes.ok) {
    errors.push(`客戶端新增產品失敗: ${createProductRes.status} ${createProductRes.body}`);
  } else {
    const created = JSON.parse(createProductRes.body).data;
    assert(created != null && created.id != null, "新增回傳應含 id");
    console.log("5. 客戶端新增產品成功，id:", created.id);

    // 6) 客戶端：編輯
    const updateRes = await fetchApi(`/api/products/${created.id}`, {
      method: "PUT",
      body: { productName: "測試產品-已更新", quantity: 20 },
    });
    if (!updateRes.ok) {
      errors.push(`客戶端編輯產品失敗: ${updateRes.status}`);
    } else {
      console.log("6. 客戶端編輯產品成功");
    }

    // 7) 客戶端：刪除
    const deleteRes = await fetchApi(`/api/products/${created.id}`, { method: "DELETE" });
    if (!deleteRes.ok) {
      errors.push(`客戶端刪除產品失敗: ${deleteRes.status}`);
    } else {
      console.log("7. 客戶端刪除產品成功");
    }
  }

  // 8) 測試 visibleFields 不含 id 時，列表仍回傳 id
  await fetchApi("/api/auth/logout", { method: "POST" });
  cookieHeader = "";
  await fetchApi("/api/auth/login", {
    method: "POST",
    body: { username: "admin", password: "86180017" },
  });
  const fieldsWithoutId = PRODUCT_FIELDS.filter((f) => f !== "id");
  const limitedClient = `client_limited_${Date.now()}`;
  const createLimitedRes = await fetchApi("/api/admin/users", {
    method: "POST",
    body: {
      username: limitedClient,
      password: "test123",
      displayName: "僅部分欄位客戶端",
      role: "client",
      visibleFields: fieldsWithoutId,
      allowedOps: ["list"],
    },
  });
  if (!createLimitedRes.ok) {
    errors.push(`建立有限客戶端失敗: ${createLimitedRes.status}`);
  } else {
    await fetchApi("/api/auth/logout", { method: "POST" });
    cookieHeader = "";
    await fetchApi("/api/auth/login", {
      method: "POST",
      body: { username: limitedClient, password: "test123" },
    });
    const listRes2 = await fetchApi("/api/products?page=1&pageSize=5");
    if (listRes2.ok) {
      const listData2 = JSON.parse(listRes2.body);
      const rows2 = listData2.data || [];
      if (rows2.length > 0 && rows2[0].id === undefined) {
        errors.push("visibleFields 不含 id 時，列表回傳仍應含 id");
      } else {
        console.log("8. 有限欄位客戶端列表回傳含 id: 是");
      }
    }
  }

  console.log("\n=== 權限測試結束 ===");
  if (errors.length > 0) {
    console.error("錯誤：");
    errors.forEach((e) => console.error(" -", e));
    process.exit(1);
  }
  console.log("全部通過。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
