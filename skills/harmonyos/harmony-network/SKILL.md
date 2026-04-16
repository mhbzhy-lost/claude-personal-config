---
name: harmony-network
description: "HarmonyOS 网络通信：HTTP 请求、WebSocket、网络状态监听、证书锁定。"
tech_stack: [harmonyos]
---

# HarmonyOS 网络通信

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/http-request-0000001477981009
> 版本基准：HarmonyOS 5 / API 12+

## 用途

提供 HTTP 数据请求、WebSocket 双向通信、网络状态监听等能力，是 HarmonyOS 应用进行网络通信的核心模块。

## 何时使用

- 调用 RESTful API 获取/提交数据
- 建立 WebSocket 长连接进行实时通信（聊天、推送）
- 监听网络可用性变化，实现离线提示或自动重连
- 需要 HTTPS 证书锁定以防范中间人攻击

## 权限声明

在 `src/main/module.json5` 的 `module` 节点内声明：

```json
{
  "module": {
    "requestPermissions": [
      { "name": "ohos.permission.INTERNET" },
      { "name": "ohos.permission.GET_NETWORK_INFO" }
    ]
  }
}
```

| 权限 | 用途 | 授权方式 |
|------|------|----------|
| `ohos.permission.INTERNET` | 发起 HTTP / WebSocket 请求 | system_grant（自动授予） |
| `ohos.permission.GET_NETWORK_INFO` | 查询网络状态、监听网络变化 | system_grant（自动授予） |

## HTTP 请求（@ohos.net.http）

### 导入

```typescript
import { http } from '@kit.NetworkKit';
```

> API 12+ 推荐使用 `@kit.NetworkKit`，旧写法 `import http from '@ohos.net.http'` 仍兼容。

### GET 请求

```typescript
// 每次请求必须新建实例，不可复用
let httpRequest = http.createHttp();

httpRequest.request('https://api.example.com/users?id=1', {
  method: http.RequestMethod.GET,
  header: {
    'Content-Type': 'application/json'
  },
  connectTimeout: 10000,
  readTimeout: 10000,
  expectDataType: http.HttpDataType.OBJECT  // 自动 JSON 解析
}).then((resp) => {
  if (resp.responseCode === http.ResponseCode.OK) {
    // expectDataType 为 OBJECT 时 result 已是对象
    console.info('data: ' + JSON.stringify(resp.result));
  }
}).catch((err: Error) => {
  console.error('request failed: ' + err.message);
}).finally(() => {
  httpRequest.destroy(); // 必须销毁，否则内存泄漏
});
```

### POST 请求

```typescript
let httpRequest = http.createHttp();

httpRequest.request('https://api.example.com/login', {
  method: http.RequestMethod.POST,
  header: {
    'Content-Type': 'application/json'
  },
  extraData: JSON.stringify({
    username: 'admin',
    password: '123456'
  }),
  connectTimeout: 15000,
  readTimeout: 15000,
  expectDataType: http.HttpDataType.STRING
}).then((resp) => {
  if (resp.responseCode === http.ResponseCode.OK) {
    let result = JSON.parse(resp.result as string);
    console.info('token: ' + result.token);
  }
}).catch((err: Error) => {
  console.error('login failed: ' + err.message);
}).finally(() => {
  httpRequest.destroy();
});
```

### HttpRequestOptions 关键参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `method` | `RequestMethod` | GET / POST / PUT / DELETE 等 |
| `header` | `Object` | 请求头 |
| `extraData` | `string \| Object` | 请求体（POST/PUT 时使用） |
| `expectDataType` | `HttpDataType` | STRING / OBJECT / ARRAY_BUFFER |
| `connectTimeout` | `number` | 连接超时（ms），默认 60000 |
| `readTimeout` | `number` | 读取超时（ms），默认 60000 |
| `usingCache` | `boolean` | 是否使用缓存，默认 true |
| `usingProtocol` | `HttpProtocol` | HTTP1_1 / HTTP2 |
| `caPath` | `string` | 自定义 CA 证书路径 |
| `certificatePinning` | `CertificatePinning` | 证书锁定配置 |

### HttpResponse 结构

| 属性 | 类型 | 说明 |
|------|------|------|
| `responseCode` | `number` | HTTP 状态码 |
| `result` | `string \| Object \| ArrayBuffer` | 响应体（类型由 expectDataType 决定） |
| `header` | `Object` | 响应头 |
| `cookies` | `string` | 响应 Cookie |

### 监听响应头

```typescript
httpRequest.on('headersReceive', (header) => {
  console.info('header: ' + JSON.stringify(header));
});
```

## WebSocket（@ohos.net.webSocket）

### 导入

```typescript
import { webSocket } from '@kit.NetworkKit';
```

### 完整用法

```typescript
let ws = webSocket.createWebSocket();

// 1. 先注册事件监听
ws.on('open', (err, value) => {
  console.info('WebSocket connected');
  // 连接成功后才能发送
  ws.send('Hello Server', (err, success) => {
    if (!err) {
      console.info('message sent');
    }
  });
});

ws.on('message', (err, value: string | ArrayBuffer) => {
  console.info('received: ' + value);
});

ws.on('close', (err, value: { code: number; reason: string }) => {
  console.info('closed: ' + value.code + ' ' + value.reason);
});

ws.on('error', (err) => {
  console.error('WebSocket error: ' + JSON.stringify(err));
});

// 2. 发起连接
ws.connect('wss://echo.example.com/ws', (err, connected) => {
  if (!err && connected) {
    console.info('connect success');
  }
});

// 3. 主动关闭（在合适时机调用）
// ws.close();
```

### 关键方法

| 方法 | 说明 |
|------|------|
| `connect(url, callback?)` | 建立连接，url 支持 ws:// 和 wss:// |
| `send(data, callback?)` | 发送 string 或 ArrayBuffer |
| `close(options?, callback?)` | 关闭连接，可指定 code 和 reason |
| `on(type, callback)` | 注册事件：open / message / close / error |
| `off(type, callback?)` | 取消事件监听 |

## 网络状态监听（@ohos.net.connection）

### 导入

```typescript
import { connection } from '@kit.NetworkKit';
```

### 查询当前网络

```typescript
// 判断是否有网络
connection.hasDefaultNet().then((hasNet) => {
  console.info('has network: ' + hasNet);
});

// 获取默认网络详情
connection.getDefaultNet().then((netHandle) => {
  connection.getConnectionProperties(netHandle).then((props) => {
    console.info('link info: ' + JSON.stringify(props.linkAddresses));
  });
});
```

### 订阅网络变化

```typescript
import { BusinessError } from '@kit.BasicServicesKit';

let netSpecifier: connection.NetSpecifier = {
  netCapabilities: {
    bearerTypes: [connection.NetBearType.BEARER_WIFI],
    networkCap: [connection.NetCap.NET_CAPABILITY_INTERNET]
  }
};

let conn = connection.createNetConnection(netSpecifier, 10000);

conn.on('netAvailable', (data: connection.NetHandle) => {
  console.info('network available, netId=' + data.netId);
});

conn.on('netLost', (data: connection.NetHandle) => {
  console.info('network lost, netId=' + data.netId);
});

conn.on('netUnavailable', () => {
  console.info('network unavailable');
});

// 注册监听（必须调用，否则 on 不生效）
conn.register((err: BusinessError) => {
  if (err) {
    console.error('register failed: ' + JSON.stringify(err));
  }
});

// 页面销毁时取消注册
// conn.unregister((err) => {});
```

### NetBearType 常量

| 常量 | 说明 |
|------|------|
| `BEARER_CELLULAR` | 蜂窝数据 |
| `BEARER_WIFI` | Wi-Fi |
| `BEARER_ETHERNET` | 以太网 |

不传 `netSpecifier` 参数时，`createNetConnection()` 监听所有类型网络。

## 证书锁定与安全配置

### 方式一：HttpRequestOptions 内联配置

```typescript
httpRequest.request('https://secure.example.com/api', {
  method: http.RequestMethod.GET,
  certificatePinning: [{
    publicKeyHash: 'g8CsdcpyAKxmLoWFvMd2hC7ZDUy7L4E2NYOi1i8qEtE=',
    hashAlgorithm: 'SHA-256'
  }]
});
```

### 方式二：network_config.json 全局配置

在 `src/main/resources/base/profile/network_config.json` 中配置：

```json
{
  "network-security-config": {
    "base-config": {
      "trust-anchors": [
        { "certificates": "/res/appCaCert" }
      ]
    },
    "domain-config": [
      {
        "domains": [
          { "include-subdomains": true, "name": "example.com" }
        ],
        "trust-anchors": [
          { "certificates": "/res/domainCaCert" }
        ]
      }
    ]
  }
}
```

证书文件放置路径：
- 应用级 CA：`src/main/resources/base/res/appCaCert/`
- 域名级 CA：`src/main/resources/base/res/domainCaCert/`

> 务必配置至少一个备用公钥哈希。服务端证书更换公钥后，若 App 未更新锁定配置，网络连接将失败。

## JSON 序列化 / 反序列化

ArkTS 使用标准 `JSON` API：

```typescript
// 序列化
let body = JSON.stringify({ name: 'test', age: 18 });

// 反序列化（从 STRING 响应）
let obj = JSON.parse(resp.result as string) as MyInterface;

// 自动反序列化（推荐）
// 设置 expectDataType: http.HttpDataType.OBJECT
// resp.result 直接为对象，无需手动 parse
```

**类型安全建议**：定义接口约束响应结构：

```typescript
interface UserInfo {
  id: number;
  name: string;
  email: string;
}

// expectDataType = OBJECT 时
let user = resp.result as UserInfo;
```

## 常见陷阱

1. **httpRequest 不可复用**：每次请求必须 `createHttp()` 新建实例。复用会导致请求失败或行为异常。
2. **必须调用 destroy()**：请求完成后（无论成功失败）调用 `httpRequest.destroy()` 释放资源，否则内存泄漏。
3. **GET 的 extraData 不能传 JSON 对象**：GET 请求的 `extraData` 会被拼接到 URL，传 JSON 对象无效。正确做法是手动拼接 query string 或传 URL 编码字符串（如 `id=1&name=test`）。
4. **WebSocket 先注册后连接**：必须先调用 `on()` 注册事件，再调用 `connect()`，否则 open 事件可能丢失。
5. **NetConnection 必须 register()**：仅调用 `on()` 不会生效，必须配合 `register()` 才能收到网络状态回调。页面销毁时记得 `unregister()`。
6. **子线程限制**：网络请求默认在主线程发起，回调也在主线程。大量并发请求建议结合 TaskPool 使用，避免阻塞 UI。
7. **expectDataType 与 result 类型对应**：设为 OBJECT 时 result 为对象；设为 STRING 时 result 为字符串。类型不匹配会导致运行时错误。

## 组合提示

- **状态管理**：网络请求结果通常存入 `@State` / `@StorageLink` 驱动 UI 刷新，参考 `harmony-state-management`
- **权限模型**：INTERNET 和 GET_NETWORK_INFO 均为 system_grant，无需用户弹窗授权，参考 `harmony-permissions`
- **并发优化**：大量并发请求可使用 TaskPool 分发到工作线程，参考 `harmony-concurrency`
- **数据持久化**：网络数据可缓存到 Preferences / RDB，参考 `harmony-data-persistence`
