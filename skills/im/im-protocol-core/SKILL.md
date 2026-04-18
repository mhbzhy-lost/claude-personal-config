---
name: im-protocol-core
description: "即时通讯（IM）系统公共协议层：C/S 架构模型、消息/会话类型定义、Socket 事件协议、数据库 Schema、消息可靠性策略、安全模式、群聊分发策略。语言无关，供前后端实现层引用。"
tech_stack: [im]
capability: [realtime-messaging, websocket]
---

# IM 公共协议层（语言无关）

> 本 skill 定义即时通讯系统的架构模型、类型协议和设计决策，不包含任何具体框架的实现代码。
> 前端实现参考 `react-im-client` 或 `nextjs-im-fullstack`；后端实现参考 `python-im-server` 或 `nextjs-im-fullstack`。

## 用途

为 IM 系统的前后端实现提供统一的协议基础，确保类型定义、事件名、状态流转、数据库 Schema 在不同技术栈间保持一致。

## 何时使用

- 启动一个新的 IM 功能模块，需要先确定协议设计
- 前后端对齐消息格式、事件名、状态码
- 评审 IM 系统的架构决策

---

## 1. C/S 架构模型

```
┌──────────────────────────────────────────────────┐
│                    Client                         │
│                                                   │
│   UI Layer ──▶ State Layer ──▶ Transport Layer    │
│   (组件渲染)     (内存状态)      (网络通信)         │
└──────────────────────┬───────────────┬────────────┘
                       │               │
                  HTTP/HTTPS      WebSocket (wss://)
                  (REST API)      (实时双向)
                       │               │
┌──────────────────────┼───────────────┼────────────┐
│                    Server                         │
│                                                   │
│   REST Handler ─┐                                 │
│                  ├──▶ Business Logic ──▶ Database  │
│   WS Handler ───┘         │                       │
│                      Redis Pub/Sub                │
│                     (跨进程广播)                    │
└───────────────────────────────────────────────────┘
```

### 双通道职责划分

| 通道 | 协议 | 职责 | 特征 |
|------|------|------|------|
| **REST API** | HTTP/HTTPS | 用户认证、会话 CRUD、历史消息分页、文件上传、用户资料 | 请求-响应、可缓存、幂等 |
| **WebSocket** | WS/WSS | 实时消息推送、typing 状态、在线状态、已读回执、实时通知 | 双向、低延迟、有状态连接 |

**核心原则：REST 处理 CRUD 和查询，WebSocket 处理实时推送和状态同步。**

---

## 2. 消息类型定义

> 以下使用 TypeScript interface 作为类型描述语言（IDL），各语言实现应据此映射。

### 2.1 消息类型枚举

```typescript
enum MessageType {
  TEXT    = 'text',
  IMAGE   = 'image',
  FILE    = 'file',
  AUDIO   = 'audio',
  VIDEO   = 'video',
  SYSTEM  = 'system',   // 系统通知（入群、退群、改名等）
  RECALL  = 'recall',   // 撤回消息
}
```

### 2.2 消息状态机

```
sending ──▶ sent ──▶ delivered ──▶ read
   │                                 
   └──▶ failed ──(重发)──▶ sending   
```

```typescript
enum MessageStatus {
  SENDING   = 'sending',    // 客户端已提交，等待服务端 ACK
  SENT      = 'sent',       // 服务端已持久化
  DELIVERED = 'delivered',  // 已投递到接收方客户端
  READ      = 'read',       // 接收方已阅读
  FAILED    = 'failed',     // 发送失败
}
```

### 2.3 消息实体

```typescript
interface Message {
  id: string;                // 服务端分配的全局唯一 ID（snowflake / UUID）
  clientId: string;          // 客户端生成的临时 ID（乐观更新 & 去重）
  conversationId: string;    // 所属会话 ID
  senderId: string;          // 发送者用户 ID
  type: MessageType;
  content: TextContent | MediaContent | SystemContent;
  status: MessageStatus;
  createdAt: number;         // 服务端时间戳（毫秒）
  updatedAt?: number;
  replyTo?: string;          // 引用的消息 ID
  mentions?: string[];       // @提及的用户 ID 列表
}
```

### 2.4 内容体

```typescript
/** 文本消息 */
interface TextContent {
  text: string;
}

/** 媒体消息（图片/文件/音视频） */
interface MediaContent {
  url: string;               // 文件访问地址
  thumbnail?: string;        // 缩略图地址（图片/视频）
  fileName?: string;
  fileSize?: number;         // 字节
  mimeType?: string;
  width?: number;            // 图片/视频宽度
  height?: number;
  duration?: number;         // 音视频时长（秒）
}

/** 系统消息 */
interface SystemContent {
  action: 'join' | 'leave' | 'rename' | 'pin' | 'recall';
  operatorId: string;        // 操作者
  targetId?: string;         // 操作目标
  extra?: string;            // 附加信息（如新群名）
}
```

---

## 3. 会话类型定义

```typescript
enum ConversationType {
  DIRECT = 'direct',   // 单聊（恰好 2 个成员）
  GROUP  = 'group',    // 群聊（2+ 成员）
}

interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;              // 群名（单聊为空，由客户端推导对方昵称）
  avatar?: string;            // 群头像
  members: string[];          // 成员 ID 列表
  lastMessage?: Message;      // 最新一条消息（列表预览用）
  unreadCount: number;        // 当前用户的未读数
  pinnedAt?: number;          // 置顶时间（null = 未置顶）
  mutedUntil?: number;        // 免打扰截止时间
  updatedAt: number;          // 最后活跃时间（用于排序）
}
```

---

## 4. Socket 事件协议

### 4.1 客户端 → 服务端（C2S）

| 事件名 | Payload | ACK | 说明 |
|--------|---------|-----|------|
| `message:send` | `{ conversationId, clientId, type, content }` | `{ success, messageId?, error? }` | 发送消息，服务端持久化后通过 ACK 返回服务端 ID |
| `message:read` | `{ conversationId, messageId }` | — | 标记已读（messageId 为该会话中最后一条已读消息） |
| `typing:start` | `{ conversationId }` | — | 开始输入 |
| `typing:stop` | `{ conversationId }` | — | 停止输入 |
| `conversation:join` | `conversationId` | — | 加入会话房间（进入聊天页时） |
| `conversation:leave` | `conversationId` | — | 离开会话房间（退出聊天页时） |

### 4.2 服务端 → 客户端（S2C）

| 事件名 | Payload | 说明 |
|--------|---------|------|
| `message:new` | `Message` | 新消息推送 |
| `message:status` | `{ messageId, status }` | 消息状态变更（delivered/read） |
| `message:recalled` | `{ messageId, conversationId }` | 消息被撤回 |
| `typing:update` | `{ conversationId, userId, isTyping }` | 某用户的输入状态变更 |
| `presence:update` | `{ userId, online, lastSeen? }` | 用户在线状态变更 |
| `conversation:update` | `Partial<Conversation> & { id }` | 会话信息变更（新成员、改名等） |
| `sync:messages` | `Message[]` | 连接恢复后的批量消息同步 |

### 4.3 事件协议（TypeScript 类型）

```typescript
interface ClientToServerEvents {
  'message:send': (
    payload: { conversationId: string; clientId: string; type: MessageType; content: any },
    ack: (res: { success: boolean; messageId?: string; error?: string }) => void
  ) => void;
  'message:read': (payload: { conversationId: string; messageId: string }) => void;
  'typing:start': (payload: { conversationId: string }) => void;
  'typing:stop': (payload: { conversationId: string }) => void;
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
}

interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:status': (payload: { messageId: string; status: MessageStatus }) => void;
  'message:recalled': (payload: { messageId: string; conversationId: string }) => void;
  'typing:update': (payload: { conversationId: string; userId: string; isTyping: boolean }) => void;
  'presence:update': (payload: { userId: string; online: boolean; lastSeen?: number }) => void;
  'conversation:update': (conversation: Partial<Conversation> & { id: string }) => void;
  'sync:messages': (messages: Message[]) => void;
}
```

---

## 5. REST API 端点设计

### 5.1 认证

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/auth/login` | 登录，返回 `{ accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | 刷新 accessToken |
| POST | `/api/auth/logout` | 登出，吊销 refreshToken |

### 5.2 会话

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/conversations` | 获取当前用户的会话列表（按 updatedAt 倒序） |
| POST | `/api/conversations` | 创建会话 `{ type, memberIds, name? }` |
| GET | `/api/conversations/:id` | 获取会话详情 |
| PATCH | `/api/conversations/:id` | 更新会话（改名、免打扰、置顶） |
| POST | `/api/conversations/:id/members` | 添加群成员 |
| DELETE | `/api/conversations/:id/members/:uid` | 移除群成员 |

### 5.3 消息

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/conversations/:id/messages?before=&limit=` | 历史消息（游标分页，按时间倒序） |
| GET | `/api/messages/sync?since=` | 获取 since 时间戳之后的所有消息（重连同步用） |
| DELETE | `/api/messages/:id` | 撤回消息（发送者 & 2 分钟内） |

### 5.4 文件

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/upload` | 上传文件（multipart/form-data），返回 `{ url, thumbnail?, width?, height? }` |

### 5.5 用户

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/users/search?q=` | 搜索用户 |
| GET | `/api/users/:id` | 获取用户资料 |
| GET | `/api/users/me` | 获取当前用户信息 |

### 分页约定

历史消息使用**游标分页**（非 offset），以 `createdAt` 时间戳为游标：

```
GET /api/conversations/:id/messages?before=1713200000000&limit=30
```

- `before`：返回早于此时间戳的消息（首次不传，加载最新）
- `limit`：每页条数（默认 30）
- 响应：`Message[]`，按时间正序排列
- 当返回数量 < limit 时，表示已到达历史起点

---

## 6. 数据库 Schema

```sql
-- 用户表
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    VARCHAR(50)  UNIQUE NOT NULL,
  nickname    VARCHAR(100) NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ  DEFAULT now(),
  updated_at  TIMESTAMPTZ  DEFAULT now()
);

-- 会话表
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
  name        VARCHAR(200),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()  -- 最后活跃时间
);

-- 会话成员表（多对多）
CREATE TABLE conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ DEFAULT now(),
  pinned_at       TIMESTAMPTZ,              -- 置顶时间（NULL = 未置顶）
  muted_until     TIMESTAMPTZ,              -- 免打扰截止
  last_read_at    TIMESTAMPTZ DEFAULT now(), -- 最后已读时间（算未读数）
  PRIMARY KEY (conversation_id, user_id)
);

-- 消息表
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       VARCHAR(36) NOT NULL,     -- 客户端临时 ID（去重）
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  type            VARCHAR(20) NOT NULL,
  content         JSONB NOT NULL,           -- 多态内容体
  reply_to        UUID REFERENCES messages(id),
  mentions        UUID[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  recalled_at     TIMESTAMPTZ               -- 非 NULL 表示已撤回
);

-- 消息查询索引（游标分页核心）
CREATE INDEX idx_messages_conv_time
  ON messages (conversation_id, created_at DESC);

-- 去重索引
CREATE UNIQUE INDEX idx_messages_client_id
  ON messages (client_id);

-- 会话成员查询
CREATE INDEX idx_conv_members_user
  ON conversation_members (user_id);
```

### 未读数计算

未读数 = 会话中 `created_at > last_read_at` 的消息数。

```sql
SELECT count(*) AS unread_count
FROM messages m
JOIN conversation_members cm
  ON cm.conversation_id = m.conversation_id
WHERE cm.conversation_id = :conv_id
  AND cm.user_id = :user_id
  AND m.created_at > cm.last_read_at
  AND m.sender_id != :user_id;
```

> 高频查询建议缓存到 Redis：`HSET unread:{userId} {convId} {count}`

---

## 7. 消息可靠性策略

### 7.1 发送可靠性

| 策略 | 实现方式 |
|------|---------|
| **乐观更新** | 客户端发送时立即渲染（status=sending），服务端 ACK 后确认（status=sent） |
| **ACK 确认** | Socket.IO `emit` 的回调函数作为 ACK，服务端持久化后才回调 |
| **clientId 去重** | 每条消息携带客户端生成的 clientId，服务端对 client_id 加唯一索引，防止重复入库 |
| **失败重发** | status=failed 的消息支持手动点击重发，复用原 clientId 实现幂等 |

### 7.2 接收可靠性

| 策略 | 实现方式 |
|------|---------|
| **Socket.IO 缓冲** | 断线期间客户端 emit 的事件自动缓冲，重连后补发 |
| **连接状态恢复** | Socket.IO v4.6+ `connectionStateRecovery`：2 分钟内重连可自动恢复未接收的事件 |
| **REST 兜底同步** | 超出恢复窗口（或恢复失败）时，客户端通过 `GET /api/messages/sync?since=` 拉取缺失消息 |
| **消息去重** | 客户端维护已收到消息的 ID 集合（或 Set），收到重复 ID 直接丢弃 |

### 7.3 重连流程

```
客户端断线
    │
    ▼
Socket.IO 自动重连（指数退避 1s → 30s）
    │
    ▼
重连成功？──▶ socket.recovered === true? ──▶ 是：连接恢复成功，无需额外操作
    │                                         │
    │                                         否
    │                                         ▼
    │                                  REST 同步缺失消息
    │                                  GET /api/messages/sync?since={lastSyncTimestamp}
    │                                  GET /api/conversations（刷新会话列表）
    │                                         │
    │                                         ▼
    │                                  合并到本地状态（去重）
    ▼
重连失败（AUTH_FAILED / TOKEN_EXPIRED）
    │
    ▼
尝试刷新 token → 成功则携带新 token 重连
                  失败则跳转登录页
```

---

## 8. 安全模式

### 8.1 WebSocket 认证

- **传递方式**：通过 Socket.IO `auth` 选项传递 JWT，**不要** 放在 query string 中（避免日志泄露）
- **服务端验证**：在 Socket.IO 连接中间件中验证 token，失败则 `next(new Error('AUTH_FAILED'))`
- **Token 过期**：服务端主动 `socket.disconnect(true)` 断开连接，客户端捕获后走刷新流程
- **传输加密**：生产环境必须使用 `wss://`（TLS）

### 8.2 XSS 防护

- 消息文本渲染使用框架自带的自动转义（React JSX、Vue 模板均默认转义）
- **禁止** 对用户输入的消息内容使用 `dangerouslySetInnerHTML` / `v-html`
- 如需支持 Markdown 富文本，使用白名单清理库（如 DOMPurify）处理后再渲染
- 白名单示例：`['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'br']`

### 8.3 速率限制

| 对象 | 限制 | 说明 |
|------|------|------|
| 消息发送 | 30 条/分钟/用户 | 防刷屏 |
| typing 事件 | 5 次/10 秒/用户 | 防频繁触发 |
| 连接建立 | 10 次/分钟/IP | 防连接洪泛 |
| 文件上传 | 10 次/分钟/用户 | 防滥用存储 |

### 8.4 输入校验

服务端**必须**校验所有客户端输入：
- 消息 content 长度上限（文本 5000 字符）
- 文件大小上限（50MB）
- conversationId 必须是当前用户所属的会话
- senderId 必须与 socket 认证的用户一致（不信任客户端传的 senderId）

---

## 9. 群聊分发策略

### 9.1 小群（< 100 人）：Fan-Out-On-Write

```
发送者 ──▶ 服务端 ──▶ 写入消息表（1 条）
                   ──▶ Socket.IO room 广播（所有在线成员实时收到）
                   ──▶ 更新每个成员的未读计数（Redis HINCRBY）
```

- 优点：读取时直接取未读数，延迟低
- 缺点：成员多时写放大
- 适用：大部分业务场景（100 人以下群占 99%）

### 9.2 大群（100+ 人）：Fan-Out-On-Read

```
发送者 ──▶ 服务端 ──▶ 写入消息表（1 条）
                   ──▶ Socket.IO room 广播（在线成员实时收到）
                   ──▶ 不主动计算每个成员的未读数
```

- 成员打开会话时，才查询 `count(messages WHERE created_at > last_read_at)`
- 优点：写入轻量
- 缺点：打开会话时需查询计算

### 9.3 跨进程广播（Redis Pub/Sub）

多服务器实例部署时，Socket.IO 的房间广播仅限本进程。需要 Redis Adapter 实现跨进程消息转发：

```
Server A (用户 X 在此)          Server B (用户 Y 在此)
       │                              │
       └──── Redis Pub/Sub Channel ───┘
             conv:{conversationId}
```

---

## 10. 通用陷阱

| 陷阱 | 正确做法 |
|------|---------|
| 消息时间用客户端本地时间 | 所有时间以服务端时间为准，客户端仅做展示格式化 |
| WebSocket URL 或 token 放在 query string | 使用 `auth` 选项传递 token |
| 消息列表不去重导致重连后重复显示 | 用 `message.id` 或 `clientId` 做唯一性校验 |
| 未读数只在客户端计算 | 服务端维护权威未读数，客户端可乐观增减 |
| typing 事件发送过于频繁 | 加 debounce，3 秒超时自动停止 |
| 不处理 Socket.IO 的 `io server disconnect` | 此原因表示服务端主动断开，需走重新认证流程 |
| 大群用 Fan-Out-On-Write 导致写放大 | 100+ 人群切换为 Fan-Out-On-Read |
| 消息分页用 offset | 用游标分页（before timestamp），避免数据变动导致重复/遗漏 |
| senderId 从客户端传入不做校验 | 服务端从认证上下文取 userId，忽略客户端传的 senderId |
| 文件直传消息体导致消息过大 | 先上传到文件服务拿 URL，再作为消息内容发送 |
