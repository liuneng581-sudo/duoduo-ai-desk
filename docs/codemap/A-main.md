# 代码地图 A：Electron 主进程层（main.js + preload.js）

> 范围：`desktop/dist-electron/main.js`（899 行，tsc 产物）与 `desktop/dist-electron/preload.js`（34 行）。
> 本文件行号均指编译后的 JS。

---

## 0. 模块职责总览

主进程是整个「多多AI客服」桌面应用的编排层，负责：

1. 拉起本地 **Express server**（`127.0.0.1:3001`），用 Electron-as-Node 跑（`process.execPath` + `ELECTRON_RUN_AS_NODE=1`）。
2. 拉起 **companion 子进程**（Playwright 自动化 PDD 后台，同样 Electron-as-Node）。
3. 开 **BrowserWindow** 加载前端 SPA（生产从 `http://localhost:3001/` 加载，dev 从 Vite `:5173`）。
4. 管理**嵌入式店铺浏览器视图**（`WebContentsView`，加载 `mms.pinduoduo.com`），companion 通过 CDP 反向驱动它。
5. 生成/持久化**机器码**（machineId），把它作为环境变量传给 server 做授权验签（**验签本体不在主进程**）。
6. 生成/持久化**运行时密钥**（JWT/加密/companion WS token）。
7. **electron-updater** 自动更新（源 `pdd.fxisv.com/downloads/`）。
8. 托盘、单实例锁、窗口硬化（CSP/导航白名单/window-open 拦截）。

**关键认知**：任务背景提到的 Ed25519 离线授权验签（验 `${machineId}:${days}`、客户端只存公钥）**并不在 main.js 里**。主进程只做「取机器码 + 通过 `MACHINE_ID` 环境变量交给 server」。真正的公钥/验签逻辑在 **server 端**（见「授权」章节）。

---

## 1. 应用启动完整时序

入口：`app.whenReady().then(...)`，**main.js:840**。

| 步 | 动作 | 函数 | 行号 |
|---|---|---|---|
| 0 | **模块加载即执行**：随机 CDP 端口 `9000+rand(1000)`，`appendSwitch('remote-debugging-port'...)` + `remote-debugging-address 127.0.0.1`。必须在 ready 前设。 | 顶层 | 74–76 |
| 1 | app ready 触发 | `whenReady().then` | 840 |
| 2 | `await startServer()` — 起 Express（生产 spawn Electron-as-Node 跑 `server/dist/index.js`）；等 stdout 出现 `running`/`3001` 或 15s 超时 | `startServer` | 447 / 调用点 845 |
| 3 | `startCompanion()` — server ready 后起 companion | `startCompanion` | 532 / 调用点 848 |
| 4 | `registerStoreViewIpc()` — **注册 IPC，必须在建窗前**（preload 一加载就 `sendSync('app:is-packaged')`，handler 没注册好则店铺视图连线退化） | `registerStoreViewIpc` | 321 / 调用点 858 |
| 5 | `createWindow()` — 建主窗口 + 硬化 + 加载前端 | `createWindow` | 618 / 调用点 859 |
| 6 | `createTray()` — 托盘 | `createTray` | 783 / 调用点 860 |
| 7 | `setupAutoUpdater()` — 起更新检查 | `setupAutoUpdater` | 802 / 调用点 861 |

**注意时序漏洞**：`startServer()` 失败时只 `console.error`（851–853），**不 return、不退出**，继续往下建窗；建窗里 `tryLoad(10)` 重试 10 次（约 10s）后弹「启动失败」框（722–768）。授权检查**不在此时序里**——授权是 server 内部逻辑，前端加载后由 API 触发。

前端加载逻辑（`createWindow` 内，710–769）：
- dev：`loadURL('http://localhost:5173')` + 自动开 DevTools。
- 生产：`http.get('http://localhost:3001/')` 探活，200 才 `loadURL`；否则重试；耗尽后弹错误框 + data: URL 内联日志页。
- **为何走 localhost 而非 file://**：让前端 `/api` 请求同源解析（注释 711–713）。

---

## 2. 子进程管理

### 2.1 Server（`startServer` main.js:447–530，返回 Promise）

- **dev**：`spawn('npx', ['tsx','src/index.ts'])`，cwd=`SERVER_DIR`。
- **生产**：`spawn(process.execPath, [serverJs])`，`serverJs = <resources>/server/dist/index.js`，cwd=`<resources>/server`。
- **环境变量**（495）：`ELECTRON_RUN_AS_NODE=1` + `...getRuntimeSecrets()`（4 个密钥）+ `MACHINE_ID` + `PORT=3001` + `NODE_ENV=production` + `DATABASE_URL`（`file:` URL，见 122–144）。
- **启动判定**：stdout 命中字符串 `running` 或 `3001` → resolve；**15s 超时** kill + reject（499–505）。
- **崩溃处理**：`on('exit')` 只把 `serverStarted=false`（521–524）——**server 不自动重启**（对比 companion 会重启）。
- **日志**：stdout→`[server:out]`、stderr→`[server:err]`，全进 `logToFile`。

### 2.2 Companion（`startCompanion` main.js:532–616，无返回值）

- 进入先 kill 旧的（533–536）。
- **生产**：`spawn(process.execPath, [companionEntry])`，`companionEntry=<resources>/companion/index.js`；文件不存在则 log 后 `return`（551–554）。
- **dev**：`spawn('npx',['tsx','index.ts'])`。
- **环境变量**（558–574）：`ELECTRON_RUN_AS_NODE=1`、`NODE_PATH=<resources>/server/node_modules`（复用 server 依赖）、`SERVER_URL=ws://127.0.0.1:3001/ws`（**显式 IPv4**，注释解释 Windows `localhost`→`::1` 会 ECONNREFUSED，563–567）、`PLAYWRIGHT_BROWSERS_PATH`、`PDD_USER_DATA_DIR`、`COMPANION_WS_TOKEN`、`COMPANION_CDP_URL=http://127.0.0.1:${CDP_PORT}`（反向驱动 in-app 视图）。
- **崩溃重启**：`on('exit')` 5s 后重启，**但仅当 `serverStarted` 为 true**（603–611）。
- **日志**：`[companion]` / `[companion:err]`。

### 2.3 关闭（`before-quit` main.js:873–884）

`destroyAllStoreViews()` → kill companion → kill server。用 `.kill()`（SIGTERM），无 force-kill 兜底。

---

## 3. IPC 通道清单

### ipcMain 端（`registerStoreViewIpc` main.js:321–344）

| 通道 | 类型 | 作用 | 行号 |
|---|---|---|---|
| `app:is-packaged` | `on`（sync，`e.returnValue`） | 给 sandboxed preload 同步取 isPackaged | 323–326 |
| `preload:loaded` | `on` | 诊断：证明 preload 已执行 | 327 |
| `store-view:create` | `handle` | 建店铺 WebContentsView（校验 storeId 为非空 string） | 328–334 |
| `store-view:set-bounds` | `handle` | 定位视图到前端容器矩形 | 335–340 |
| `store-view:show` | `handle` | 显示指定 store 视图（隐藏其它） | 341 |
| `store-view:hide` | `handle` | 隐藏 | 342 |
| `store-view:close` | `handle` | 关闭 + 清 crash 计数 | 343 |

共 **7 个通道**（2 个 `on` + 5 个 `handle`）。全部围绕嵌入式店铺视图；**没有**授权/更新/文件系统相关的 IPC。

### preload 暴露（`contextBridge.exposeInMainWorld('electronAPI', ...)` preload.js:20–34）

```
window.electronAPI = {
  platform,            // process.platform
  isPackaged,          // 经 sendSync('app:is-packaged') 取得
  storeView: { create, setBounds, show, hide, close }  // 对应上表 5 个 handle
}
```

preload 自身 sandboxed，故 `require('electron').app` 是 undefined——注释（preload.js:10–13）明确警告：碰 `app.isPackaged` 会抛错、中断整个 preload、导致 `window.electronAPI` 未定义 → 店铺视图建不出 → 白屏。所以走 sync IPC 拿 isPackaged。

---

## 4. 授权 / 激活

**主进程只负责机器码，验签在 server。**

- **取机器码**：`getMachineId()`（421–445）→ 先读 `userData/machine-id.txt`（≥16 字符即用），否则 `deriveMachineId()`（392–420）：
  - Windows：`reg query HKLM\SOFTWARE\Microsoft\Cryptography /v MachineGuid`，SHA256(`pdd-ai:`+guid) 取前 32 hex 大写（394–403）。
  - 通用回退：`SHA256('pdd-ai:'+hostname|firstNonInternalMAC|cpuModel)` 前 32 大写（404–419）。
  - 持久化到 `machine-id.txt`（mode 0600）。
- **传递**：`MACHINE_ID` 环境变量注入 server（455 dev / 495 生产）。
- **验签本体（Ed25519 / 公钥 / `${machineId}:${days}` / 试用·永久·年费 判定 / 失败处理）不在 main.js**。前端加载后由 server 的 `/api` 授权接口处理。**要查授权 bug 须看 server 端代码，不是本文件。**

---

## 5. 自动更新（`setupAutoUpdater` main.js:802–838）

- 仅 packaged 生效（803–806）；lazy `require('electron-updater')`，缺依赖只 log 不崩（807–813）。
- 配置：`autoDownload=true`、`autoInstallOnAppQuit=true`、logger 走 logToFile（814–816）。
- **更新源**：注释说在 `electron-builder.yml → app-update.yml` 里配 generic provider 指向 `pdd.fxisv.com/downloads/`（798–801）。**URL 本身不在 main.js**，在打包配置里。
- 事件监听齐全（checking / available / not-available / error / download-progress / downloaded）。
- `update-downloaded`（822–836）：弹「立即重启更新 / 稍后」对话框；选 0 → `quitAndInstall()`；否则退出时装。
- 启动即 `checkForUpdates()`（837）。
- **签名校验**：electron-updater 内建（依 latest.yml 里的 sha512），main.js 未额外做校验。

---

## 6. 窗口 / 托盘 / 单实例 / 协议 等杂项

- **窗口硬化**（createWindow 内）：
  - `setWindowOpenHandler`：http(s) 走 `shell.openExternal`，一律 deny 新窗口（636–641）。
  - `will-navigate`：只放行 `localhost:3001|5173` 与 `data:`（643–647）。
  - 生产 CSP：`onHeadersReceived` 仅对 app 自身 origin（localhost SPA）注入严格 CSP；PDD 视图请求放行（否则白屏）（650–678）。
  - ready 兜底：30s 未 ready 也强制 show（688–695）；`did-fail-load` 显示内联错误页（697–709）。
- **店铺视图**（createStoreView 194–273 等）：`partition: persist:store-${storeId}`、`sandbox:true`、伪装 desktop Chrome UA（`desktopChromeUA` 175–178）、注入反检测 JS（`ANTI_DETECT_JS` 182–193）、`did-fail-load` 3s 后重载、`render-process-gone` 指数退避重建（上限 `MAX_VIEW_REBUILDS=5`，250）。
- **托盘**（createTray 783–796）：256→16px，菜单「显示主窗口 / 退出」，双击显示。
- **单实例**（886–899）：`requestSingleInstanceLock()`，抢不到即 quit；`second-instance` 时恢复+聚焦主窗口。
- **协议注册**：无自定义 protocol / deep-link 注册。
- **window-all-closed**（867–872）：**空实现**——非 macOS 分支只有注释「minimize to tray」，实际什么都没做（见可疑点）。
- **运行时密钥**（getRuntimeSecrets 362–384）：读/生成 `userData/runtime-secrets.json`（mode 0600），4 个 32 字节 hex 密钥。
- **日志**（logToFile 102–118）：写 `userData/duoduo-server.log`，>5MB 轮转到 `.old`；catch 全部吞掉。
- **DB**（getDatabasePath 122–141）：生产首启把 `template-empty.db` 拷到 `userData/data/pdd-ai-manager.db`。

---

## 7. 可疑点 / 技术债 / bug 隐患

| # | 位置 | 问题 |
|---|---|---|
| S1 | main.js:867–872 | `window-all-closed` **空实现**：非 macOS 分支只有注释「minimize to tray」，实际没有 `e.preventDefault()` 也没 hide。真关掉所有窗口后行为依赖默认——Windows 上可能直接退出/进程残留，与「常驻托盘」设计不符。**最可疑。** |
| S2 | main.js:468, 509 | Server 就绪判定靠 stdout **字符串匹配 `running`/`3001`**。脆弱：日志文案一改就永远超时；任意含「3001」的行（如错误信息）会误判已就绪。 |
| S3 | main.js:521–524 | **Server 崩溃不重启**（只置 `serverStarted=false`）。而 companion 崩会重启且依赖 `serverStarted`；server 挂了之后 companion 也会因 5s 检查 `serverStarted=false` 而停摆——server 无自愈=整机瘫。 |
| S4 | 全局 PORT=3001 硬编码（455/495/567/587/644/670/722…） | **端口 3001 与 CSP/导航白名单/WS URL 全硬编码**，无占用检测、无回退端口。3001 被占则启动失败且无提示路径。CDP 端口虽随机（74），但 3001 不是。 |
| S5 | main.js:105–116, 376, 431–434 等 | **大量 `catch {}` / catch 后仅 log**：logToFile 写盘失败、machine-id 读失败、密钥读失败、reinject 失败全静默吞掉。诊断困难；machine-id 持久化失败（440–442）只 log 就继续，会导致每次重算机器码 → **授权码可能失效**（若 MAC/hostname 变化）。 |
| S6 | main.js:74, 651–677 | CDP 端口随机(9000-9999)绑 loopback（注释自评安全），但**同机恶意进程可扫端口 attach**（注释已承认接受风险）；CSP `img-src 'self' data: https:` 放行任意 https 图片源，非最严。 |
| S7 | main.js:399/419 machineId 派生 | 通用回退用「首个非内部 MAC」——**多网卡/虚拟网卡（VPN、Docker、WiFi↔有线切换）会变**，机器码漂移 → 授权失效。仅 Windows MachineGuid 稳。 |

（可疑点已按影响排序，S1–S5 为改 bug 优先关注项。）

---

## 8. 改 bug 最该先看

- **启动/白屏类**：`createWindow` 的 `tryLoad`（722–768）+ `startServer`（447–530）+ 就绪判定（468/509）。
- **常驻托盘/退出异常**：`window-all-closed`（867）+ `before-quit`（873）。
- **companion 连不上/店铺视图问题**：`startCompanion` env（558–574，尤其 IPv4/CDP URL）+ `createStoreView`（194–273）+ IPC（321–344）+ preload（全 34 行）。
- **授权问题**：机器码看本文件 `getMachineId`/`deriveMachineId`（392–445），但**验签逻辑要去 server 端**（不在此）。
