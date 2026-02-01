# 🍱 團隊訂餐分帳系統

一個簡單的網頁應用，幫助團隊記錄訂餐、追蹤墊付，並計算結算金額。

## 功能

- 📝 **記錄訂餐** — 今天訂哪家店、誰吃了什麼、價格多少
- 💰 **追蹤墊付** — 記錄誰先幫大家付錢
- 💸 **自動結算** — 計算誰該給誰多少錢
- 👥 **成員管理** — 自動記錄團隊成員
- 📅 **資料保存** — 保留六個月的歷史記錄

## 使用方式

### 本地運行

```bash
npm install
npm start
```

然後打開 http://localhost:3000

### 部署到 Railway

1. 將程式碼上傳到 GitHub
2. 到 [Railway](https://railway.app) 建立新專案
3. 連結 GitHub repo
4. 自動部署完成！

## 技術架構

- **前端**：原生 HTML/CSS/JavaScript（手機友善）
- **後端**：Node.js + Express
- **資料庫**：SQLite（better-sqlite3）

## API

### 場次
- `GET /api/meals` — 取得所有場次
- `POST /api/meals` — 新增場次
- `GET /api/meals/:id` — 取得場次詳情
- `DELETE /api/meals/:id` — 刪除場次
- `POST /api/meals/:id/settle` — 標記已結算

### 品項
- `POST /api/meals/:id/items` — 新增品項
- `DELETE /api/items/:id` — 刪除品項

### 墊付
- `POST /api/meals/:id/payments` — 新增墊付
- `DELETE /api/payments/:id` — 刪除墊付

### 結算
- `GET /api/settle` — 計算結算金額

### 成員
- `GET /api/members` — 取得所有成員
- `POST /api/members` — 新增成員
- `DELETE /api/members/:id` — 刪除成員

## 授權

MIT
