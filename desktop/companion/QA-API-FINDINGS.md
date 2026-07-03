# Q&A 接口调研结果(基于真实抓包,2026-06-21)

## ⚠️ 售后字段 + order_sn 风险(2026-06-21 二次抓包校准)

**售后接口真实返回**(`afterSales/queryList`,实测一笔完成退款的订单):
```
orderSn2AfterSalesListMap: { "<order_sn>": [{
  afterSalesTitle: "未发货退款，退款成功",        // 完整描述,优先取这个
  afterSalesStatusSimpleTitle: "售后已完结",       // 简短状态
  afterSalesType: 1, refundAmount: 399, ...
}]}
```
正确取值字段:`afterSalesTitle` → `afterSalesStatusSimpleTitle` → `subTitleTip`。
(之前推测的 afterSalesStatusDesc/statusDesc/statusText **全错**,已修正。)

**order_sn 真机抓不到的风险(已知,接受现状)**:`chat/list` 消息全是 type:0 纯文本,**订单号是 UI 卡片组件,不在消息文本里**;退款完结后打开会话也无订单上下文接口带出订单号。所以:
- goods_id 稳定可抓(商品链接在消息里)→ 售前/售中商品关联 **稳**
- order_sn 经常抓不到 → 售后精确状态查询会缺输入。**兜底**:售后靠关键词(退款/退货)判定场景 + afterSales.hasAfterSales 信号;拿不到 order_sn 时 AI 仍按售后话术应对,只是没有"退到第几步"。
- 决策:接受现状,不反查订单(订单接口无买家 uid,反查会混淆多客户)。

---


抓包店铺:`store-<STORE_ID>`(示例店铺,mall_id <MALL_ID>)。
工具:`companion/capture-qa.ts`(被动捕获)+ `companion/probe-qa.ts`(主动探测)。
原始数据:`companion/qa-capture-*.json`、`companion/probe-qa-*.json`。

> ⚠️ 局限:抓包时该店**无真实订单**(各订单接口 pageItems 为空),所以订单明细里**买家 uid 的确切字段名未能确认**。需在有真实订单时校准一次。

## 🔑 关键结论(下真实订单后校准,2026-06-21)

**订单接口里没有买家 uid——PDD 隐私脱敏。** 真实已付款订单(`recentOrderList`, `orderType:1,afterSaleType:1`)字段:
`order_sn`(订单号)、`goods_id`(✅ 能对应商品知识库 externalId)、`goods_name`、`goods_price`、`order_amount`、`goods_number`、`order_status`、`order_time`、`created_at`、`nickname`("Z***" 脱敏)、`receive_name`("赵**" 脱敏)、`province_name`。
**无 uid / 无明文买家标识**。所以"聊天 to.uid ↔ 订单买家"无法用 uid 直接对应。

**已购/未购判定的正确做法(用户定:A+B)——不自己关联 uid:**
- 打开某会话时,PDD 自动按**当前会话客户上下文**(session/cookie,**请求 body 为空**)调:
  - `POST /chats/unpaidOrders` (空 body) → `{total, pageNo, pageSize, orders:[]}` 该客户未付款订单
  - `POST /latitude/order/getMallUnpaidOrderCount` (空 body) → 未付款订单数
- PDD 客服界面每个会话本就有"该客户订单"侧栏(JS: `chatOrderList`,字段 `order_sn_block/amount/service_type`)——存在一个"按当前会话客户查订单"的接口,`unpaidOrders` 是其一。
- **判定逻辑**:在该客户会话激活态下查其订单 → 有订单=已购(售中/售后),无订单=未购(售前)。靠会话上下文,不靠 uid 关联。
- ⚠️ 待补:确认"按当前会话查**已付款**订单"的接口(unpaidOrders 只查未付款);可能是同一侧栏的另一个 tab 请求。

**orderCsGroupConvList 的 groupType**:0/1/2 是列表级分组(总会随会话状态变动),3-6 报"获取用户信息失败"(需会话上下文参数)。语义未完全标定,**不作为主判定依据**,改用上面的会话上下文订单查询。

## ✅ 最终方案(扫会话订单号,2026-06-21 实测确认)

**自动接口只查"未付款"——单靠它无法区分已购/未购**(已购客户 unpaidOrders 也返回 0)。已落地的可靠路径:

1. **`POST /plateau/chat/list`** 拉某客户消息历史。
   body: `{"data":{"cmd":"list","request_id":<ts>,"list":{"with":{"role":"user","id":"<客户uid>"},"start_msg_id":null,"start_index":0,"size":11},"notUpdateUnreplyTs":true,"anti_content":"..."}}`
   返回 `result.messages[]`,每条有 `from/to.uid`、`content`、`type`、`source_id`、`msg_id`、`ts`。客户下单时消息流会出现订单卡片消息(带 order_sn);客户发的"拍了"等也是信号。
2. **从消息流提取 `order_sn`**(订单卡片消息)。
3. **`POST /mercury/chat/afterSales/queryList`** body `{"orderSns":["<ORDER_SN>"],"anti_content":"..."}` → 查这些订单的售后状态(`orderSn2AfterSalesListMap`)。**实测:打开会话时 PDD 自己就用该客户订单号调了这个接口** → 证明"会话已知客户订单号"。
4. **`recentOrderList`**(见下)用 order_sn / 时间段查订单完整状态。

**已购/未购判定(最终)**:
- 会话消息流里有订单卡片 / order_sn → 已购 → 据订单状态分 售中(未发/已发未收)/ 售后(已收/退款)。
- 无订单痕迹 + unpaidOrders=0 → 未购(售前)。
- 有未付款订单(unpaidOrders>0)→ 售中(已拍未付)。
- 写入 `Conversation.context`。

**anti_content 签名**:chat/list、afterSales/queryList 等都需要 `anti_content`(PDD 风控签名)。它由页面 JS 生成 —— **必须在页面内 `page.evaluate(fetch(...))` 调用**(companion 现有轮询就是这么做的),不能在 Node 侧直接 fetch,否则签名缺失被拒。

**buyer uid**:`chat/list` 的 `with.id` / 消息 `from.uid` 就是客户 uid(明文,如 <BUYER_UID>)。订单接口(recentOrderList)无 uid,靠 order_sn 桥接会话与订单。

**⚠️ 又见 think 泄漏**:`chat/list` 消息流里 AI 正式回复含 `<think>...</think>`(Task #7)。

## orderCsGroupConvList 的 groupType(保留记录)

---


## (a) 售前/售中/售后 + 已购买/未购买判定

### 会话列表与客户标识
- `POST /plateau/chat/latest_conversations`  body `{"data":{"offset":0,"size":50},"client":1,"anti_content":"..."}`
  - 返回 `result.conversations[]`,每条:`to:{role:"user",uid:"<BUYER_UID>"}`(**客户标识=to.uid**)、`from:{role:"mall_cs",uid:mall_id}`、`content`、`ts`、`msg_id`。
  - ⚠️ `anti_content` 是 PDD 风控签名,companion 现有轮询已能拿到(它在页面内 fetch,签名由页面 JS 生成),我们复用页面内 fetch 即可,无需自己造签名。
- `POST /latitude/mall/orderCsGroupConvList`  body `{"groupType":N,"pageNum":0,"pageSize":20}`
  - **PDD 原生按订单关系分组的会话列表**。groupType 映射(本次抓包):
    - 0 = 全部(total:1,有数据)
    - 1 = 空分组  2 = 空分组
    - 3~6 = "获取用户信息失败"(需先选中具体会话,是会话级参数而非列表级)
  - 每条 `data[].lastMessage` 同样含 `to.uid`/`from.uid`。

### 判定客户买没买
- `POST /chats/unpaidOrders`(空 body)→ `{total, pageNo, pageSize, orders:[]}` —— 该客户**未付款订单**。
- `POST /latitude/order/getMallUnpaidOrderCount` → `result: <未付款订单数>`。

### 落地策略(用户定:两者结合)
- 主:PDD 原生 `orderCsGroupConvList` 分组 + 该客户订单查询。
- 补:用客户订单状态推断 → 写入 `Conversation.context`(presale/insale/aftersale)。
  - 无任何订单 = 售前(未购买);有未付款 = 售中;有已付/已收/退款 = 售后(已购买)。
- ⚠️ 待校准:`recentOrderList` 里买家 uid 字段名(空数据未确认),决定"聊天 uid ↔ 订单买家"如何精确对应。

---

## (b) 门店营收 + 订单数

### 营收 + 成交汇总(看板总量)
- `POST /sydney/api/mallScore/queryMallScoreOverView`(空 body)→ `result`:
  - `dealDataVO.cfmOrdrAmt1d` = 今日成交金额(GMV)
  - `dealDataVO.cfmOrdrCnt1d` = 今日确认订单数
  - `dealDataVO.cfmOrdrAup1d` = 客单价
  - `serviceDataVO.*` = 退款金额/数/率(sucRfOrdrAmt1d 等)
  - 字段值为字符串,空店返回 `""`。
- `POST /sydney/api/mallScore/queryMallScoreOverViewReadyTime` → 数据就绪日期。

### 订单数分状态统计
- `POST /mars/app/order/statisticWithType`  body `{"subType":N,"source":"MMS"}`
  - subType=15 → `{unshipped 待发货, waitPay 待付款, shipped 已发货, refunding 退款中}`
  - subType=5  → `{unreceive 待收货, delay, unship12h, unship}`
  - 其它 subType 对应不同维度(29/30 发货时效等)。

### 订单明细列表(可下钻)
- `POST /mangkhut/mms/recentOrderList`  body 含:
  `{orderType, afterSaleType, remarkStatus, urgeShippingStatus, groupStartTime, groupEndTime, pageNumber, pageSize, sortType, consolidateTypeList:[1], mobile}`
  - 返回 `result:{totalItemNum, pageItems:[], hasMore}`。
  - 支持时间段(groupStartTime/EndTime,unix 秒)、分页、排序 → 满足按时间段/商品聚合。
  - ⚠️ pageItems 字段结构空数据未见,需有真实订单时确认。

---

## 现网 bug(抓包顺带发现,见 Task #7)
会话 content 里 AI 回复**把 `<think>...</think>` 思维链原文发给了客户**。需在发送前过滤。
