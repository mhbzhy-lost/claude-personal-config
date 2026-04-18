---
name: video-player-drm
description: 使用 W3C Encrypted Media Extensions (EME) 为 Web 视频接入 Widevine/PlayReady/FairPlay 等 DRM 系统，覆盖密钥系统选择、会话生命周期与许可证交换流程
tech_stack: [web, html5-video, eme, drm, widevine, playready, fairplay]
language: [javascript]
capability: [media-processing, encryption]
version: "EME W3C Working Draft 2025-11-26; FairPlay Streaming Server SDK 26"
collected_at: 2026-04-18
---

# Web DRM（Encrypted Media Extensions）

> 来源：https://www.w3.org/TR/encrypted-media-2/、https://web.dev/articles/eme-basics、https://developer.apple.com/streaming/fps/、https://learn.microsoft.com/en-us/playready/

## 用途

EME 扩展 `HTMLMediaElement`，让 Web 应用控制加密媒体的解密与许可证交换，同一套代码 + 同一份加密文件可跨浏览器运行于不同 DRM 系统。应用只负责许可证管线，CDM（Content Decryption Module）负责实际解密。

## 何时使用

- 付费点播 / 付费直播内容保护，需要阻止裸 URL 抓流
- 跨浏览器统一 DRM 接入（Chrome/Edge → Widevine、Edge → PlayReady、Safari → FairPlay）
- 通过 Common Encryption (CENC)：一次加密，多 DRM 系统复用
- 调试 / 测试：用 Clear Key（所有支持 EME 的浏览器必须实现）

非商业场景（演示、低价值内容）不值得上 DRM——申请生产 FairPlay 凭据需 Apple 审批，且只批给"直接向消费者提供流媒体服务"的团队。

## 基础用法：Clear Key 完整流程

```javascript
const video = document.querySelector('video');
const config = [{
  initDataTypes: ['webm'],
  videoCapabilities: [{ contentType: 'video/webm; codecs="vp8"' }],
}];

video.addEventListener('encrypted', handleEncrypted);

navigator.requestMediaKeySystemAccess('org.w3.clearkey', config)
  .then(access => access.createMediaKeys())
  .then(mediaKeys => video.setMediaKeys(mediaKeys))
  .catch(err => console.error('MediaKeys setup failed', err));

function handleEncrypted(event) {
  const session = video.mediaKeys.createSession();
  session.addEventListener('message', handleMessage);
  session.generateRequest(event.initDataType, event.initData)
    .catch(err => console.error('generateRequest failed', err));
}

function handleMessage(event) {
  // 生产环境：POST event.message 到许可证服务器，拿到响应
  const license = generateLicense(event.message);  // Clear Key 可本地构造
  event.target.update(license)
    .catch(err => console.error('session.update failed', err));
}
```

## 核心工作流（11 步）

1. 应用尝试播放加密媒体
2. 浏览器识别加密，触发 `encrypted` 事件（携带 `initDataType`、`initData`）
3. 应用调用 `navigator.requestMediaKeySystemAccess(keySystem, config)` 选定 key system
4. 创建 `MediaKeys`，`video.setMediaKeys(mediaKeys)`
5. `mediaKeys.createSession()` 创建 `MediaKeySession`
6. `session.generateRequest(initDataType, initData)` 触发许可证请求
7. CDM 通过 session `message` 事件返回待发送数据
8. 应用将 `event.message` POST 到许可证服务器
9. 应用将服务器响应通过 `session.update(response)` 回灌 CDM
10. CDM 解密媒体
11. 播放继续

## 关键 API

| 接口 | 用途 |
|------|------|
| `Navigator.requestMediaKeySystemAccess(keySystem, configs)` | 发现并请求 key system，返回 `MediaKeySystemAccess` |
| `MediaKeySystemAccess.createMediaKeys()` | 创建 `MediaKeys` 实例 |
| `HTMLMediaElement.setMediaKeys(mediaKeys)` | 绑定到 video |
| `HTMLMediaElement` 上的 `encrypted` 事件 | 通知加密流，携带 `initData` |
| `MediaKeys.createSession(sessionType?)` | 创建许可证会话 |
| `MediaKeySession.generateRequest(initDataType, initData)` | 生成许可证请求 |
| `MediaKeySession` 的 `message` 事件 | CDM 要求发往许可证服务器的数据 |
| `MediaKeySession.update(response)` | 把服务器响应喂回 CDM |
| `MediaKeySession.close()` / `.remove()` | 结束 / 删除持久许可证 |

### 常见 keySystem 字符串

- `com.widevine.alpha`（Google Widevine）
- `com.microsoft.playready` / `com.microsoft.playready.recommendation`
- `com.apple.fps` / `com.apple.fps.1_0`（Safari FairPlay）
- `org.w3.clearkey`（所有浏览器强制支持，仅用于测试）

### 会话类型

- `temporary`：不持久化许可证与密钥（默认）
- `persistent-license`：持久化许可证，需维护销毁记录

## DRM 系统对照

| 系统 | 适用浏览器 | 凭据审批 |
|------|-----------|---------|
| **Widevine** | Chrome / Edge / Firefox / Android | Google 申请 |
| **PlayReady** | Edge / Xbox / Windows / 智能电视 | Microsoft 授权 |
| **FairPlay Streaming** | Safari (macOS/iOS/tvOS) | Apple Developer Program 审批，仅批"直接面向消费者的流媒体服务" |

**Common Encryption (CENC)**：一次用统一方案加密，多 DRM 系统通过各自的许可证/KID 解密同一份密文，消除"每 DRM 一条垂直栈"的成本。

### FairPlay Streaming Server SDK 26 新特性

- CBCS 加密内容的最高级密钥保护
- 支持多证书 bundle 与 provisioning 数据
- SPC v3（带完整性保护的许可证请求）、SDK 4 凭据
- 1024/2048-bit 证书 bundle
- Swift / Rust 参考实现（内存与类型安全）
- 预编译加密库 + 示例 HTTP 服务器 + 默认业务规则

## 注意事项

- **HTTPS 强制**：EME 要求 secure context，本地开发用 `localhost` 或自签证书
- **Permissions Policy**：嵌入 iframe 需设置 `allow="encrypted-media"`
- **distinctive identifier**：可识别设备的标识符需用户同意；隐私模式通常禁用持久会话
- **Clear Key 仅测试用**：没有真实保护能力，生产必须用商业 DRM
- **许可证请求透传**：`event.message` 是不透明字节流，应用只负责运输，不要尝试解析
- **FairPlay 生产部署**：第三方代持账号不会被批准，Account Holder 本人提交
- **HDCP 策略**：EME 新版支持 HDCP 策略状态查询和加密方案能力检测
- **MSE + EME 组合**：实际项目通常通过 hls.js/dash.js/shaka-player 承担 MSE 与密钥协商，应用只需配 keySystem + 许可证 URL + `licenseXhrSetup`

## 组合提示

- 与 `video-player-hls-dash` 搭配：hls.js 通过 `emeEnabled + drmSystems + licenseXhrSetup` 配置；dash.js 用 `setProtectionData()`
- 与 CENC 打包工具（Shaka Packager、Bento4）搭配生成多 DRM 通吃的密文
- FairPlay 无法走 MSE，iOS Safari 只能用原生 HLS + FPS AVContentKeySession
