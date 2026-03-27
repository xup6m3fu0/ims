# IMS 部署至 AWS 指南

本專案為 **React 前端 + Node.js (Express) 後端 + SQLite**，以下說明適合的 AWS 方案與部署流程。

---

## 一、適合的部署方案比較

| 方案 | 適用情境 | 優點 | 注意 |
|------|----------|------|------|
| **A. 單機部署（Lightsail / EC2）** | 中小型、內部或少量使用者 | 成本低、設定簡單、一個實例跑前後端與 SQLite | SQLite 僅適合單機；需自行備份資料庫 |
| **B. Elastic Beanstalk (Node.js)** | 希望由 AWS 管理運行環境與擴縮 | 免管 OS、一鍵部署、可掛 ALB 做 HTTPS | 仍建議單實例 + SQLite，多實例需改為 RDS |
| **C. 前後端分離（S3 + EC2/EB）** | 想將前端 CDN 化、後端獨立擴展 | 前端走 CloudFront 快、後端可單獨擴展 | 需設定 CORS、兩邊各自部署 |

**建議**：若為內部或中小型使用，優先採用 **方案 A（單機）** 或 **方案 B（Elastic Beanstalk）**，後端同時提供 API 與前端靜態檔，部署單元單一、流程簡單。

---

## 二、推薦：單機部署流程（Lightsail 或 EC2）

整體流程：在 **一台** Linux 主機上跑 Node.js，對外提供 API 與前端靜態檔，SQLite 放在本機磁碟並定期備份。

### 2.1 前置準備

- 本機已安裝 Node.js 18+（建議 20+）
- 擁有 AWS 帳號，可建立 Lightsail 實例或 EC2

### 2.2 在 AWS 建立主機

**Lightsail（較簡單）**

1. 進入 [Lightsail](https://lightsail.aws.amazon.com/) → 建立實例
2. 選擇 **Linux**、**Node.js** 或一般 **OS Only** 即可
3. 選方案（例如 $5/月 起）
4. 建立後記下 **公開 IP**，並在「網路」頁籤開放 **80、443、22**

**EC2**

1. 啟動 **Amazon Linux 2023** 或 **Ubuntu 22.04** 實例
2. 安全群組開放：**22 (SSH)、80 (HTTP)、443 (HTTPS)**
3. 若有固定網域，可綁定 **Elastic IP**

### 2.3 主機環境設定（以 Ubuntu 為例）

SSH 登入後：

```bash
# 安裝 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 確認
node -v   # v20.x
npm -v
```

### 2.4 專案建置與上傳

在本機專案根目錄：

```bash
# 建置後端（產出 backend/dist）
npm run build -w backend

# 建置前端（同源部署時 API 會走同一網域，不需設 VITE_API_BASE）
cd frontend && npm run build && cd ..

# 將前端建置結果放到後端 public，供生產環境同源提供
mkdir -p backend/public && cp -r frontend/dist/* backend/public/

# 打包（到伺服器後在 backend 目錄執行 npm install --omit=dev）
tar -czvf ims-deploy.tar.gz backend/dist backend/public backend/package.json
```

上傳到主機（替換成你的 IP 與路徑）：

```bash
scp ims-deploy.tar.gz ubuntu@<主機IP>:~/
```

### 2.5 伺服器上解壓與安裝

SSH 登入主機後：

```bash
mkdir -p ~/ims && cd ~/ims
tar -xzvf ~/ims-deploy.tar.gz

# 建立資料庫目錄（若打包時未含 data）
mkdir -p backend/data

# 只裝後端依賴（後端會一併提供前端靜態檔）
cd backend && npm install --omit=dev && cd ..
```

### 2.6 環境變數

在 `~/ims/backend` 建立 `.env`（勿提交到版控）：

```bash
cd ~/ims/backend
nano .env
```

內容範例（**生產環境務必改 JWT_SECRET**）：

```env
NODE_ENV=production
PORT=4000
DATABASE_PATH=./data/ims.sqlite
CORS_ORIGIN=https://你的網域或留空表示同源
JWT_SECRET=請使用至少 32 字元隨機字串
SEED_DATA=false
```

若前端與後端同域（由後端提供靜態檔），`CORS_ORIGIN` 可留空或設為 `https://你的網域`。

### 2.7 啟動方式一：直接執行（測試用）

```bash
cd ~/ims/backend
node dist/index.js
```

此時 API 在 `http://<主機IP>:4000`。若已設定後端提供靜態檔，同機訪問 `http://<主機IP>:4000` 即可看到前端。

### 2.8 啟動方式二：用 systemd 常駐（建議）

```bash
sudo nano /etc/systemd/system/ims.service
```

內容（路徑請依實際修改）：

```ini
[Unit]
Description=IMS Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ims/backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

啟用並啟動：

```bash
sudo systemctl daemon-reload
sudo systemctl enable ims
sudo systemctl start ims
sudo systemctl status ims
```

### 2.9 對外 80/443（Nginx 反向代理，可選）

若要對外使用 80/443 並掛 HTTPS，可裝 Nginx 做反向代理：

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/ims
```

範例（改為你的網域或 IP）：

```nginx
server {
    listen 80;
    server_name 你的網域或主機IP;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

啟用站點並重載：

```bash
sudo ln -s /etc/nginx/sites-available/ims /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS 可用 **Let's Encrypt**（例如 `certbot`）或 AWS **ALB + ACM** 發憑證。

### 2.10 資料庫與備份

- SQLite 檔位於 `backend/data/ims.sqlite`（可由 `DATABASE_PATH` 指定）
- 建議定期備份該檔（例如 cron 每日複製到 S3 或另一台機）：

```bash
# 範例：每日備份到 home
0 2 * * * cp /home/ubuntu/ims/backend/data/ims.sqlite /home/ubuntu/backups/ims-$(date +\%Y\%m\%d).sqlite
```

---

## 三、後端提供前端靜態檔（同源部署）說明

本專案後端已支援：

- 當 `NODE_ENV=production` 且存在 **`backend/public`** 目錄時，會以該目錄作為靜態檔根目錄，並對非 `/api` 的 GET 請求回傳 `index.html`（SPA fallback）。
- 建置與部署時請將 **`frontend/dist` 內容複製到 `backend/public`**（見 2.4 節指令），打包時一併包含 `backend/public`。
- 此種部署下前端與 API 同源，不需設定 `VITE_API_BASE`；請將 `CORS_ORIGIN` 設為對外網址（例如 `https://你的網域`）。

---

## 四、使用 Elastic Beanstalk 的簡要流程

1. 在專案根目錄建好 **單一可部署包**：內含 `backend/`（含 `dist`、`package.json`）與 `frontend/dist`（或後端指向的靜態目錄）。
2. Elastic Beanstalk 建立 **Node.js** 平台應用與環境。
3. 設定環境變數：`NODE_ENV`、`PORT`、`DATABASE_PATH`、`JWT_SECRET`、`CORS_ORIGIN`、`SEED_DATA` 等（在 EB 主控台或 `.env` 注入）。
4. 部署方式二選一：
   - **上傳 zip**：將上述部署包壓成 zip，在 EB 上傳並部署。
   - **CI/CD**：用 **CodePipeline** 從 GitHub 拉程式、建置、再部署到 EB。
5. **重要**：EB 預設可能多實例，SQLite 不共用；若維持 SQLite，請將環境設為 **單一實例**，並使用 **EB 提供的本機儲存** 或掛載 EFS，讓 `data/ims.sqlite` 寫在同一位置。

---

## 五、若未來要「多實例」或高可用

- 將 **SQLite 改為 RDS（例如 PostgreSQL 或 MySQL）**，並修改後端使用該資料庫。
- 前端可改為部署在 **S3 + CloudFront**，後端放在 **EC2 多台 + ALB** 或 **ECS/Fargate**，由 ALB 做負載平衡與 HTTPS。

---

## 六、部署檢查清單

- [ ] 本機執行 `npm run build`（後端 + 前端）無誤
- [ ] 生產環境設定 `JWT_SECRET`、`CORS_ORIGIN`（或同源）
- [ ] `SEED_DATA=false`，避免覆寫既有資料
- [ ] 主機防火牆/安全群組開放 80、443（及 22 僅限管理用）
- [ ] SQLite 目錄存在且可寫入（`backend/data`）
- [ ] 使用 systemd 或 process manager 常駐後端
- [ ] 安排 SQLite 定期備份

以上流程可依實際網域、憑證與 CI/CD 工具再細調。
