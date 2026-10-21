# 多多AI客服 - 拼多多AI客服助手

AI 驱动的拼多多多店铺管理系统，支持智能客服对话（售前/售中/售后）、AI 图片生成（文生图/图生图）、多店铺管理。

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Ant Design 5 + Zustand |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite + Prisma ORM |
| AI | Claude / OpenAI GPT / DALL-E |
| 浏览器自动化 | Playwright（接管拼多多商家后台） |

## 项目结构

```
拼多多电商项目/
├── client/          # React 前端 (Vite)
│   └── src/
│       ├── layouts/     # 布局组件
│       ├── pages/       # 页面组件
│       ├── components/  # 可复用组件
│       ├── services/    # Axios API 层
│       ├── stores/      # Zustand 状态管理
│       └── hooks/       # 自定义 Hook
├── server/          # Express 后端
│   ├── prisma/          # 数据库 Schema + 迁移 + Seed
│   └── src/
│       ├── config/      # 环境变量、数据库、CORS
│       ├── middleware/   # 认证、校验、错误处理
│       ├── routes/      # API 路由
│       ├── controllers/ # 请求处理
│       ├── services/    # 业务逻辑（含 AI 服务层）
│       ├── repositories/# Prisma 查询层
│       ├── types/       # 类型定义
│       └── utils/       # JWT、密码、日志
└── .env.example     # 开发环境变量示例
```

## 快速开始

### 前置条件

- Node.js 18+
- npm 9+
- Windows 安装包构建需在 Windows 环境运行

### 1. 配置环境变量

```bash
# 可选：复制示例配置用于本地开发
cp .env.example .env
```

### 2. 初始化数据库

```bash
npm install
npm run db:generate:root
npm run db:migrate
npm run db:seed
```

### 3. 启动开发服务器

```bash
# 在项目根目录
npm run dev

# 或分别启动
npm run dev:server   # 后端 :3001
npm run dev:client   # 前端 :5173
```

### 4. 访问

- 前端: http://localhost:5173
- 后端 API: http://localhost:3001/api
- 数据库管理: `npm run db:studio`

## Windows 安装包

```powershell
npm install
npm run electron:build
```

`electron:build` 会生成 Prisma Client、构建 server/client/companion/electron，检查并准备 `browsers/` 里的 Windows Chromium，然后使用 NSIS 输出安装包。安装包不会携带 `.env`；生产运行时的 JWT、API Key 加密密钥和 Companion WebSocket Token 会在用户数据目录中本机生成，SQLite 数据库与浏览器登录态也写入用户数据目录，避免安装到 Program Files 后资源目录不可写。

### 首次登录

空库首次启动会创建本地账号 `admin@pdd-ai.com`。密码来自环境变量 `SEED_ADMIN_PASSWORD`；未设置时随机生成，并只在服务端日志里打印一次。没有公开的默认密码。已知默认口令、占位符，以及非开发环境下短于 12 位的显式密码会导致进程拒绝启动。

激活页和「联系客服」使用的链接来自构建期变量 `VITE_SUPPORT_CONTACT_URL`（见 `.env.example`）。留空则不展示可点击链接，不要把个人邀请链接写进仓库。

## API 概览

| 路由 | 说明 |
|------|------|
| `POST /api/auth/register` | 注册 |
| `POST /api/auth/login` | 登录 |
| `POST /api/auth/refresh` | 刷新 Token |
| `GET /api/auth/me` | 当前用户 |
| `GET/POST /api/stores` | 店铺列表/创建 |
| `GET /api/stores/:id` | 店铺详情 |
| `POST /api/pdd/stores/:id/connect` | 启动浏览器连接 |
| `POST /api/images/generate` | AI 图片生成 |
| `GET /api/images/history` | 图片生成历史 |
| `GET /api/dashboard/overview` | 仪表盘统计 |
| `GET/PUT /api/settings/providers` | AI 模型配置 |
| `GET/PUT /api/settings/agent-config` | 智能体行为配置 |

## 拼多多接入

本系统通过 **Playwright 浏览器自动化** 接管拼多多商家后台的 WebSocket 连接，实现客户消息的实时收发。拼多多开放平台目前没有公开的客服消息 API。

详见 `companion/` 和 `server/src/services/companion/` 目录。

## License

MIT。版权与许可全文见仓库根目录 [LICENSE](../LICENSE)（Copyright (c) 2026 liuneng581-sudo / 蜂厂长）。
