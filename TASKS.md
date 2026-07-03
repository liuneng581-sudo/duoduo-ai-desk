# 多多AI客服 1.0.4 任务清单

## 状态说明
- [ ] 待完成 / [x] 已完成 / [~] 进行中（看 current_tasks/ 谁在做）
- 每个任务标【负责文件】。认领前检查与在进行任务是否文件重叠，重叠就换一个。

## 背景
拼多多AI客服 Electron 应用。TS 源码在 `desktop/`。客户反馈要补的新功能/缺失，见下。
只改 TS 源码，改完 `cd desktop && npm run typecheck` 必须 0 error 才能 push。

---

## 一、前置任务（会改 schema，优先做，做完立即 push 解锁其他人）

- [ ] **T0-schema**：为 1.0.4 所有需要的数据模型字段做一次性 schema 扩展 + 迁移，避免多任务反复改 schema 冲突。
  - Product 加运费/材质/规格/发货结构化字段：`freight String?`(运费说明) `material String?`(材质) `specs String?`(规格) `shippingTime String?`(发货时效) `lastSyncedAt DateTime?`(最后同步时间)
  - 新增 Announcement 模型（软件内公告/远程推送用）：`id, title, content, level(info/warning), publishedAt, active Boolean`
  - Store 加 `lastConnectedAt DateTime?`（最后连接时间，F3 用）
  - 改完 `cd desktop && npm run prisma:generate`，写迁移，typecheck 通过再 push。
  - 【负责文件】`server/prisma/schema.prisma`、`server/prisma/migrations/*`
  - **其他动 schema 的任务等这个 [x] 后再开始**

---

## 二、M1 运费/材质/商品维度（客户最核心痛点）依赖 T0-schema

- [ ] **M1-backend**：Product 的运费/材质/规格/发货字段接入后端 CRUD + Excel 导入导出模板。
  - product.service.ts / product.controller.ts：新字段可增改查；Excel 导入模板 HEADER_MAP 加这几列、导出也带上。
  - 【负责文件】`server/src/services/product.service.ts`、`server/src/controllers/product.controller.ts`
- [ ] **M1-prompt**：AI 组 prompt 时把商品的运费/材质/规格/发货注入。
  - aiChat.service.ts 的商品格式化 fmt()：拼上新字段；systemPrompt.ts：允许 AI 用这些信息回答运费/材质类问题。
  - 【负责文件】`server/src/services/ai/aiChat.service.ts`、`server/src/services/ai/prompts/systemPrompt.ts`
  - ⚠️ 与"backstage 报备"在同文件，改动集中在 fmt()/prompt 模板，小心不要覆盖已有逻辑
- [ ] **M1-frontend**：商品知识库页面表单加运费/材质/规格/发货字段的编辑与展示。
  - 【负责文件】`client/src/pages/stores/ProductsPage.tsx`

## 三、F3 时间提示（数据多已存，主要前端展示）

- [ ] **F3-license-time**：授权激活时间/到期时间/剩余天数 —— 后端 license 状态接口返回这些，前端激活页/设置页展示。
  - 【负责文件】`server/src/services/license.service.ts`、`client/src/pages/auth/ActivatePage.tsx`（以实际文件名为准，先 grep 定位）
- [ ] **F3-frontend-times**：会话/消息/商品最后同步/店铺最后连接 时间在前端各页展示（用 dayjs 格式化）。
  - 【负责文件】`client/src/pages/chat/*`、`client/src/pages/stores/StoreListPage.tsx`（依赖 T0 的 lastSyncedAt/lastConnectedAt）

## 四、F1 飞书群引导（商家遇问题进售后群）

- [x] **F1-help-entry**：右上角/顶栏加一个"联系客服/进群求助"入口，弹窗展示飞书群二维码或链接。纯前端。
  - 【负责文件】新建 `client/src/components/SupportModal.tsx`，在 `client/src/layouts/DashboardLayout.tsx` 加入口按钮（只加自己那行）
  - 二维码/群链接先用占位，加 TODO 注释让用户后续替换。

## 五、F2 信息通知（两部分）

- [ ] **F2-fix-alerts**：修好现有通知铃铛"不准/不刷新"问题 —— 先 grep 定位现有通知铃铛组件与 alerts 接口，检查数据准确性 + 前端轮询刷新。
  - 【负责文件】现有通知铃铛组件（`client/src/components/` 下，先定位）+ 对应 alerts 只读逻辑
- [ ] **F2-announcement-backend**：软件内公告后端 —— Announcement 的增删查接口（商家端拉取 active 公告）。依赖 T0-schema。
  - 【负责文件】新建 `server/src/services/announcement.service.ts`、`server/src/controllers/announcement.controller.ts`、`server/src/routes/announcement.routes.ts` + 在 `server/src/routes/index.ts` 注册一行
- [ ] **F2-announcement-frontend**：前端展示公告（登录后拉 active 公告，弹窗或顶部横幅）。依赖 F2-announcement-backend。
  - 【负责文件】新建 `client/src/components/AnnouncementBanner.tsx`、在 `client/src/layouts/DashboardLayout.tsx` 挂载（只加自己那行）

## 六、F4 使用教程引导（图文帮助中心 + 首次分步引导）

- [x] **F4-help-center**：右上角"使用教程"入口 → 图文帮助中心页/弹窗，讲清 全局配置/门店问答库/商品知识库 的区别与用法。纯前端。
  - 【负责文件】新建 `client/src/pages/help/HelpCenterPage.tsx` + `client/src/router.tsx` 加一条路由 + `DashboardLayout.tsx` 加入口（只加自己那行）
- [x] **F4-onboarding**：首次使用分步引导（新用户首次进入，高亮引导：添加店铺→同步商品→配置问答）。纯前端。
  - 【负责文件】新建 `client/src/components/OnboardingGuide.tsx`，用 localStorage 记录是否已看过

---

## 共享文件冲突高发区（改动要小、要快、勤 pull）
- `server/prisma/schema.prisma` — 只有 T0 动
- `server/src/routes/index.ts` — 注册路由只加自己那行
- `client/src/router.tsx` — 加路由只加自己那行
- `client/src/layouts/DashboardLayout.tsx` — F1/F2-announcement/F4 都会碰，只加自己那行，改完立即 pull+push

## 已完成（1.0.4 前期，勿动）
- [x] 源码从 win.54 找回并入 git（commit fda3189）
- [x] B1 批量导入导出 blob 修复 + B2 睡眠掉线 powerMonitor（commit ff2dfb6）— 待 Windows 实测
- [x] 1.0.3 dist 改动回写 TS 源码

## 备注
- B3"该插嘴"需客户复现场景，暂不做。
- M4 计费透明：扣费在中转侧，本项目只能界面加说明，暂缓。
- companion 抓运费/材质（M1 深度版）风险高，本轮先不做，只做 Product 字段+手填+导入+prompt。

<!-- Agent 在此维护 -->
