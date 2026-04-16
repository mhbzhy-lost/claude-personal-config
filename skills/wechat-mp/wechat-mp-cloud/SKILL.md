---
name: wechat-mp-cloud
description: "微信小程序云开发：云函数、云数据库（CRUD/聚合/实时推送/安全规则）、云存储、云托管。"
tech_stack: [wechat-miniprogram, wechat-cloud]
language: [javascript]
---

# 微信小程序云开发（全栈）

> 来源：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
> 版本基准：基础库 2.x+，云开发 SDK 最新稳定版。

## 用途

无需自建服务器，在小程序端直接调用云函数、云数据库、云存储，快速实现全栈应用。

## 何时使用

- 小程序需要后端逻辑但不想自建/运维服务器
- 需要数据库 CRUD、文件上传下载、用户鉴权等常见后端能力
- 需要实时数据推送（如聊天、协作编辑）
- 需要定时任务（如每日统计、清理过期数据）
- 需要容器化部署自定义后端服务（云托管）

## 初始化

### 小程序端

```js
// app.js — onLaunch 中初始化
App({
  onLaunch() {
    wx.cloud.init({
      env: 'my-env-id',  // 云环境 ID（控制台获取）
      traceUser: true,    // 是否在控制台记录用户访问
    });
  },
});
```

### 云函数端

```js
// 云函数中获取云开发实例
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV, // 自动使用调用方的云环境
});
```

### 多环境管理

```js
// 根据条件切换环境
const envId = __wxConfig.envVersion === 'release'
  ? 'prod-env-id'
  : 'dev-env-id';

wx.cloud.init({ env: envId });
```

- 每个云环境拥有独立的数据库、存储、云函数
- `cloud.DYNAMIC_CURRENT_ENV` 让云函数自动匹配调用方环境，避免硬编码

## 云函数

### 目录结构

```
cloudfunctions/          # project.config.json 中指定的云函数根目录
├── getUser/
│   ├── index.js         # 入口文件
│   ├── package.json
│   └── config.json      # 可选：超时/内存/触发器配置
├── createOrder/
│   ├── index.js
│   └── package.json
```

### 基础云函数

```js
// cloudfunctions/getUser/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  // event: 调用方传入的参数
  // context.OPENID: 自动注入的用户 openid（无需手动鉴权）
  const { OPENID } = cloud.getWXContext();

  return {
    openid: OPENID,
    data: event.name,
  };
};
```

### 小程序端调用

```js
const res = await wx.cloud.callFunction({
  name: 'getUser',
  data: { name: '张三' },
});
console.log(res.result); // { openid: 'xxx', data: '张三' }
```

### 云函数调用云函数

```js
// 在云函数内部调用另一个云函数
const res = await cloud.callFunction({
  name: 'anotherFunc',
  data: { key: 'value' },
});
```

### 定时触发器

```json
// cloudfunctions/dailyClean/config.json
{
  "triggers": [
    {
      "name": "dailyTrigger",
      "type": "timer",
      "config": "0 0 2 * * * *"
    }
  ]
}
```

- cron 表达式共 7 位：`秒 分 时 日 月 星期 年`
- 上传触发器：开发者工具右键云函数 -> "上传触发器"
- 定时触发的 `event` 中不含 `OPENID`

### 云函数超时与内存

```json
// config.json
{
  "timeout": 60,
  "memorySize": 256
}
```

- 默认超时 3 秒，最大 60 秒
- 默认内存 256MB，可选 256/512/1024MB

## 云数据库

### 获取引用

```js
// 小程序端
const db = wx.cloud.database();
const collection = db.collection('todos');

// 云函数端
const db = cloud.database();
const collection = db.collection('todos');
```

### CRUD 操作

#### 新增（add）

```js
const res = await db.collection('todos').add({
  data: {
    title: '学习云开发',
    done: false,
    createTime: db.serverDate(), // 服务端时间戳
  },
});
console.log(res._id); // 新记录 ID
```

#### 查询（get / where）

```js
// 查询单条
const res = await db.collection('todos').doc('doc-id').get();
console.log(res.data);

// 条件查询
const _ = db.command;
const res = await db.collection('todos')
  .where({
    done: false,
    createTime: _.gte(new Date('2024-01-01')),
  })
  .orderBy('createTime', 'desc')
  .skip(0)
  .limit(20)
  .field({ title: true, done: true }) // 只返回指定字段
  .get();
console.log(res.data); // 数组
```

#### 更新（update）

```js
const _ = db.command;

// 更新单条
await db.collection('todos').doc('doc-id').update({
  data: {
    done: true,
    updateTime: db.serverDate(),
  },
});

// 批量更新（仅云函数端支持）
await db.collection('todos').where({ done: true }).update({
  data: {
    archived: true,
  },
});
```

#### 删除（remove）

```js
// 删除单条
await db.collection('todos').doc('doc-id').remove();

// 批量删除（仅云函数端支持）
await db.collection('todos').where({ archived: true }).remove();
```

### 查询指令（db.command）

```js
const _ = db.command;

// 比较
_.eq(value)    _.neq(value)   _.gt(value)    _.gte(value)
_.lt(value)    _.lte(value)   _.in([...])    _.nin([...])

// 逻辑
_.and([cond1, cond2])    _.or([cond1, cond2])    _.not(cond)

// 字段操作（用于 update）
_.set(value)       // 覆盖设置
_.remove()         // 删除字段
_.inc(number)      // 自增
_.mul(number)      // 自乘
_.push(value)      // 数组追加
_.pop()            // 数组弹出
_.shift()          // 数组头部弹出
_.unshift(value)   // 数组头部插入

// 示例：数组追加
await db.collection('todos').doc('id').update({
  data: {
    tags: _.push('important'),
  },
});
```

### 聚合管道（aggregate）

```js
const $ = db.command.aggregate;

const res = await db.collection('orders')
  .aggregate()
  .match({ status: 'paid' })
  .group({
    _id: '$userId',
    totalAmount: $.sum('$amount'),
    count: $.sum(1),
  })
  .sort({ totalAmount: -1 })
  .limit(10)
  .end();
console.log(res.list);
```

#### lookup（联表查询）

```js
const res = await db.collection('orders')
  .aggregate()
  .lookup({
    from: 'users',           // 关联的集合
    localField: 'userId',    // 当前集合的字段
    foreignField: '_id',     // 关联集合的字段
    as: 'userInfo',          // 输出字段名
  })
  .end();
// 每条 order 的 userInfo 为匹配到的 user 数组
```

#### 常用聚合阶段

```
.match({})       过滤
.group({})       分组
.sort({})        排序
.limit(n)        限制条数
.skip(n)         跳过
.project({})     投影（选择/重命名字段）
.lookup({})      联表
.unwind('$arr')  展开数组
.replaceRoot({}) 替换根文档
.end()           执行（必须调用）
```

### 实时推送（watch）

```js
const watcher = db.collection('messages')
  .where({ roomId: 'room-001' })
  .orderBy('createTime', 'asc')
  .watch({
    onChange(snapshot) {
      // snapshot.docs: 当前查询结果完整文档列表
      // snapshot.docChanges: 本次变更详情
      //   type: 'init' | 'add' | 'update' | 'remove'
      console.log('数据变更', snapshot.docChanges);
    },
    onError(err) {
      console.error('监听错误', err);
    },
  });

// 关闭监听（页面 onUnload 时必须调用）
watcher.close();
```

- 小程序端最多同时 50 个监听
- `onChange` 首次回调为 `init` 类型，包含初始数据
- 监听条件必须明确，避免监听整个集合

### 事务（runTransaction）

```js
const result = await db.runTransaction(async (transaction) => {
  const accountRes = await transaction.collection('accounts')
    .doc('account-id')
    .get();

  const account = accountRes.data;
  if (account.balance < 100) {
    await transaction.rollback('余额不足');
  }

  await transaction.collection('accounts').doc('account-id').update({
    data: { balance: _.inc(-100) },
  });
  await transaction.collection('orders').add({
    data: { amount: 100, accountId: 'account-id' },
  });

  return { success: true };
});
```

- 事务内最多 5 次读 + 5 次写
- 事务内不支持聚合查询
- `rollback(reason)` 会终止事务并抛出错误

### 安全规则

在云开发控制台为每个集合设置 JSON 安全规则：

```json
{
  "read": "auth.openid == doc._openid",
  "write": "auth.openid == doc._openid"
}
```

常用规则模式：

```json
// 仅创建者可读写
{ "read": "auth.openid == doc._openid", "write": "auth.openid == doc._openid" }

// 所有人可读，仅创建者可写
{ "read": true, "write": "auth.openid == doc._openid" }

// 仅云函数可读写（前端完全禁止）
{ "read": false, "write": false }

// 所有登录用户可读写
{ "read": "auth.openid != null", "write": "auth.openid != null" }
```

- `auth.openid`：当前用户的 openid（自动注入）
- `doc`：当前操作的文档
- `doc._openid`：文档的 `_openid` 字段（add 时自动写入）
- 安全规则只对小程序端直接操作生效，云函数端拥有管理员权限，不受规则限制

## 云存储

### 上传文件

```js
const res = await wx.cloud.uploadFile({
  cloudPath: `images/${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  filePath: tempFilePath, // wx.chooseImage 等 API 返回的本地临时路径
});
console.log(res.fileID); // cloud://env-id.xxxx/images/xxx.png
```

### 下载文件

```js
const res = await wx.cloud.downloadFile({
  fileID: 'cloud://env-id.xxxx/images/xxx.png',
});
console.log(res.tempFilePath); // 本地临时路径
```

### 获取临时链接

```js
const res = await wx.cloud.getTempFileURL({
  fileList: ['cloud://env-id.xxxx/images/xxx.png'],
});
console.log(res.fileList[0].tempFileURL); // https 临时链接（有效期约 2 小时）
```

### 删除文件

```js
await wx.cloud.deleteFile({
  fileList: ['cloud://env-id.xxxx/images/xxx.png'],
});
```

### 云函数端操作存储

```js
// 云函数中使用 cloud 而非 wx.cloud
const res = await cloud.uploadFile({
  cloudPath: 'server-upload/data.json',
  fileContent: Buffer.from(JSON.stringify({ key: 'value' })),
});
```

- `cloudPath` 不能以 `/` 开头，不能含连续 `/`
- 文件名建议加随机后缀避免覆盖
- 单文件上传限制：小程序端 50MB，云函数端 50MB
- `fileID` 是云存储文件的唯一标识，格式为 `cloud://环境ID.xxx/路径`

## 云托管

### 概念

云托管基于 Docker 容器，适用于需要自定义运行时、长连接、WebSocket 等场景。

### 部署流程

1. 在云开发控制台开通云托管
2. 准备 Dockerfile：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 80
CMD ["node", "server.js"]
```

3. 通过控制台上传代码或关联 Git 仓库自动部署
4. 配置服务域名，小程序端通过 HTTP 调用

### 小程序端调用云托管

```js
const res = await wx.cloud.callContainer({
  config: {
    env: 'my-env-id',
  },
  path: '/api/users',
  method: 'POST',
  header: {
    'X-WX-SERVICE': 'my-service',  // 服务名称（必须）
    'content-type': 'application/json',
  },
  data: { name: '张三' },
});
console.log(res.data);
```

- `X-WX-SERVICE` header 必须指定目标服务名
- 云托管内可通过 `X-WX-OPENID` header 获取调用者 openid（平台自动注入）
- 容器默认监听 80 端口
- 支持自动扩缩容（0 实例起步）

## 关键 API 速查

| API | 用途 | 端 |
|---|---|---|
| `wx.cloud.init({ env })` | 初始化云开发 | 小程序 |
| `wx.cloud.callFunction({ name, data })` | 调用云函数 | 小程序 |
| `db.collection(name)` | 获取集合引用 | 两端 |
| `.add({ data })` | 新增文档 | 两端 |
| `.doc(id).get()` | 查询单条 | 两端 |
| `.where({}).get()` | 条件查询 | 两端 |
| `.doc(id).update({ data })` | 更新文档 | 两端 |
| `.doc(id).remove()` | 删除文档 | 两端 |
| `.where({}).update/remove` | 批量更新/删除 | 仅云函数 |
| `.aggregate()...end()` | 聚合查询 | 两端 |
| `.watch({ onChange, onError })` | 实时推送 | 小程序 |
| `db.runTransaction(fn)` | 事务 | 云函数 |
| `db.serverDate()` | 服务端时间戳 | 两端 |
| `wx.cloud.uploadFile` | 上传文件 | 小程序 |
| `wx.cloud.downloadFile` | 下载文件 | 小程序 |
| `wx.cloud.getTempFileURL` | 获取临时 URL | 小程序 |
| `wx.cloud.deleteFile` | 删除文件 | 小程序 |
| `wx.cloud.callContainer` | 调用云托管 | 小程序 |

## 注意事项

- **小程序端 vs 云函数端权限差异**：小程序端受安全规则限制，`where` 批量 `update/remove` 不可用；云函数端拥有管理员权限，不受安全规则约束
- **查询返回上限**：小程序端单次 `get()` 最多 20 条，云函数端最多 1000 条。超过需分页（`skip` + `limit` 或用 `startAfter`）
- **`_openid` 自动注入**：小程序端 `add` 时自动写入当前用户 `_openid`，云函数端不自动写入，需手动从 `cloud.getWXContext()` 获取并写入
- **`db.serverDate()` 优先于 `new Date()`**：避免客户端时钟不准导致时间不一致
- **聚合 `end()` 必须调用**：聚合管道链最后必须调用 `.end()` 才会执行
- **`watch` 必须关闭**：页面卸载时务必调用 `watcher.close()`，否则连接泄漏
- **云函数冷启动**：首次调用或长时间未调用会有 1-3 秒冷启动延迟，高频函数建议保持预置并发
- **环境隔离**：不同环境（dev/prod）的数据库、存储完全隔离，不能跨环境访问
- **云函数 `event` 大小限制**：调用参数序列化后不超过 100KB（大数据应走云存储）
- **集合索引**：查询频繁的字段务必在控制台建立索引，否则大数据量下查询极慢或超时

## 组合提示

- 配合 `wechat-mp-core`（小程序基础框架）使用，掌握页面生命周期和组件通信
- 用户登录场景：云函数中 `cloud.getWXContext()` 获取 openid，无需 `wx.login` + 后端换取（简化鉴权链路）
- 复杂业务逻辑建议封装在云函数中，小程序端仅做展示和调用，避免在前端暴露业务规则
- 需要 WebSocket 或自定义运行时（Python/Go 等）时，使用云托管替代云函数
