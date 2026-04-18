---
name: im-rich-media
description: IM 富媒体上传协议（XMPP XEP-0363 HTTP Upload + TUS 断点续传）
tech_stack: [xmpp, im, http]
capability: [realtime-messaging, file-upload]
version: "XEP-0363 urn:xmpp:http:upload:0; TUS 1.0.0"
collected_at: 2026-04-18
---

# IM 富媒体上传（XEP-0363 + TUS）

> 来源：https://xmpp.org/extensions/xep-0363.html, https://tus.io/protocols/resumable-upload

## 用途
- **XEP-0363**：XMPP 客户端向服务端请求一对 upload/download URL（"slot"），随后通过标准 HTTP PUT 上传文件，再把下载 URL 发在消息里实现群聊/离线/多端共享。
- **TUS 1.0.0**：HTTP 上的可恢复上传协议，用 HEAD 查偏移、PATCH 续传，解决大文件弱网上传。

## 何时使用
- IM 客户端发送图片/视频/文档等富媒体
- 需要多端共享同一文件下载链接（靠 URL 分发，天然支持离线/群聊）
- 大文件或弱网场景需要断点续传（TUS）
- Web 端 IM 需处理 CORS 与 CSP 的场景

## 基础用法

### XEP-0363 流程
1. **发现能力**：disco#info feature `urn:xmpp:http:upload:0`，在 XEP-0128 扩展表单里读 `max-file-size`（字节）
```xml
<feature var='urn:xmpp:http:upload:0' />
<x type='result' xmlns='jabber:x:data'>
  <field var='FORM_TYPE' type='hidden'>
    <value>urn:xmpp:http:upload:0</value>
  </field>
  <field var='max-file-size'><value>5242880</value></field>
</x>
```

2. **请求 slot**：发 IQ-get，`<request>` 必带 `filename`、`size`（字节），可选 `content-type`；服务返回 `<slot>` 含 `<put>` + `<get>` URL，可附 `<header>`（只允许 Authorization / Cookie / Expires）。两个 URL 必须 HTTPS 并符合 RFC 3986。

3. **HTTP PUT 上传**：`Content-Length` 必须等于声明 size；带上 slot 返回的全部 header；成功 `201`。

4. **把 `<get>` URL 发在消息体**（可配 `jabber:x:oob`）。

**用途标签**（决定留存策略）：`<message>`（默认）/ `<profile>`（头像等长留存）/ `<ephemeral expire-before='...'>`（XEP-0082 时间）/ `<permanent>`。

**错误**：
- `file-too-large`（可带 `<max-file-size>`）
- `resource-constraint`（配额满，可带 `<retry stamp='...'>` 告知重试时间）
- `forbidden`

### TUS 核心
**必备头**：`Upload-Offset`、`Upload-Length`、`Tus-Resumable`（除 OPTIONS 外所有请求/响应必带）、`Tus-Extension`、`Tus-Max-Size`

**方法**：
- `HEAD <upload>` → 返回当前 `Upload-Offset`，必带 `Cache-Control: no-store`
- `PATCH <upload>` → `Content-Type: application/offset+octet-stream`，从给定 offset 写入剩余字节；成功 `204 No Content` 并返回新 offset
- `OPTIONS` → 探测支持的版本与扩展

**扩展**：Creation（POST 建资源）/ Expiration（`Upload-Expires`）/ Checksum（必须支持 SHA1，失败 `460 Checksum Mismatch`）/ Termination（DELETE 释放，`204`）/ Concatenation（并行分片后合并）

## 关键 API（摘要）
- `urn:xmpp:http:upload:0` — XEP-0363 feature var
- `<request filename size content-type>` / `<slot><put><get><header>` — slot 申请与响应
- HTTP `PUT` + slot 返回 headers — 实际上传
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none';` — 服务端隔离
- CORS：`Access-Control-Allow-Origin/Methods/Headers/Credentials` — Web 客户端必备
- TUS `HEAD` / `PATCH` / `OPTIONS` / `POST`（Creation）/ `DELETE`（Termination）
- TUS headers：`Upload-Offset` / `Upload-Length` / `Tus-Resumable` / `Upload-Expires` / `Upload-Checksum`

## 注意事项
- **PUT URL 超时**建议 ~300 秒；URL 路径必须随机化，防止被猜
- **仅允许** `Authorization / Cookie / Expires` 三类 header 在 slot 中下发；上传端必须剥除 header 名/值中的换行符防注入
- **默认文件不加密存储**；如需 E2EE 需客户端自行加密后上传，密钥通过 E2EE 消息传递
- **隔离上传域 + CSP**，防止通过下载 URL 执行恶意脚本
- **IP 泄漏**：HTTP 上传/下载会把客户端 IP 暴露给对象存储服务
- **TUS Checksum** 服务器必须支持 SHA1，校验失败返回 `460`，非标准 4xx 要客户端特殊处理
- **TUS 上传过期**：断点续传前要看 `Upload-Expires`，过期资源需重新创建
- TUS 的 HEAD 响应 `Cache-Control: no-store` 一定要配，否则 CDN/代理缓存会导致 offset 错乱

## 组合提示
- **XEP-0363 + TUS** 可组合使用：slot 返回的 PUT URL 背后接 TUS 服务端即可支持断点续传（IM 客户端常见做法）
- 与 `im-offline-sync` 天然互补：URL 形态的富媒体消息可直接存入离线库/MAM
- 与 `im-e2ee` 组合：在客户端本地加密文件→上传密文→在 E2EE 消息里带文件 URL + 密钥 + 完整性哈希
- Web 端必须同时配好 CORS 与 CSP，否则 PUT / 预检请求会被浏览器拦截
