# 多多AI客服 (DuoDuo AI Customer Service)

拼多多多店铺 AI 客服桌面应用 + 云端授权签发/下载站。

> ⚠️ 此前源码丢失过一次（未备份、未推 git）。本仓库即为逆向重建 + 改进后的完整工程，**务必保持同步备份**。

## 仓库结构

```
desktop/         # Electron 桌面客户端（Win + Mac）
license-server/  # 云端激活码签发服务 + 下载页 + 兑换页（部署在 pdd.fxesaas.com）
```

## 架构概览

**desktop/** — 单体 Electron 应用，client + server + companion 全打进一个 app，整套跑在商家本机：
- 启动时本地起 Express server（`127.0.0.1:3001`），DB = 本地 SQLite（userData，首次从 `template-empty.db` 复制）。
- companion 用 Playwright `connectOverCDP` 驱动 app 自带 Chromium 内嵌的拼多多商家后台页面（不另开浏览器），拦截聊天做 AI 自动回复。
- server/companion 子进程用 **Electron-as-Node**（`process.execPath` + `ELECTRON_RUN_AS_NODE=1`）拉起，跨平台、不需 bundle node 二进制。
- 授权 = **Ed25519 离线签名一机一码**：客户端只持公钥，验签 `${machineId}:${days}` 的签名（days=0 永久 / 7 试用 / 365 一年）。
- 在线更新 = electron-updater，generic 源指向 `https://pdd.fxesaas.com/downloads/`。

**license-server/** — Node ESM + express + better-sqlite3：
- `POST /api/license/trial {machineId}` — 7 天试用，一机一次去重。
- `POST /api/license/issue {machineId, plan, adminEmail, adminPassword}` — 超管签发 year/permanent。
- 静态托管下载页 / 兑换页 / 安装包与更新源。
- **私钥 `license-private.key` 只放服务器，绝不进客户端 / git / 安装包。**

## 构建桌面端

```bash
cd desktop
npm install                 # 装 electron / electron-builder / electron-updater
cd server && npm install && npx prisma generate && cd ..
# Mac (本机 arm64):
npm run pack:mac            # → release/*.dmg + *.zip + latest-mac.yml
# Windows (在 Windows 真机):
npm run pack:win            # → release/*.exe + latest.yml
```

> electron 二进制若 npmmirror 下不全，从 `~/Library/Caches/electron`（Mac）/ `%LOCALAPPDATA%\electron\Cache`（Win）手动解压对应平台 zip 进 `node_modules/electron/dist` 并写 `path.txt`。

## 部署 license-server（pdd.fxesaas.com）

PM2 跑在 `127.0.0.1:4010`，nginx 反代 `/api/` → 4010、`/downloads/` 静态、Let's Encrypt SSL。
私钥单独放到服务器（600 权限），**不要**提交到 git。

超管凭证只通过环境变量注入，源码里没有默认邮箱或密码。`ADMIN_PASSWORD` 未设置、短于 12 位、是占位符，或命中已知弱口令时，进程会直接退出。变量说明见 [`license-server/.env.example`](license-server/.env.example)：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ADMIN_EMAIL` | 是 | 超管邮箱 |
| `ADMIN_PASSWORD` | 是 | 至少 12 位的随机强密码 |
| `PORT` | 否 | 默认 `4010` |
| `BIND_HOST` | 否 | 默认 `127.0.0.1` |
| `LICENSE_PRIVATE_KEY` | 否 | 默认 `./license-private.key` |
| `LICENSE_DB` | 否 | 默认 `./data/license.db` |

`server.mjs` 只读进程环境变量，不会自动加载 `.env`。用 PM2 / systemd 注入，或在启动前 `set -a && source .env && set +a`。真实密码不要写入仓库。

桌面端本地账号与客服链接的环境变量见 [`desktop/.env.example`](desktop/.env.example)。`SEED_ADMIN_PASSWORD` 留空则首次启动随机生成；没有公开默认密码。客服链接用 `VITE_SUPPORT_CONTACT_URL`，留空则界面不展示个人邀请链接。

不签名：下载页含 Windows SmartScreen / macOS Gatekeeper 绕过说明。

## 开源协议

本仓库以 [MIT License](LICENSE) 发布。Copyright (c) 2026 liuneng581-sudo / 蜂厂长。
