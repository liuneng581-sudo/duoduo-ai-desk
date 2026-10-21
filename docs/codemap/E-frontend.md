# 代码地图 E：前端（渲染进程 / SPA）

> 范围：多多AI客服桌面应用的**渲染层**。
> ⚠️ **历史前提（1.0.2 时期）**：当时仓库里的前端曾只剩压缩产物 `desktop/client/dist/assets/index-*.js`（minified，无 sourcemap）。当前仓库已包含可维护的 `desktop/client/src`，构建产物已 gitignore，不要再提交 bundle。
> 本文的**组件树 / 状态管理**基于一份**未纳入本仓库的早期原型 1.0.0**（本地目录 `pdd-companion/src/renderer/`）。
> 1.0.2 的**页面 / 路由 / API / 功能**则是从压缩 bundle 里 grep 出的字符串线索**逆向推断**——结构准确，实现细节不可读。
> 两者架构差异巨大（见第 4 节），阅读时务必区分。

---

## 0. 一句话

前端是 React + AntD5(中文 locale) + TypeScript 的单页应用。**原型 1.0.0** 是个只有「激活 + 仪表盘 + 日志」的瘦客户端，靠 Electron IPC 桥 (`window.pdd`) 跟主进程通信；**发布版 1.0.2** 已进化成完整的「商家智能工作台」——React Router 多路由 SPA，通过 axios (`baseURL:"/api"`) 直连本机 Express server(`127.0.0.1:3001`)，覆盖店铺 / 商品 / 问答 / 对话监控 / 营收 / AI图片生成 / 系统设置 全套后台功能。

---

## 1. 技术栈

| 层 | 原型 1.0.0（可读源码） | 发布版 1.0.2（bundle 推断） |
|---|---|---|
| UI 框架 | React 18 + StrictMode | React（同系，bundle 含 `reactjs.org/docs/error-decoder`） |
| 组件库 | Ant Design 5 + `antd/locale/zh_CN` | 同（bundle 大量 `ant-*` class、`anticon`） |
| 路由 | **无**（单页 if/else 切换 Activate/Dashboard） | **react-router**（`path:"/"` `/stores` `/chat` `/products` `/qa` `/revenue` `/images` `/settings` 等） |
| HTTP | **无 axios**——全走 Electron IPC | **axios**，`baseURL:"/api"`，`.get`×127 `.post`×15 `fetch`×2 |
| 时间 | dayjs | dayjs（bundle 含） |
| 主题 | `theme.ts`：`colorPrimary:#e53e3e`(拼多多红)、`borderRadius:6` | 同色系；额外引入 Google Fonts(Nunito + Noto Sans SC) |
| 构建 | Vite（`main.tsx` 入口） | Vite（`index-*.js` + `index-*.css` 产物指纹） |
| 视觉基调 | Tufte 风、`#FAFAF9` 底、13px、无阴影卡片 | CSS 完全一致（`index-CzdoNgO1.css` 与原型 index.css 同源，多了 table 样式） |

---

## 2. 原型 1.0.0 组件树与职责（唯一可读的前端源）

源码根：早期原型 `pdd-companion/src/renderer/`（本地目录，未纳入本仓库）

```
main.tsx                 挂载 <ConfigProvider theme locale=zhCN><AntApp><App/>
└─ App.tsx               顶层状态机 + 事件订阅（见下）
   ├─ Header.tsx         顶栏：logo + 服务器连接状态 Badge(未连接/连接中/已连接) + 版本号
   ├─ ActivateView.tsx   未授权时显示：输入激活码激活 / 领 7 天试用 / 复制设备码
   ├─ Dashboard.tsx      已授权时显示：控制条 + 店铺状态表 + 运行日志
   │  ├─ LogPanel.tsx    黑底等宽日志滚动区（保留末 500 行，自动贴底）
   │  └─ SettingsModal.tsx  服务器设置弹窗（serverUrl WS / apiBase）
   └─ SetupModal.tsx     首次启动下载运行组件(~150MB Chromium)进度遮罩
```

**各组件职责**
- **App.tsx**（状态中枢）：持有 `init / license / serverState / stores(Map) / logs / setup / loading`。启动流程：`getInit()` → 若有 license 则 `verifyLicense()` 通过才置 license。四路事件订阅：`onLog / onServerState / onStoreStatus / onSetupProgress`。授权与否决定渲染 Dashboard 还是 ActivateView。
- **Header.tsx**：纯展示，`ServerState` → Badge 状态映射。
- **ActivateView.tsx**：`activate(code)` / `claimTrial()`；展示并复制 `deviceId`。授权码格式提示 `YEAR-XXXX-XXXX-XXXX`。
- **Dashboard.tsx**：启动/停止接待按钮（`startCompanion`/`stopCompanion`）；店铺状态表(idle/connecting/needs_login/online/error 五态中文 Tag)；授权类型 Tag(试用/一年/永久) + 到期；服务器设置 / 解除授权入口。
- **LogPanel.tsx** / **SettingsModal.tsx** / **SetupModal.tsx**：如上。

**状态管理**：无 Redux/Zustand，纯 React `useState` + `useCallback`，事件经 preload 回调 push 进 state。单向：main → IPC event → setState → 重渲染。

---

## 3. 前端调用的后端接口清单

### 3.1 原型 1.0.0 —— 不是 HTTP，是 Electron IPC 桥
经 `preload.ts` 暴露为 `window.pdd`（`contextBridge`）。渲染进程**不直接发 HTTP**，全部走 IPC，由主进程代理到远端云服务器。

| `window.pdd` 方法 | IPC channel | 用途 |
|---|---|---|
| `getInit()` | `get-init` | 拉初始数据(config/deviceId/license/version/chromiumReady) |
| `saveConfig(partial)` | `save-config` | 存 serverUrl / apiBase |
| `claimTrial()` | `claim-trial` | 领 7 天试用 |
| `activate(code)` | `activate` | 激活码激活 |
| `verifyLicense()` | `verify-license` | 验签授权 |
| `clearLicense()` | `clear-license` | 解除授权 |
| `ensureChromium()` | `ensure-chromium` | 确保内嵌 Chromium 就绪 |
| `startCompanion()` / `stopCompanion()` | `start/stop-companion` | 启停接待 |
| `openExternal(url)` | `open-external` | 外部打开链接 |
| 事件：`onLog / onServerState / onStoreStatus / onSetupProgress / onUpdateStatus` | `log / server-state / store-status / setup-progress / update-status` | 主进程 push |

> 原型的真实后端是**远端云**：SettingsModal 里默认值 `wss://pdd.fxesaas.com/ws`(WS) + `https://pdd.fxesaas.com/api`。店铺由服务器集中分配下发。

### 3.2 发布版 1.0.2 —— axios REST 直连本机 server（`/api` 前缀）
从 bundle grep 出的 REST 路径（`${...}` 为路径参数）：

**授权 / 会话**
- `POST /api/license/activate`，`GET /api/license/status`
- `/api/login`，`/api/activate`（页面路由 `/activate`）；带 `Authorization` 头(token，localStorage)

**店铺**
- `GET /api/stores`，`GET /api/stores/${id}`
- `/api/pdd/stores/${id}/connect`、`/disconnect`、`/status`（驱动嵌入式店铺浏览器上下线）
- `GET /api/pdd/alerts`，`POST /api/pdd/alerts/${id}/ack`（告警/需处理通知）

**商品知识库**
- `GET/POST /api/stores/${id}/products`，`.../products/${pid}`
- `.../products/import` `/export` `/template` `/sync-from-pdd` `/sync-status`（批量导入导出 + 从拼多多一键抓取全部商品 + 同步状态轮询）

**问答知识库**
- `GET/POST /api/stores/${id}/qa`，`.../qa/${qid}`
- `.../qa/import` `/export` `/template`

**对话监控**
- `GET /api/chat/conversations/${cid}`
- `POST /api/chat/conversations/${cid}/reply`（人工介入回复）

**门店数据 / 营收**
- `GET /api/dashboard/overview`
- `GET /api/dashboard/stores/${id}/summary`、`.../revenue`（今日营收 / 订单，实时从拼多多拉）

**AI 图片生成**
- `GET/POST /api/images`，`GET /api/images/${id}`，`GET /api/images/history`（文生图 / 图生图，模型见 `gpt-image-1`）

**系统设置**
- `GET/POST /api/settings/providers`，`.../providers/${id}`，`POST /api/settings/providers/test`（AI 模型 Provider CRUD + 连通测试；见 `moonshot-v1-8k`、`api.moonshot.cn/v1`、`openai`）
- `POST /api/settings/agent-config`（客服行为配置：默认模型 / prompt / 对抗场景转人工）
- `POST /api/settings/test-feishu`（飞书群通知 webhook 测试，字段 `feishuWebhookUrl`）

> 1.0.2 前端不再连远端 WS；主进程把 SPA 从 `http://localhost:3001/` 加载，axios `/api` 打到同源本机 Express。见 A-main.md。

---

## 4. 1.0.2 相比原型 1.0.0 新增的功能 / 页面（推断）

原型只有 **激活 + 仪表盘(店铺状态表 + 日志) + 服务器设置**。1.0.2 是一整套后台，新增：

| 新页面 / 功能 | 路由 | 佐证字符串 |
|---|---|---|
| **店铺管理**（列表 + 详情 + 增删改 + 切换 + 在线/离线/需登录/需验证状态） | `/stores` `/stores/:id` | 「添加店铺」「编辑店铺」「切换店铺」「多店统一管理」「店铺浏览器需在桌面应用内运行」 |
| **商品知识库**（增删改 + 批量导入导出 + 模板 + 从拼多多抓取 + 同步状态） | `/stores/:id/products` `/products` | 「商品知识库」「一键抓取商品」「从拼多多抓取全部商品」「批量导入」「下载模板」 |
| **问答知识库**（增删改 + 导入导出 + 模板） | `/stores/:id/qa` `/qa` | 「问答知识库」「添加问答」「编辑问答」 |
| **对话监控**（会话时间线 + 详情 + 人工介入回复 + 待人工/需关注筛选） | `/chat` | 「对话监控」「对话时间线」「对话详情」「待人工」「暂无对话」`/chat/.../reply` |
| **门店数据 / 营收看板**（今日订单/营收/对话数，实时拉拼多多） | `/revenue` `/stores/:id/revenue` | 「门店数据」「店铺概览」「今日营收」「今日订单」「实时从拼多多拉取今日营收与订单」 |
| **AI 商品图片生成**（文生图 / 图生图 + 历史） | `/images` `/images/history` | 「图片生成」「文生图」「图生图」「商品图片生成」「生成历史」「gpt-image-1」 |
| **系统设置**（AI Provider 管理 + 客服行为配置 + 飞书通知） | `/settings` | 「系统设置」「AI 模型 Provider」「客服行为配置」「对抗场景转人工」「飞书群通知」`/settings/providers` `/settings/agent-config` `/settings/test-feishu` |
| **登录 / 授权体系** | `/login` `/activate` | 从「设备码+远端验签」变为本地 `token`(Authorization 头) + `/api/license/*` |
| **告警/通知中心** | （组件级） | 「需关注」「暂无需要处理的通知」`/api/pdd/alerts` |

**架构级演进（最关键）**：
- 通信从 **Electron IPC 桥 (`window.pdd`)** → **axios HTTP REST (`/api`)**。
- 后端从 **远端云 WS 集中调度** → **本机 Express + SQLite 一体化**（client+server+companion 全打进一个 app，见 README / A-main.md）。
- 拼多多接入从「服务器分配店铺」→「本机嵌入式 Chromium(WebContentsView 加载 mms.pinduoduo.com) + companion CDP 反向驱动」。
- 授权从远端 activate/trial API → **Ed25519 离线一机一码**（server 验签）。

---

## 5. 风险与建议

**风险（高）**：**1.0.2 的前端源码彻底缺失**——`desktop/client/` 仅有 `dist/` 压缩产物，无 `.tsx`/`.ts` 源、无 sourcemap。这意味着：

- **无法直接改任何前端 bug 或加功能**：minified bundle 不可维护（变量名 `e/t/n/x`，逻辑不可读）。
- README 自述「此前源码丢失过一次，务必备份」，前端这块**仍处于丢失状态**，是当前工程最大的单点缺口。

**建议（按优先级）**：
1. **先补前端源码再动前端**（历史建议，当前仓库已有 `desktop/client/src`）：向作者或编译环境找回 1.0.2 client 的原始 TS 工程；找不到就以原型 `pdd-companion/src/renderer/` 为骨架，照本文第 3.2/第 4 节的路由 + API 清单**重建**（AntD5 + react-router + axios，`baseURL:"/api"`，接口契约已在本文列全）。
2. **重建时对齐后端契约**：所有 `/api/*` 路径、路径参数、导入导出/同步/告警/图片生成端点均见第 3.2 节；配合 server 端 codemap 校验请求/响应结构。
3. **建源码备份纪律**：重建后立即推 git（含 client 源），杜绝再次「只剩 dist」。
4. **短期止血**：若只需微调文案/样式，可临时改 `dist/assets/index-*.css`（如 `index-CzdoNgO1.css`）与静态资源，但**逻辑改动必须走源码重建**，不要碰 minified JS。

---

## 附：关键文件位置索引

- 原型可读源（组件树基准，未纳入本仓库）：`pdd-companion/src/renderer/`（App.tsx / main.tsx / theme.ts / api.d.ts / components/*）
- 原型 IPC 契约（未纳入本仓库）：`pdd-companion/src/preload.ts`
- 1.0.2 时期的前端构建产物（历史，不应再提交）：`desktop/client/dist/assets/index-*.js` + `index-*.css`；入口 `dist/index.html`
- 相关：主进程加载/API 编排见 `docs/codemap/A-main.md`
