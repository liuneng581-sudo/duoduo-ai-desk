# B — Companion 自动化层代码地图

> 目标文件：`desktop/companion/index.js`（编译后 JS，1334 行 / 63 KB）
> 角色：用 Playwright 连接 Electron 内嵌 Chromium 打开的拼多多商家后台聊天页
> (`mms.pinduoduo.com/chat-merchant`)，模拟人工：轮询买家消息 → 上报 server →
> server 出 AI 回复 → companion 页面内 `fetch` 发送。与 server(`ws://127.0.0.1:3001/ws`) 用 WebSocket 通信。
>
> **重要结论（先说）**：本 companion 构建**完全没有发送图片消息的代码**。
> 所有回复（AI 自动 + 人工手动）都只走 `sendReply()` 的 `type:0` 纯文本发送。
> 这是「发图片买家收不到」的根因，详见 §5。

---

## 1. 整体架构

### 1.1 运行模式（两种）
- **Embedded / CDP 模式**（打包 app，`COMPANION_CDP_URL` 非空，`index.js:66`）：
  Electron 主进程开好 `WebContentsView` 并导航到 PDD，companion 用
  `chromium.connectOverCDP(COMPANION_CDP_URL)` 附着（`index.js:833`）。视图生命周期由主进程管。
- **Standalone 模式**（开发 / 无内嵌视图，`COMPANION_CDP_URL` 为空）：
  companion 自己 `chromium.launchPersistentContext(userDataDir, {headless:false})` 起一个 Chromium 窗口（`index.js:862`），随后把窗口移到屏幕外 `-32000,-32000`（`hideBrowserWindow`, `index.js:272`）。

### 1.2 多店铺 session 管理
- 全局 `const sessions = new Map()`（storeId → Session），`index.js:90`。
- `getOrCreateSession(storeId, storeName)`（`index.js:91`）建 Session 结构：
  `{storeId, storeName, cookies, processedMsgs:Set, browser, context, page,
  pollTimer, polling, scraping, starting, intentionalClose, lastCredentials,
  reconnectingBrowser, browserReconnectFails}`。
- **每店铺一套**：独立浏览器/页面、独立轮询定时器、独立已处理消息集、独立 cookie 文件。
- **关键隔离原则**：一个店铺的失败绝不能拖垮整个 companion（会连累所有店）。
  多处 `try/catch` 包裹 + 进程级兜底 `unhandledRejection`/`uncaughtException`（`index.js:1308-1313`）只记日志不退出。

### 1.3 findPddPage — CDP 模式定位本店页面（`index.js:151`）
- 主进程给每个视图注入 `window.__DD_STORE_ID__` 标签。
- 先按 URL 粗筛（含 pinduoduo/yangkeduo），再 `page.evaluate(()=>window.__DD_STORE_ID__)` 精确匹配 storeId（每次 evaluate 封 2s 超时，防单页卡死整个查找）。
- 只有当 `sessions.size <= 1` 时才降级为「任意 PDD 域页面」；多店时**绝不**降级，避免误抓错页导致串店。

### 1.4 凭据加密（`index.js:72` decryptCredentials）
- server 通过 WS 下发的账号密码是 AES-256-GCM 密文（格式 `iv:tag:data` hex），key = `sha256(COMPANION_WS_TOKEN)`。与 server `utils/wsCrypto` 对称。
- 明文 `data.credentials` 仅为旧 server 向后兼容保留。

---

## 2. 与 Server 的 WebSocket 协议

连接：`connectServer()`（`index.js:297`）。开连即发 `{type:'auth', token}`。
断线指数退避重连（1s→60s，`index.js:433`）。心跳 30s ping 且校验 pong，半开连接强制 `terminate()` 触发重连（`index.js:443-461`）。

### 2.1 收（server → companion，`serverWs.on('message')` `index.js:304`）

| type | 处理 | 位置 |
|---|---|---|
| `auth_ok` | 回 `register` 上报当前所有 storeId | `index.js:312` |
| `start_store` | 建 session、解密凭据、`handleStart()`；外层 try/catch 兜底防崩 | `index.js:317` |
| `stop_store` | 只停该店：`intentionalClose=true`→`closeBrowser`→`sessions.delete`→重发 register | `index.js:354` |
| `send_reply` | `sendReply(s, data.conversationId, data.content)` **仅文本** | `index.js:368` |
| `fetch_store_stats` | `fetchStoreStats(s)` → 回 `store_stats` | `index.js:379` |
| `fetch_all_goods` | 置 `s.scraping=true` 暂停轮询 → `fetchAllGoods` → 回 `all_goods`，finally 导航回聊天页 | `index.js:396` |

### 2.2 发（companion → server，`sendToServer()` `index.js:467`）

| type | 时机 | 位置 |
|---|---|---|
| `auth` | 连接建立 | `index.js:302` |
| `register {storeIds[]}` | auth_ok / start / stop 后 | `index.js:314,325,365` |
| `status {state,...}` | `notify()`：online/idle/error/needs_login/needs_captcha | `index.js:464` |
| `customer_message` | 抓到新买家消息（含 content/context/orderHint/msgId/msgType:'text'） | `index.js:1272` |
| `store_stats` / `all_goods` / `goods_progress` | 对应请求响应 | `index.js:389,413,411` |

> 注意：`sendToServer` 在连接非 OPEN 时**静默返回 false 丢弃**（`index.js:468`）。
> 抓消息处依赖返回值做去重落库（见 §3）。

---

## 3. 消息抓取链路（HTTP 轮询）

轮询定时器在 `handleStart` 末尾建立：`s.pollTimer = setInterval(..., 5000)`（`index.js:1094`，**5 秒一轮**）。

1. **门禁**：`s.polling` 互斥（防重入）、`s.scraping` 时跳过（抓商品期间停轮询，避风控）、`page.isClosed()` 则清定时器并 `scheduleBrowserRecovery`（`index.js:1095-1112`）。
2. **拉会话**：页面内 `fetch('/plateau/chat/latest_conversations', {data:{offset:0,size:50}})`，内部 25s AbortController；外层再 `withTimeout(..., 35000)`（`index.js:1113-1131`）。
3. **解析 + 风控识别**：成功取 `result.conversations`；若 `error_code===40002 || success===false` 判为 PDD 风控/限流，`notify error` 而非当 0 条静默吞（`index.js:1136-1152`）。
4. **逐条筛选**：只留 `from.role==='user'`；`msgId = msg_id || client_msg_id`；`content` 空跳过；**去重 `s.processedMsgs.has(msgId)`**（`index.js:1156-1164`）。
5. **拉上下文**：对该买家 `fetch('/plateau/chat/list', size:20)` 取最近 20 条（`index.js:1186`），过滤 `type===0` 取后 10 条拼成「客户/客服」文本；正则从整条 JSON 里扒 `order_sn`(`\d{6}-\d{12,}`) 与 `goods_id`；有订单号再查 `/mercury/chat/afterSales/queryList` 售后状态（`index.js:1177-1258`）。整段封 `withTimeout 25s`，失败则空 context 继续，**绝不阻塞轮询**。
6. **上报**：`sendToServer({type:'customer_message', ...})`（`index.js:1272`）。**仅当发送成功**才 `addProcessed(s, msgId)`（`index.js:1278`）——WS 断时不标记，下轮重试，避免丢消息。

**去重机制** `addProcessed`（`index.js:136`）：Set 存 msgId，超过 `MAX_PROCESSED_MSGS=5000` 时批量删最旧 `size-5000+1000` 条（FIFO 近似，按插入序）。

---

## 4. 发文字回复链路（sendReply, `index.js:729`）

**不是** UI 点按钮，而是页面内同源 `fetch` 直发 PDD 聊天接口。

1. **前置**：`page` 空或已关 → 记日志返回 false（`index.js:731`）。
2. **清洗**：剥 `<think>` 思维链、剥 Markdown 符号（`**` `#` `>` 反引号 `*` 等）、trim；清完为空则不发（`index.js:738-751`）。
3. **发送**：`page.evaluate` 内 `fetch('/plateau/chat/send_message', POST)`，body 结构：
   `{data:{cmd:'send_message', message:{to:{role:'user',uid}, from:{role:'mall_cs'}, ts, content, msg_id:null, type:0, is_aut:1, manual_reply:0, status:'read', is_read:1, hash:''}, ...}, client:'WEB', anti_content:''}`（`index.js:753-777`）。
   - **`type:0` 硬编码 = 纯文本**；`anti_content:''` 空（发消息接口不需签名，与抓商品不同）。
4. **判成功**：`status===200 && json.success && json.result.result==='ok'`（`index.js:778-784`）。
5. **失败处理**：日志打 body 前 150 字；若 `error_code===40002 || success===false` → `notify error`「回复发送受限」（`index.js:785-794`）。整体 try/catch，异常返回 false（`index.js:797-800`）。

调用来源（server 侧）：
- AI 自动回复：`aiChat.service.js:502` `companionGateway.sendReply(storeId, conversationId, reply)`
- 人工手动回复：`chat.controller.js:103` 同一入口
- gateway 实际发 WS：`gateway.js:292` `{type:'send_reply', storeId, conversationId, content}`

---

## 5. 发图片链路 —— **根因分析（本任务重点）**

### 5.1 事实：companion 没有任何发图代码
- 全文 grep `image / img / setInputFiles / clipboard / paste / base64 / type:1 / 素材 / upload` 在发送方向**零命中**。
- 唯一发送函数 `sendReply` 只发 `type:0` 文本（`index.js:763`）。
- server 侧 `image.service.js` 是**AI 生成商品图**（存 DB `resultUrls`），用于知识库/商品管理，**不接入聊天发送通道**。
- server 侧 `sanitizeForCustomer` 会把 Markdown 图片/链接 `![alt](url)` → `alt url` **降级成纯文本**（`server/dist/utils/sanitizeReply.js:44`）。
- 全链路唯一到达买家的通道 = `companionGateway.sendReply` → WS `send_reply` → companion `sendReply` → `type:0` 文本。

### 5.2 根因判断（按可能性排序）

1. **【根因·最高】压根没有图片消息通道。**
   拼多多发图必须走 `type:1`（或专门的图片消息体，含已上传到 PDD CDN 的 image url + 宽高），而 companion 只会 `type:0`。所谓「发图片」在本构建里必然退化成**发一段文字**（图片 URL / 或被 sanitize 成 `alt url`）。PDD 买家端对聊天里的**站外 URL 文本**会风控过滤/不渲染缩略图 → 买家「经常收不到」。这不是偶发竞态，是**能力缺失**，偶发只是因为有时 URL 侥幸透传、有时被过滤。

2. **【次因】即便把图当文本发，也会被长度/清洗截断。**
   人工发送入口 `chat.controller.js:77` 限制 `content.length<=1000`；若图片是 `data:image/...;base64,`（动辄几十 KB~MB）会直接被拒或截断成半截 URL，100% 失败。`sendReply` 的 Markdown 清洗也可能吃掉 URL 中字符。

3. **【第三】没有「上传到 PDD 素材/CDN」这一步。**
   正确发图应先把图片字节上传到拼多多的图片上传接口拿到 PDD 自己的 image_url，再以图片消息体发送。companion 完全没有这一步，也就没有「等上传完成」「校验上传成功」的逻辑——所以也谈不上竞态或超时静默 catch，是**流程根本不存在**。

### 5.3 修复方向
- 在 companion 增加真正的图片发送：页面内 `fetch` 调 PDD 图片上传接口（复用登录态 cookie + 页面自签 anti_content）拿到 PDD image_url，再用图片消息体（`type:1` 或 PDD 实际图片 schema）`send_message`；**必须等上传成功拿到 url 再发**，并像文本一样校验 `result==='ok'`。
- 协议层扩展：`send_reply` 增加 `msgType/imageUrl` 字段；server 侧回复管线区分文本/图片，图片走「上传→发图」而非 `sanitize 成文本`。
- 短期兜底：若继续按文本发链接，至少去掉 1000 字/Markdown 清洗对图片 URL 的破坏，并明确产品上「自动回复不支持发图」以免误导。

---

## 6. 抓商品 fetchAllGoods（`index.js:555`）

- 难点：`/vodka/v2/mms/query/display/mall/goodsList` 需要动态 `anti-content` 风控签名（页面 JS 生成，无法自造）。
- **策略**：导航到 `goods/goods_list`，监听页面**自己**发出的 goodsList 请求，从 header 里**偷** `anti-content` 复用（`refreshAnti`, `index.js:570-593`；最多等 24×500ms）。
- 翻页：`PAGE_SIZE=100`，`MAX_PAGES=500`，页间 sleep 1.2s（`index.js:565,725`）。
- **软/硬限流处理**（`index.js:671-726`）：
  - 硬限流 `isRateLimited`（`/频繁|风控|限流|40001|40002|too many|frequent/`）或**软限流**（success 但返回空 goods/total=0 且未抓完，判为签名失效）→ 每页最多 5 轮：第 1 轮短退避 2.5s，仍不行 `refreshAnti()` 刷新签名再试。
  - 「可以慢但必须准」：失效刷新重试当前页**绝不跳过**；按 `externalId` 去重（`byId` Map），一个商品只存一份。
  - 重试用尽：有数据返回已抓部分，一条没有才抛错。
- 每页 `fetchPage` 内层 20s Abort + 外层 `withTimeout 25s`。

## 7. 店铺统计 fetchStoreStats（`index.js:498`）
- 页面内 fetch 两个接口：`/sydney/api/mallScore/queryMallScoreOverView`（今日 GMV/单量/客单价/退款）+ `/mars/app/order/statisticWithType`{subType:15}（待付/待发/已发/退款中）。
- 非 JSON 或 `success:false / error_code!==0` 直接抛错，**不静默零填**。

## 8. Cookie / 登录 / 浏览器恢复
- **Cookie**：`saveCookies`（`index.js:476`）写 `cookies-<storeId>.json`，`mode:0600`，每店独立防互相覆盖。登录成功后从 `page.context().cookies()` 读取（`index.js:1065`；注意 CDP 模式 `browser` 无 `.cookies()`，必须用 context）。
- **自动登录**（`index.js:914-1018`）：`page.evaluate` 里遍历 DOM 找账号/密码 tab、input（按 placeholder/type 猜）、用原生 setter 填值 + dispatch input 事件、找含「登录」文字的按钮点击。轮询 30s 看 URL 是否跳离 login；识别「密码错误/账号不存在」「验证/滑块/拼图」分别 notify error/needs_captcha。
- **手动登录**：最长等 300s（`index.js:1026`），周期性检测验证码。
- **浏览器恢复** `scheduleBrowserRecovery`（`index.js:224`）：意外关闭时 2s 后重连（`handleStart`），每店上限 `MAX_BROWSER_RECONNECTS=5`；用尽后 notify error，但 5 分钟后重置预算再试一次（自愈）。多重 guard：`intentionalClose`/`reconnectingBrowser`/`starting`/`sessions.has` 防止停掉的店被复活、防紧密崩溃循环。
- `browser.on('close')`（`index.js:886`）区分主动关（notify idle）vs 意外关（触发恢复）。

## 9. 限流 / 超时 / 错误处理

- **withTimeout**（`index.js:489`）：给无内建超时的 `page.evaluate` 加超时。注释点明关键风险：evaluate 卡死会让 `s.polling` 互斥**永久 true**，该店从此静默不再收消息——所以轮询里每个 evaluate 都包 withTimeout 保证必 settle。
- **轮询兜底**（`index.js:1283-1297`）：poll 抛错时，若是 `evaluate timeout`（渲染器疑似卡死），清定时器 + `scheduleBrowserRecovery`（光 reset polling 无用，下轮还会卡）；`finally` 里必 `s.polling=false`。
- **限流识别**：抓商品 `isRateLimited` 正则；轮询/发送/统计三处都识别 `error_code===40002` 并 notify error，不静默当 0。

## 10. 可疑点 / 技术债 / bug 隐患

1. **发图能力缺失（最严重）**：见 §5，是「发图收不到」根因。
2. **登录选择器全靠 DOM 猜**（`index.js:921-978`）：`[class*="tab"]`、按 placeholder 含「手机/账号」、按钮含「登录」文字——PDD 改版极易失效，且 evaluate 内出错只回 `{success:false}` 不细分。
3. **anti-content 靠偷页面请求头**（`index.js:570`）：脆弱，依赖页面自己在 24×500ms 内发 goodsList；PDD 改接口/签名机制即失效。且注释自承「~11 页后签名失效」。
4. **大量 `.catch(()=>{})` / 空 catch 吞错**：`findPddPage`（`index.js:169,181`）、`closeBrowser`（`index.js:200,210,217`）、`hideBrowserWindow`、`page.goto(...).catch(()=>{})`（`index.js:422,585`）、售后查询 catch（`index.js:1255`）等。多为有意（隔离容错），但也可能掩盖真实故障（如导航失败后继续跑）。
5. **发送成功判定依赖 PDD 返回结构** `json.result.result==='ok'`（`index.js:780`）：PDD 改字段即误判「发送失败」或反之。
6. **selectors / URL 硬编码**：`chat-merchant/index.html`、`goods/goods_list`、各 `/plateau /vodka /sydney /mars /mercury` 接口路径散落全文，PDD 端点变更全线崩。
7. **sendToServer 静默丢弃**（`index.js:468`）：WS 非 OPEN 时回复/事件直接丢，无重试队列；发文字回复若此刻断线则永久丢失（不像抓消息有 addProcessed 门禁重试）。
8. **orderHint 正则扒单号/商品号**（`index.js:1215-1216`）：对整条消息 JSON 做正则，误报/漏报风险；`goods_id` 正则 `\d{6,}` 可能撞其它长数字。
9. **轮询固定 5s 无自适应退避**：被风控时只靠「下一轮天然间隔」，未真正加大间隔，可能持续撞风控。
10. **processedMsgs FIFO 删除按插入序**（`index.js:140`）：极端高频下理论上可能删到仍活跃的 msgId 造成重复上报（有 server 侧幂等兜底缓解）。
