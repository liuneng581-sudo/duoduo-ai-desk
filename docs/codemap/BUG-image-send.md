# Bug 诊断:自动回复"发图片"买家收不到

诊断日期:2026-07-02 | 状态:根因已实锤,待真实报文后实现

## 现象
自动回复经常"发的图片",买家实际收不到。

## 根因(实锤,非偶发)
companion **压根没有发图能力**。整条回复链路从头到尾只有一个 `content` 文本字段:

1. AI 生成 → 字符串 `rawReply`
   `server/dist/services/ai/aiChat.service.js:377`
2. **sanitize(元凶)**:`![alt](url)` 被正则 `\[([^\]]+)\]\(([^)]+)\)` → `$1 $2` 打成 "alt url" 纯文字
   `server/dist/utils/sanitizeReply.js:53`(stripMarkdownSymbols)
3. WS 下发:`{type:'send_reply', storeId, conversationId, content}` 仍是纯字符串
   `server/dist/services/companion/gateway.js:295`
4. companion 发送:写死 `type: 0`(纯文本)调 `/plateau/chat/send_message`
   `companion/index.js:763`

**所以"发图片"实际发出去的是一串图片 URL 文字**,PDD 买家端不渲染裸 URL / 被风控过滤 → "经常收不到"。

prompts 目录里也无任何让 AI 输出图片的指令;`Product.imageUrls`、`QAEntry.imageUrl` 这些图根本没有进入发送链路的通道。

## 图片来源(schema)
- `Product.imageUrls` — JSON 数组,商品图(schema.prisma:111)
- `QAEntry.imageUrl` — 问答配图(schema.prisma:188)
- `ImageGeneration.resultUrls` — AI 生图结果(schema.prisma:248)

## 修复方案(需贯穿三层)

### 卡点(必须先拿到)
PDD 商家端**真实的发图/上传接口报文**,现有代码里没有(只有 type:0 发文本)。
获取方式:登录 PDD 商家后台手动发一张图,抓 Network 里的上传请求 + 发图请求(URL/请求体/响应)。
待获取字段:图片上传端点、请求体格式、返回的 PDD image_url 与尺寸字段、send_message 图片消息体(type 值 + content 结构)。

### 三层改造
1. **companion 层**(index.js):新增 `sendImage(uid, imageUrl)`
   - fetch 下载图 → 走 PDD 图片上传接口拿 PDD 自己的 image_url/尺寸
   - 调 send_message 用图片消息体(type:1?待报文确认)
   - 等上传成功 + 校验返回 ok 再算发送成功;失败要 notify
2. **WS 协议**(gateway.js + index.js:368 send_reply 分支):
   - send_reply 增加 `msgType`('text'|'image')与 `imageUrl` 字段
3. **server 编排**(aiChat.service.js):
   - 回复流水线区分文本/图片
   - **图片 URL 绝不能过 stripMarkdownSymbols**
   - QA 命中带图 / 商品图场景走图片消息,不再塞进文本

## 关键文件行号索引
- 发送函数:companion/index.js:729 `sendReply`,763 `type:0`
- WS 接收:companion/index.js:368 `send_reply` 分支,376 调 sendReply
- WS 下发:server/dist/services/companion/gateway.js:292 `sendReply`,295 ws.send
- sanitize:server/dist/utils/sanitizeReply.js:53(link→text),81 `sanitizeForCustomer`
- 回复编排:server/dist/services/ai/aiChat.service.js:377 sanitize,500 handleMessage,502 sendReply

## 注意:源码形态陷阱
- companion/index.js 是**唯一真源**(可改)
- server/dist/*.js 是**编译产物**(可读可临时改,但无 .ts 源,改完难维护 → 长期需补 TS 源)
- client/dist 是**压缩产物**(不可维护)
