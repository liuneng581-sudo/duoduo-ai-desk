# 功能:AI"已通知后台处理"话术 + 飞书报备(需求②的正解)

制定 2026-07-02 | 状态:样板已摸清,待用户确认场景清单后实现

## 需求本质(用户强调)
软件全自动回复,**不引入人工接管概念**。AI 遇到自己做不了的物理操作(改地址/改备注/催发货/改价合单/开票…),不转人工,而是:
- 对客户:话术"已帮您通知店主/运营,会有专人在后台处理"→ 让客户感到已通知到位、有人管
- 对店主:后台**真的飞书通知**,店主被动异步处理,不用下场前台
目标:店主根本不用在拼多多前台回复,自然没有"AI 插嘴"问题。

## 现成样板:改地址(改这里照抄)
文件 `desktop/server/dist/services/ai/aiChat.service.js`:
1. **检测**(line 280):
   `const isAddressChange = /改地址|换地址|.../.test(msg.content);`
2. **触发飞书**(line 281-282):
   `if (isAddressChange) notifyAddressChange(storeId, conv.id, msg.content).catch(()=>{});`
3. **传给 AI 话术**(line 353):`buildSystemPrompt(..., { addressChange: isAddressChange })`
4. **飞书函数**(line 568 `notifyAddressChange`):取 webhook → `feishuService.notifyError(url, storeName, "客户申请修改收货地址...客户原话:...")`

## 扩展配方(每个新场景 3 步)
以"改备注"为例:
1. 加检测正则:`const isRemark = /备注|改备注|加备注|.../.test(msg.content);`
2. 加触发:`if (isRemark) notifyBackstage(storeId, conv.id, msg.content, '备注').catch(()=>{});`
3. 让 AI 用"已通知后台"话术:把标记并入传给 `buildSystemPrompt` 的对象 → 需同步在 `desktop/server/dist/services/ai/prompts/systemPrompt.js` 里加对应话术分支(待读该文件确认注入点)。

**建议重构**:与其为每个场景写一个 notifyXxx,不如做一个通用
`notifyBackstage(storeId, convId, content, sceneLabel)`(飞书发"客户请求【{sceneLabel}】,请后台处理。原话:...")+ 一个"场景→话术"映射表,后续加场景只改表。

## 待确认(用户回来定)
- 覆盖哪些场景:改/加备注、催发货、改价/合单/改规格、开票、其他?
- 关键词是否要可配置(存 SystemConfig)还是先写死正则(先写死快,配置化等前端源码)

## 注意
- 改的是 server/dist 编译产物(可读可改,但无 .ts 源,改完不能重新 tsc)→ 直接改 dist 生效,但需同步记录改动,将来若重建 TS 源要补回。
- 不改 companion,不做接管态(那是理解错的方向,已撤销)。
- 催发货可能已被 detectContext(line 62 含"催发货")当普通物流问题处理,需确认是否要单独报备。
