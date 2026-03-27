# 在 Mac mini（M1、固定 IP、24 小時開機）上運行 IMS

本指南說明如何把本專案當成「家中／公司內網伺服器」跑在 Mac mini 上，同區網內用瀏覽器開 `http://<Mac 的 IP>:埠號` 即可使用。

---

## 一、整體概念

1. 在 Mac mini 上安裝 **Node.js**（建議 20 LTS，Apple Silicon 原生版）。
2. 把專案放到固定路徑（例如 `~/ims`），**建置後端 + 前端**，並把前端放到 `backend/public`（與後端同源）。
3. 用 **環境變數** 設定生產環境（JWT、CORS、埠號等）。
4. 用 **launchd**（或 **pm2**）讓程式在開機／登入後自動啟動，並在崩潰時重啟。
5. **系統設定**：避免睡眠、必要時開防火牆埠、路由器上確認固定 IP。

後端預設會綁在 **`0.0.0.0`**（見 `LISTEN_HOST`），同區網其他電腦／手機可用 Mac 的區網 IP 連線。

---

## 二、安裝 Node.js（M1 / Apple Silicon）

擇一即可：

**方式 A：Homebrew**

```bash
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node -v   # 應為 v20.x
```

**方式 B：nvm**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 重新開啟終端機後：
nvm install 20
nvm use 20
```

---

## 三、取得專案並安裝依賴

```bash
cd ~
git clone <你的倉庫網址> ims
# 或將專案資料夾整包複製到 ~/ims

cd ~/ims
npm install
npm install -w frontend
npm install -w backend
```

---

## 四、生產環境建置（一鍵）

在專案根目錄：

```bash
npm run build:prod
```

此指令會：建置後端、建置前端、將 `frontend/dist` 複製到 `backend/public`。

若手動執行，等同：

```bash
npm run build -w backend
npm run build -w frontend
mkdir -p backend/public && cp -r frontend/dist/* backend/public/
```

---

## 五、環境變數（`backend/.env`）

在 `backend` 目錄建立 `.env`（勿提交版控）：

```env
NODE_ENV=production
PORT=5175
LISTEN_HOST=0.0.0.0
DATABASE_PATH=./data/ims.sqlite
JWT_SECRET=請改為至少 32 字元的隨機字串
SEED_DATA=false
```

**CORS**：若只用瀏覽器開 `http://<Mac IP>:5175` 存取（同源），可設：

```env
CORS_ORIGIN=http://<你的 Mac 區網 IP>:5175
```

若之後前面再加反向代理或網域，請把 `CORS_ORIGIN` 改成實際對外網址。

---

## 六、手動啟動測試

```bash
cd ~/ims/backend
npm install --omit=dev
NODE_ENV=production node dist/index.js
```

在 **同一台 Mac** 瀏覽器開：`http://127.0.0.1:5175`  
在 **同區網其他裝置** 開：`http://<Mac 的區網 IP>:5175`（例如 `http://192.168.1.50:5175`）

健康檢查：`http://<IP>:5175/healthz` 應回 `{"ok":true}`。

---

## 七、讓 Mac 適合 24 小時當伺服器

1. **系統設定 → 能源**（或「電池」）：  
   - 關閉或拉長「顯示器關閉」可保留；  
   - **避免整台進入睡眠**（或使用「防止電腦自動進入睡眠」的選項，依 macOS 版本略有不同）。  
2. **網路**：在路由器為這台 Mac **保留 DHCP／固定區網 IP**，方便記住網址。  
3. **防火牆**（若已開啟）：  
   - **系統設定 → 網路 → 防火牆 → 選項**，允許 `node` 接受連入連線，或新增規則開放 **TCP 5175**（或你設定的 `PORT`）。

---

## 八、開機自動啟動（launchd，建議）

以下範例在 **使用者登入後** 啟動服務（適合 Mac mini 設定「自動登入」或開機後有人登入一次）。

### 1. 啟動腳本

專案內已附 **`scripts/start-production.sh`**（會 `cd` 到 `backend` 並執行 `node dist/index.js`）。請先給執行權限並確認 Node 在 PATH 內：

```bash
chmod +x ~/ims/scripts/start-production.sh
```

若 launchd 找不到 `node`，可在 plist 的 `ProgramArguments` 改為直接呼叫 `node` 的絕對路徑（`which node`），或在上列腳本開頭加上 `export PATH="/opt/homebrew/bin:..."`。

### 2. LaunchAgent plist

建立 `~/Library/LaunchAgents/com.local.ims.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.local.ims</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/你的使用者名稱/ims/scripts/start-production.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/你的使用者名稱/ims/backend</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/你的使用者名稱/ims/backend/ims.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/你的使用者名稱/ims/backend/ims.err.log</string>
</dict>
</plist>
```

載入並啟動：

```bash
launchctl load ~/Library/LaunchAgents/com.local.ims.plist
launchctl start com.local.ims
```

查看日誌：`tail -f ~/ims/backend/ims.log`

更新程式後若需重啟：

```bash
launchctl kickstart -k gui/$(id -u)/com.local.ims
```

（若 Label 不同請替換。）

---

## 九、替代方案：pm2

若較習慣 Node 生態的行程管理：

```bash
npm install -g pm2
cd ~/ims/backend
pm2 start dist/index.js --name ims --env production
pm2 save
pm2 startup
```

依 `pm2 startup` 提示完成開機自啟。

---

## 十、更新版本流程

```bash
cd ~/ims
git pull   # 或覆蓋新檔案
npm install
npm install -w frontend -w backend
npm run build:prod
cd backend && npm install --omit=dev
# 再重啟 launchd 或 pm2
```

---

## 十一、備份

SQLite 檔預設在 `backend/data/ims.sqlite`（或你設的 `DATABASE_PATH`）。建議定期複製到另一顆硬碟、NAS 或雲端。

---

## 十二、常見問題

| 狀況 | 處理 |
|------|------|
| 本機可開、別台打不開 | 檢查防火牆、`LISTEN_HOST=0.0.0.0`、是否同 Wi‑Fi／區網 |
| 想改用 80 埠 | `PORT=80` 需管理者權限執行 node，或前面加 **nginx** 反向代理到 5175 |
| 想用 HTTPS | 內網可自簽憑證；有網域可考慮 **Caddy** / **nginx** + Let's Encrypt |

更完整的雲端部署選項見 **`docs/DEPLOYMENT-AWS.md`**。
