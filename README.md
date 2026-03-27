# IMS（倉儲管理系統）

本專案是 **React 後台介面 + Node.js API + SQLite** 的倉儲管理系統（本機測試版），可部署到 **自家 Mac mini（固定 IP）** 或 **AWS**。

- **Mac mini（M1 等、24 小時開機）**：見 **`docs/DEPLOYMENT-MAC-MINI.md`**
- **AWS**：見 **`docs/DEPLOYMENT-AWS.md`**

## 功能

- 產品欄位：**編號、客戶名稱、產品名稱、庫存數量、庫位（A-E）、狀態（成品/半成品/不良品）、備註、最後修改日期**
- 後台頁面：列表、搜尋/篩選、分頁、排序、新增/編輯/刪除
- 後端：REST API + SQLite，自動建表

## 本機開發

需求：
- Node.js：目前此專案可在 **Node 16** 運作（你現在的環境），但未來部署建議升到 Node 20+。

第一次安裝：

```bash
npm install
npm install -w frontend
npm install -w backend
```

啟動（前後端一起跑）：

```bash
npm run dev
```

- 前端：`http://localhost:5173`
- 後端：`http://localhost:4000`
- 健康檢查：`http://localhost:4000/healthz`

## 匯入預設產品資料（Excel）

1. 將 **products.xlsx** 或 **products.xls** 放到 **`backend/data/import/`** 資料匣。
2. Excel 第一列為標題，欄位可用中文（編號、客戶名稱、產品名稱、庫存數量、庫位、狀態、備註）或英文（code, customerName, …）。庫位限 A～E，狀態限 成品／半成品／不良品。
3. 執行：在專案根目錄 `npm run import:products`，或 `cd backend && npm run import:products`

詳細格式說明見 **`backend/data/import/README.md`**。

## 環境變數

後端：`backend/.env.example`

前端：`frontend/.env.example`

