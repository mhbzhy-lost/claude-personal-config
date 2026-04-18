---
name: im-offline-sync
description: XMPP 离线消息存储与多端同步（XEP-0160 / Carbons / MAM）核心实践
tech_stack: [xmpp, im]
capability: [realtime-messaging]
version: "XEP-0160 unversioned; modernxmpp unversioned"
collected_at: 2026-04-18
---

# IM 离线消息与多端同步（XMPP）

> 来源：https://xmpp.org/extensions/xep-0160.html, https://docs.modernxmpp.org/client/protocol/

## 用途
规范 XMPP 服务端在接收方离线时如何暂存消息，并配合 Carbons / MAM 实现多端实时同步与登录补齐，填补 XMPP Core/IM 规范在离线消息处理上的空缺。

## 何时使用
- 设计/实现 XMPP 服务端对离线消息的落地与投递
- 构建多端 IM 客户端，需要在线设备间实时镜像会话并在登录时补齐历史
- 需要可靠到达（ack、断线续传）与已读状态跨端同步
- 排查离线消息丢失、重复、或 Carbons 与 MAM 登录期竞争问题

## 基础用法

**服务端按消息 type 决定是否入离线库**：

| type | 离线存储 |
|------|----------|
| normal | 是 |
| chat | 是（chat state notification 除外）|
| groupchat | 否（无 presence 无法加入房间）|
| headline | 否（时效性）|
| error | 否（AMP 错误可例外）|

**五步投递流程**：
1. 发送方发出 message stanza，接收方无 priority >=0 的资源
2. 服务端检查离线存储容量；不足则回 `<service-unavailable/>`
3. 存入离线库
4. 接收方下次上线发 available presence
5. 服务端投递，附加 `<delay xmlns='urn:xmpp:delay' stamp='...'>` 标注原始时间

**投递示例**：
```xml
<message from='romeo@montague.net/orchard' to='juliet@capulet.com'>
  <body>...</body>
  <delay xmlns='urn:xmpp:delay'
     from='capulet.com'
     stamp='2002-09-10T23:08:25Z'>Offline Storage</delay>
</message>
```

**能力发现**（disco#info 回 `msgoffline` feature）：
```xml
<iq from='capulet.com' to='juliet@capulet.com/chamber'>
  <query xmlns='http://jabber.org/protocol/disco#info'>
    <feature var='msgoffline'/>
  </query>
</iq>
```

## 关键 API（摘要）
- `XEP-0160` — 离线消息存储语义（服务端）
- `XEP-0280 Message Carbons` — 在线多端实时镜像
- `XEP-0313 MAM` — 消息归档，登录时补齐历史
- `XEP-0198 Stream Management` — hop-to-hop ack、连接恢复
- `XEP-0184 Receipts` — 端到端送达回执
- `XEP-0333 Chat Markers` — 已读/已收到标记同步
- `XEP-0352 CSI` — 告知服务端客户端活跃/后台状态，节电
- `XEP-0286` — 移动网络数据优化建议
- `XEP-0030 / XEP-0115` — 能力发现与缓存
- `<delay xmlns='urn:xmpp:delay'>` — 延迟投递原始时间戳

## 注意事项
- **Carbons 与 MAM 登录竞态**：先启用 Carbons，再查 MAM 档案并按 stanza-id 去重；否则会漏消息或重复。XEP-0386 将提供原子操作
- **会话级加密的消息**入离线库后，若密钥撤销会变成不可解密的死信
- **已读同步**：Carbons 到达的消息应视为"对端已读"信号；切忌在检测到其他活跃客户端时还推通知
- **groupchat 不入离线库**：因为用户离线时本就不在房间成员中
- **stanza 尺寸**：avatar 等内嵌数据控制在 72 KiB 内，整 stanza < 100 KiB
- 部分司法辖区对离线消息留存有合规要求（与即时投递规则不同）

## 组合提示
- 与 `im-e2ee`（OMEMO/XEP-0384）组合：离线密文也要保证 prekey 还在，否则收不到解密
- 与 `im-rich-media`（XEP-0363 HTTP Upload）组合：富媒体用 URL 发送，天然兼容离线/群聊/多端
- 客户端侧务必实现 `XEP-0198` + `XEP-0280` + `XEP-0313` 三件套，才算现代 IM
