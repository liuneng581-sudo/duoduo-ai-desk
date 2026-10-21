# F — license-server（云端激活码签发 + 下载/兑换站）

> 部署：pdd.fxisv.com（nginx 反代到本服务）。Node ESM + express 4 + better-sqlite3。
> 单文件服务，全部逻辑在 `server.mjs` + 两个静态页面。文中部分行号是改启动校验之前的位置，以当前源码为准。
> **核心机密**：`license-private.key`（Ed25519 私钥）只在服务器，绝不进 git/客户端/安装包。

## 1. 目录结构

```
license-server/
├── package.json          # ESM(type:module), start=node server.mjs; 依赖: express, express-rate-limit, better-sqlite3
├── package-lock.json
├── server.mjs            # 唯一入口：签发 API + 静态托管（全部逻辑）
└── public/
    ├── index.html        # 下载页（Win/Mac 下载按钮，读 downloads/latest.json 解析链接）
    ├── redeem.html       # 激活/兑换页（试用 + 超管签发正式授权）
    ├── logo.png, favicon.svg
    └── downloads/         # 运行期由发布流程放入（当前仓库不存在，被 .gitignore 排除）
                           # 安装包(.exe/.dmg) + latest.json + latest.yml/latest-mac.yml 更新源
```

运行期生成但不入 git：`license-private.key`、`data/license.db`（`.gitignore` 已排除 `*.key` / `license-private.*` / `data/` / `*.db*`）。

## 2. 服务结构与启动

- 入口：`server.mjs`，`npm start` → `node server.mjs`。
- 端口/绑定：`PORT` 默认 **4010**，`BIND_HOST` 默认 **127.0.0.1**（`server.mjs:28-29`）——只监听本地，靠 nginx 反代对外。
- `app.set('trust proxy', 1)`（`:104`）——反代后取真实 client IP。
- `express.json({ limit:'16kb' })`（`:105`）——请求体限制。
- 私钥加载：启动时读 `LICENSE_PRIVATE_KEY`（默认同目录 `license-private.key`），不存在则 `process.exit(1)`（`:37-41`）。`crypto.createPrivateKey(...)` 一次性加载到内存。
- DB 初始化：`LICENSE_DB` 默认 `./data/license.db`，WAL 模式，启动建表（`:44-64`）。
- 端口、绑定地址、私钥路径、数据库路径可用环境变量覆盖。超管邮箱和密码**只能**来自 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，源码不提供默认值；缺失或密码过弱时进程在监听前退出。

### 路由表

| 方法 | 路径 | 限流 | 鉴权 | 作用 | 位置 |
|---|---|---|---|---|---|
| POST | `/api/license/trial` | trialLimiter（1h/20次） | 无（靠去重表） | 7天试用，一机一次 | `:112-136` |
| POST | `/api/license/issue` | issueLimiter（15min/30次） | 超管邮箱+密码 | 签发 year(365)/permanent(0) | `:139-172` |
| GET  | `/api/health` | 无 | 无 | 健康检查 | `:174` |
| GET  | `/downloads/*` | — | 无 | 静态：安装包/更新源（Cache-Control:no-cache） | `:177-179` |
| GET  | `/*` | — | 无 | 静态：public/（下载页、兑换页） | `:180` |

限流定义：`:108-109`（trial 1小时20次；issue 15分钟30次，standardHeaders）。

## 3. 授权签发核心

### Ed25519 签名机制（`signLicense`，`:85-91`）
- 签名内容：明文消息 `` `${machineId}:${days}` ``（`:87`）。
- `crypto.sign(null, msg, PRIVATE_KEY)` → 64 字节 Ed25519 签名（`:88`）。
- 追加 2 字节大端 days（`:89`）。
- `base32Encode(sig ++ daysTail)` 后按每 5 字符加 `-` 分组（`base32Encode :68-80`，`groupCode :81-83`，字母表 `:67`）。
- 返回给客户端的就是这个字符串「激活码」。
- **days 语义**：`0`=永久 / `7`=试用 / `365`=一年。
- 客户端验签（无私钥）：`desktop/server/dist/services/license.service.js:99-121` 内嵌**公钥**，`base32Decode` → 若 66 字节按新格式(sig+days)、若 64 字节按旧格式(裸 machineId, 永久)验，`crypto.verify(null, `${machineId}:${days}`, publicKey, sig)`。码绑定本机 machineId，换机失效，完全离线。

### 机器码校验（`validMachineId`，`:97-101`）
- 正则 `^[A-Za-z0-9]{16,64}$`（宽松）。客户端实际是 sha256 截断 32 位大写十六进制。
- 客户端 machineId 生成：`desktop/dist-electron/main.js:392-419`——Win 用注册表 MachineGuid，否则 hostname+MAC+CPU，`sha256('pdd-ai:'+raw).slice(0,32).toUpperCase()`；持久化到 userData/machine-id.txt（`:421-445`，一旦落盘即为准）。

### POST /api/license/trial（`:112-136`）
1. 取 `body.machineId`，`validMachineId` 校验，否则 400（`:114-117`）。
2. 查 `trial_claims` 表（PK=machineId）判重（`:118`）。
3. **已领过** → 409，把**原来的码**再返回（`code`+`alreadyClaimed:true`），不新发（`:119-126`）。
4. 未领 → `signLicense(machineId,7)`，写入 `trial_claims`（含 ip、createdAt），返回 `{code, plan:'trial', days:7}`（`:127-131`）。
- **去重方式**：仅靠 `trial_claims.machineId` 主键。存哪：`data/license.db`。

### POST /api/license/issue（`:139-172`）
1. 取 `machineId, plan, adminEmail, adminPassword`（`:141-142`）。
2. **超管校验**：`safeEqual`（先比长度再 `crypto.timingSafeEqual`，防时序侧信道，`:145-150`）比对 `adminEmail==ADMIN_EMAIL && adminPassword==ADMIN_PASSWORD`，不符 401（`:151-155`）。
3. `validMachineId` 校验（`:156-158`）。
4. plan→days：`year`=365 / `permanent`=0，其他 400（`:159-162`）。
5. `signLicense` 后写 `issued_licenses`（含 issuedBy=adminEmail, ip, createdAt），返回 `{code, plan, days}`（`:164-167`）。
- **超管凭证存哪?**：只来自进程环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，启动时校验通过后留在内存，不入库、也不写在源码里。比对仍用 `safeEqual`。未设置或口令过弱时服务拒绝启动。

## 4. 数据存储（better-sqlite3，`data/license.db`，建表 `:47-64`）

| 表 | 字段 | 说明 |
|---|---|---|
| `trial_claims` | `machineId TEXT PRIMARY KEY, code TEXT, ip TEXT, createdAt TEXT` | 试用去重表，一机一行 |
| `issued_licenses` | `id AUTOINCREMENT, machineId, plan, days, code, issuedBy, ip, createdAt` | 超管签发流水（含操作者邮箱、IP） |

- 不存超管账号（在环境变量/源码）。存已签发的码明文（可用于找回/审计）。
- WAL 模式（`:46`）。

## 5. 静态托管

- `index.html`（下载页）：JS `resolveLinks()`（`index.html:144-159`）fetch `./downloads/latest.json`，读 `j.win`/`j.mac` 拼下载链接；失败兜底固定路径 `多多AI客服-Setup.exe` / `多多AI客服.dmg`（`:142-143`）。
- `redeem.html`（兑换页）：两 Tab——「领取7天试用」调 `/api/license/trial`（`:178-191`）；「兑换正式授权」展开「管理员登录」填邮箱密码 + 选 year/permanent，调 `/api/license/issue`（`:194-210`）。**管理员密码框直接在前端输入，明文经 HTTPS POST 到服务端比对**。
- `downloads/`：运行期由发布流程投放安装包 + `latest.json`（下载页用）+ Tauri/electron-updater 更新源（`latest.yml`/`latest-mac.yml`，被 `Cache-Control:no-cache` 托管，`:177-179`）。当前仓库无此目录（不入 git）。

## 6. 安全隐患清单（重点）

| 级别 | 隐患 | 位置 | 说明 |
|---|---|---|---|
| 🟢 已处理 | **超管口令不再有源码默认值** | `server.mjs` 启动校验 | 未配置 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，或密码过短、是占位符、命中已知弱口令时，进程拒绝启动。生产必须自行注入强密码。历史提交里的旧口令不会随本改动从 git 历史消失，上线前需要在服务器上更换。 |
| 🔴 高 | **私钥泄露面** | `server.mjs:30,37-41` | 私钥文件与代码同目录（默认路径）。`.gitignore` 已排除，但依赖运维不误传、文件权限 600、服务器不被入侵。一旦泄露=授权体系全面崩溃（可离线伪造任意永久码）。备份/日志/误 tar 打包是主要泄露路径。 |
| 🟡 中 | **试用去重可绕过** | `main.js:392-445` + `server.mjs:118` | 去重仅按 machineId。machineId 由客户端本地生成并写 `userData/machine-id.txt`；删除该文件/改 MAC/换主机名/改注册表即得新 machineId → 重新领 7 天。服务端无法验证 machineId 真伪。 |
| 🟡 中 | **机器码可伪造** | `server.mjs:97-101` | 服务端只做格式正则校验（16-64 位字母数字），不验证机器码来自真实设备。攻击者可为任意伪造 machineId 签发码（但码需与目标机 machineId 一致才在客户端生效，实际危害受限于试用滥用）。 |
| 🟡 中 | **无 CORS / 无 CSRF / 无验证码** | 全局 | 未设 CORS 头（同源静态站点默认可用，但 issue 接口无 Origin 校验）；无验证码/人机验证，issue 接口靠密码，trial 接口全开放。 |
| 🟡 中 | **限流按 IP，易被绕过** | `server.mjs` 限流配置 | trial 与 issue 都按来源 IP 计数。更换来源 IP 可以绕过计数，因此超管口令必须足够长，不能只依赖限流。 |
| 🟢 低 | 已做对的点 | `server.mjs:145-150,104,105` | 超管比对用 `timingSafeEqual`（防时序）；`trust proxy` 取真实 IP；body 16kb 限制；签发流水记录 ip/issuedBy 便于审计。 |

### 修复建议（记录）
- 生产通过环境变量注入 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（随机强密码）。当前口令在启动时载入内存后做恒定时间比较；若要降低进程内存泄露面，可以再改为只保存密码哈希。
- 私钥移出代码目录（如 `/etc/pdd/`），600 权限，定期确认不在任何备份/镜像里。
- trial 滥用可结合服务端指纹（IP+UA+设备聚类）或引入手机号/短信验证兜底。
- issue 接口加更严限流 + 失败告警 + 可选 IP 白名单/二次验证。
