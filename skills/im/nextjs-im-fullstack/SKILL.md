---
name: nextjs-im-fullstack
description: "IM 系统 Next.js 全栈实现：Custom Server 集成 Socket.IO、Route Handlers REST API、Prisma ORM、RSC/Client Component 分层、前后端类型共享。协议定义见 im-protocol-core。"
tech_stack: [nextjs, react, socketio, im, prisma]
language: [typescript]
capability: [realtime-messaging, websocket, api-design, orm]
---

# Next.js 全栈 IM 系统实现

> 技术栈：Next.js 15 App Router / Socket.IO 4.x / Prisma 6 / Zustand / TypeScript
> 协议定义（消息类型、Socket 事件、数据库 Schema、安全模式）参见 `im-protocol-core` skill
> 与 react-im-client + python-im-server 分离方案不同，本 skill 展示如何用 Next.js 单体覆盖前后端

## 用途

提供基于 Next.js 的 IM 全栈实现方案，在一个项目中统一管理前后端代码，共享 TypeScript 类型，通过 Custom Server 支持 WebSocket 实时通信。

## 何时使用

- 团队以 TypeScript 为主，希望前后端在一个 repo 中迭代
- 项目规模中等（日活 < 10 万），不需要独立的后端服务
- 需要快速启动 IM 功能原型并逐步完善
- 团队熟悉 Next.js 生态，希望复用 RSC、Route Handlers、Middleware 等能力

## 何时不使用

- 后端需要 Python/Go/Java 等非 Node.js 技术栈
- 需要独立扩缩后端实例（WebSocket 和 HTTP 分别扩缩）
- 部署到 Vercel 等无状态 Serverless 平台（不支持持久 WebSocket）
- 超大规模系统（需要微服务拆分）

---

## 1. 项目结构

```
nextjs-im/
├── server.ts                      # Custom Server 入口（HTTP + Socket.IO + Next.js）
├── next.config.ts                 # Next.js 配置
├── tsconfig.json
├── tsconfig.server.json           # Server 端独立 tsconfig
├── package.json
├── .env                           # 环境变量
├── prisma/
│   ├── schema.prisma              # 数据模型定义
│   └── migrations/                # 数据库迁移文件
├── src/
│   ├── types/                     # 共享类型定义（前后端共用）
│   │   ├── message.ts
│   │   ├── conversation.ts
│   │   ├── socket-events.ts
│   │   └── api.ts
│   ├── lib/                       # 共享工具函数
│   │   ├── prisma.ts              # Prisma Client 单例
│   │   ├── auth.ts                # JWT 签发与验证
│   │   ├── redis.ts               # Redis 客户端
│   │   └── constants.ts           # 共享常量
│   ├── server/                    # 服务端逻辑（仅 server.ts 引用）
│   │   ├── socket/
│   │   │   ├── index.ts           # Socket.IO 初始化 & 中间件
│   │   │   ├── handlers/
│   │   │   │   ├── message.ts     # message:send, message:read 处理器
│   │   │   │   ├── typing.ts      # typing:start, typing:stop 处理器
│   │   │   │   ├── conversation.ts # conversation:join, conversation:leave
│   │   │   │   └── presence.ts    # 在线状态管理
│   │   │   └── middleware.ts      # Socket 认证中间件
│   │   └── services/              # 业务逻辑层
│   │       ├── message-service.ts
│   │       ├── conversation-service.ts
│   │       └── user-service.ts
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # 根 Layout
│   │   ├── page.tsx               # 首页（重定向到 /chat）
│   │   ├── middleware.ts          # -> 实际放在 src/middleware.ts
│   │   ├── (auth)/                # 认证页面组
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (chat)/                # 聊天页面组
│   │   │   ├── layout.tsx         # 聊天布局（侧边栏 + Socket Provider）
│   │   │   ├── page.tsx           # 会话列表 / 空状态
│   │   │   └── [conversationId]/
│   │   │       └── page.tsx       # 聊天详情页
│   │   └── api/                   # Route Handlers
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── refresh/route.ts
│   │       │   └── logout/route.ts
│   │       ├── conversations/
│   │       │   ├── route.ts                    # GET 列表, POST 创建
│   │       │   └── [id]/
│   │       │       ├── route.ts                # GET 详情, PATCH 更新
│   │       │       ├── messages/route.ts       # GET 历史消息
│   │       │       └── members/route.ts        # POST 添加成员
│   │       ├── messages/
│   │       │   ├── [id]/route.ts               # DELETE 撤回
│   │       │   └── sync/route.ts               # GET 重连同步
│   │       ├── upload/route.ts                 # POST 文件上传
│   │       └── users/
│   │           ├── route.ts                    # GET 搜索
│   │           ├── me/route.ts                 # GET 当前用户
│   │           └── [id]/route.ts               # GET 用户详情
│   ├── components/                # React 组件
│   │   ├── providers/
│   │   │   └── socket-provider.tsx
│   │   ├── chat/
│   │   │   ├── conversation-list.tsx
│   │   │   ├── conversation-item.tsx
│   │   │   ├── message-list.tsx
│   │   │   ├── message-item.tsx
│   │   │   ├── message-input.tsx
│   │   │   └── typing-indicator.tsx
│   │   └── ui/                    # 基础 UI 组件
│   ├── stores/                    # Zustand 状态管理
│   │   ├── conversation-store.ts
│   │   ├── message-store.ts
│   │   └── auth-store.ts
│   └── hooks/                     # 自定义 Hooks
│       ├── use-socket.ts
│       ├── use-messages.ts
│       └── use-conversations.ts
├── middleware.ts                   # Next.js Middleware（路由保护）
└── public/
```

**关键设计决策**：

- `src/types/` 和 `src/lib/` 是前后端共享层，Custom Server 和 Next.js 页面/Route Handler 均可导入
- `src/server/` 目录仅被 `server.ts` 引用，不会被 Next.js 打包进客户端 bundle
- Socket.IO 逻辑与 Next.js Route Handlers 分离，各自职责清晰

---

## 2. Custom Server

Next.js 不原生支持 WebSocket。App Router 的 Route Handlers 是请求-响应模式，无法维持持久连接。需要 Custom Server 将 HTTP 服务器暴露给 Socket.IO。

### 2.1 server.ts

```typescript
// server.ts
import { createServer } from 'node:http';
import next from 'next';
import { initSocketServer } from '@/server/socket';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME ?? 'localhost';
const port = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
  const app = next({ dev, hostname, port });
  const nextHandler = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    nextHandler(req, res);
  });

  // 挂载 Socket.IO 到同一个 HTTP server
  initSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO server attached`);
  });
}

main().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
```

### 2.2 Server 端 tsconfig

```jsonc
// tsconfig.server.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "./dist",
    "noEmit": false,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["server.ts", "src/server/**/*", "src/lib/**/*", "src/types/**/*"]
}
```

### 2.3 package.json scripts

```jsonc
{
  "scripts": {
    // 开发模式：tsx 直接运行 TypeScript
    "dev": "tsx watch server.ts",

    // 生产构建：先构建 Next.js，再编译 server
    "build": "next build && tsc --project tsconfig.server.json",

    // 生产启动：运行编译后的 server
    "start": "NODE_ENV=production node dist/server.js",

    // Prisma 相关
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  }
}
```

### 2.4 next.config.ts

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Custom Server 模式下不使用 standalone output
  // standalone 会内置自己的 server，与 custom server 冲突
  // output: 'standalone',  // 不要启用

  experimental: {
    // 如果需要 Server Actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Socket.IO 的 polling 请求需要较长超时
  async headers() {
    return [
      {
        source: '/socket.io/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**注意事项**：

- `tsx watch` 在开发模式下提供热重载，但仅针对 server 端代码；Next.js 自身的 HMR 仍然工作
- 生产环境中 `tsc` 编译 server.ts，`next build` 编译 Next.js 应用，两者独立
- 不要启用 `output: 'standalone'`，它会生成内置 HTTP server 的产物，与 custom server 冲突

---

## 3. Prisma 数据模型

### 3.1 schema.prisma

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid()) @db.Uuid
  username  String   @unique @db.VarChar(50)
  nickname  String   @db.VarChar(100)
  avatarUrl String?  @map("avatar_url")
  password  String   // bcrypt hash，不传给客户端
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  // 关系
  memberships        ConversationMember[]
  sentMessages       Message[]            @relation("MessageSender")

  @@map("users")
}

model Conversation {
  id        String           @id @default(uuid()) @db.Uuid
  type      ConversationType
  name      String?          @db.VarChar(200)
  avatarUrl String?          @map("avatar_url")
  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  // 关系
  members  ConversationMember[]
  messages Message[]

  @@map("conversations")
}

enum ConversationType {
  direct
  group

  @@map("conversation_type")
}

model ConversationMember {
  conversationId String       @map("conversation_id") @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  joinedAt       DateTime     @default(now()) @map("joined_at") @db.Timestamptz
  pinnedAt       DateTime?    @map("pinned_at") @db.Timestamptz
  mutedUntil     DateTime?    @map("muted_until") @db.Timestamptz
  lastReadAt     DateTime     @default(now()) @map("last_read_at") @db.Timestamptz

  // 关系
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([conversationId, userId])
  @@index([userId], map: "idx_conv_members_user")
  @@map("conversation_members")
}

model Message {
  id             String    @id @default(uuid()) @db.Uuid
  clientId       String    @unique @map("client_id") @db.VarChar(36)
  conversationId String    @map("conversation_id") @db.Uuid
  senderId       String    @map("sender_id") @db.Uuid
  type           String    @db.VarChar(20)
  content        Json      // JSONB: TextContent | MediaContent | SystemContent
  replyTo        String?   @map("reply_to") @db.Uuid
  mentions       String[]  @default([]) @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime? @map("updated_at") @db.Timestamptz
  recalledAt     DateTime? @map("recalled_at") @db.Timestamptz

  // 关系
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation("MessageSender", fields: [senderId], references: [id])
  replyMessage Message?     @relation("MessageReplies", fields: [replyTo], references: [id])
  replies      Message[]    @relation("MessageReplies")

  @@index([conversationId, createdAt(sort: Desc)], map: "idx_messages_conv_time")
  @@map("messages")
}
```

### 3.2 Prisma Client 单例

Next.js 在开发模式下会频繁热重载模块，如果每次都创建新的 PrismaClient 会导致连接泄漏。使用全局变量缓存实例：

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

**要点**：

- `globalThis` 在 Node.js 热重载时不会被清理，确保 PrismaClient 只创建一次
- 开发环境打开 `query` 日志便于调试 SQL
- Route Handlers 和 Custom Server 中的 Socket 处理器都通过这个单例访问数据库

---

## 4. 类型共享

全栈项目的核心优势是 TypeScript 类型在前后端之间天然共享。类型定义放在 `src/types/` 目录中，前端组件、Route Handlers、Socket 处理器均可直接导入。

### 4.1 消息类型

```typescript
// src/types/message.ts
import type { Message as PrismaMessage } from '@prisma/client';

// ---- 枚举（与 im-protocol-core 对齐）----

export enum MessageType {
  TEXT   = 'text',
  IMAGE  = 'image',
  FILE   = 'file',
  AUDIO  = 'audio',
  VIDEO  = 'video',
  SYSTEM = 'system',
  RECALL = 'recall',
}

export enum MessageStatus {
  SENDING   = 'sending',
  SENT      = 'sent',
  DELIVERED = 'delivered',
  READ      = 'read',
  FAILED    = 'failed',
}

// ---- 内容体 ----

export interface TextContent {
  text: string;
}

export interface MediaContent {
  url: string;
  thumbnail?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface SystemContent {
  action: 'join' | 'leave' | 'rename' | 'pin' | 'recall';
  operatorId: string;
  targetId?: string;
  extra?: string;
}

// ---- 客户端使用的消息类型（从 Prisma 类型派生并增强）----

export interface ClientMessage {
  id: string;
  clientId: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: TextContent | MediaContent | SystemContent;
  status: MessageStatus;
  createdAt: number;        // 毫秒时间戳（前端统一用 number）
  updatedAt?: number;
  replyTo?: string;
  mentions: string[];
  recalledAt?: number;
}

// ---- Prisma 记录 → 客户端消息的转换函数 ----

export function toClientMessage(record: PrismaMessage): ClientMessage {
  return {
    id: record.id,
    clientId: record.clientId,
    conversationId: record.conversationId,
    senderId: record.senderId,
    type: record.type as MessageType,
    content: record.content as TextContent | MediaContent | SystemContent,
    status: MessageStatus.SENT,  // 数据库中的消息已持久化，状态为 SENT
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt?.getTime(),
    replyTo: record.replyTo ?? undefined,
    mentions: record.mentions,
    recalledAt: record.recalledAt?.getTime(),
  };
}
```

### 4.2 会话类型

```typescript
// src/types/conversation.ts
import type { Conversation as PrismaConversation, ConversationMember } from '@prisma/client';
import type { ClientMessage } from './message';

export enum ConversationType {
  DIRECT = 'direct',
  GROUP  = 'group',
}

export interface ClientConversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatar?: string;
  members: string[];
  lastMessage?: ClientMessage;
  unreadCount: number;
  pinnedAt?: number;
  mutedUntil?: number;
  updatedAt: number;
}

// Prisma 查询结果（包含关联）→ 客户端会话
type ConversationWithRelations = PrismaConversation & {
  members: (ConversationMember & { user: { id: string; nickname: string; avatarUrl: string | null } })[];
  messages: Array<{
    id: string;
    clientId: string;
    conversationId: string;
    senderId: string;
    type: string;
    content: unknown;
    replyTo: string | null;
    mentions: string[];
    createdAt: Date;
    updatedAt: Date | null;
    recalledAt: Date | null;
  }>;
  _count?: { messages: number };
};

export function toClientConversation(
  record: ConversationWithRelations,
  currentUserId: string,
  unreadCount: number,
): ClientConversation {
  const membership = record.members.find(m => m.userId === currentUserId);
  const lastMsg = record.messages[0]; // 查询时按 createdAt DESC 取 1 条

  return {
    id: record.id,
    type: record.type as ConversationType,
    name: record.name ?? undefined,
    avatar: record.avatarUrl ?? undefined,
    members: record.members.map(m => m.userId),
    lastMessage: lastMsg
      ? {
          id: lastMsg.id,
          clientId: lastMsg.clientId,
          conversationId: lastMsg.conversationId,
          senderId: lastMsg.senderId,
          type: lastMsg.type as any,
          content: lastMsg.content as any,
          status: 'sent' as any,
          createdAt: lastMsg.createdAt.getTime(),
          updatedAt: lastMsg.updatedAt?.getTime(),
          replyTo: lastMsg.replyTo ?? undefined,
          mentions: lastMsg.mentions,
          recalledAt: lastMsg.recalledAt?.getTime(),
        }
      : undefined,
    unreadCount,
    pinnedAt: membership?.pinnedAt?.getTime(),
    mutedUntil: membership?.mutedUntil?.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };
}
```

### 4.3 Socket 事件类型

```typescript
// src/types/socket-events.ts
import type { MessageType, ClientMessage } from './message';
import type { ClientConversation } from './conversation';

// ---- 客户端 → 服务端（C2S）----

export interface ClientToServerEvents {
  'message:send': (
    payload: {
      conversationId: string;
      clientId: string;
      type: MessageType;
      content: unknown;
      replyTo?: string;
      mentions?: string[];
    },
    ack: (res: { success: boolean; messageId?: string; createdAt?: number; error?: string }) => void,
  ) => void;

  'message:read': (payload: { conversationId: string; messageId: string }) => void;

  'typing:start': (payload: { conversationId: string }) => void;
  'typing:stop': (payload: { conversationId: string }) => void;

  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
}

// ---- 服务端 → 客户端（S2C）----

export interface ServerToClientEvents {
  'message:new': (message: ClientMessage) => void;
  'message:status': (payload: { messageId: string; status: string }) => void;
  'message:recalled': (payload: { messageId: string; conversationId: string }) => void;

  'typing:update': (payload: { conversationId: string; userId: string; isTyping: boolean }) => void;

  'presence:update': (payload: { userId: string; online: boolean; lastSeen?: number }) => void;

  'conversation:update': (conversation: Partial<ClientConversation> & { id: string }) => void;

  'sync:messages': (messages: ClientMessage[]) => void;
}

// ---- 服务端内部事件 ----

export interface InterServerEvents {
  ping: () => void;
}

// ---- Socket data（附加到 socket 实例上的用户信息）----

export interface SocketData {
  userId: string;
  username: string;
}
```

### 4.4 API 响应类型

```typescript
// src/types/api.ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;       // items.length === limit 时为 true
  nextCursor?: number;    // 下一页的 before 参数（最后一条的 createdAt）
}

export interface UploadResponse {
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  fileSize: number;
  mimeType: string;
}
```

**类型共享的关键**：

- `src/types/` 既不是纯前端也不是纯后端代码，属于共享层
- Prisma 生成的类型用于服务端内部，通过 `toClientMessage`/`toClientConversation` 转换为客户端类型
- Socket 事件的泛型类型确保前后端事件名和 payload 类型在编译期对齐
- 客户端使用 `number` 类型的毫秒时间戳，避免 `Date` 对象的序列化问题

---

## 5. REST API（Route Handlers）

### 5.1 认证工具函数

```typescript
// src/lib/auth.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  username: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * 从 NextRequest 中提取并验证 JWT。
 * Route Handlers 中使用此函数获取当前用户。
 * 如果验证失败，返回 null。
 */
export function getAuthFromRequest(request: NextRequest): TokenPayload | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * Route Handler 认证守卫。
 * 验证失败时返回 401 Response，成功时返回 TokenPayload。
 */
export function requireAuth(request: NextRequest): TokenPayload | Response {
  const auth = getAuthFromRequest(request);
  if (!auth) {
    return Response.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }
  return auth;
}
```

### 5.2 认证 API

```typescript
// src/app/api/auth/login/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, signAccessToken, signRefreshToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return Response.json(
      { success: false, error: 'Username and password are required' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await comparePassword(password, user.password))) {
    return Response.json(
      { success: false, error: 'Invalid credentials' },
      { status: 401 },
    );
  }

  const payload = { userId: user.id, username: user.username };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return Response.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      },
    },
  });
}
```

```typescript
// src/app/api/auth/refresh/route.ts
import { NextRequest } from 'next/server';
import { verifyRefreshToken, signAccessToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { refreshToken } = await request.json();

  if (!refreshToken) {
    return Response.json(
      { success: false, error: 'Refresh token is required' },
      { status: 400 },
    );
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const newAccessToken = signAccessToken({
      userId: payload.userId,
      username: payload.username,
    });

    return Response.json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch {
    return Response.json(
      { success: false, error: 'Invalid refresh token' },
      { status: 401 },
    );
  }
}
```

### 5.3 会话 API

```typescript
// src/app/api/conversations/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { toClientConversation } from '@/types/conversation';

// GET /api/conversations — 获取当前用户的会话列表
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  const conversations = await prisma.conversation.findMany({
    where: {
      members: {
        some: { userId: auth.userId },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, nickname: true, avatarUrl: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1, // 只取最新一条消息用于列表预览
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 批量计算未读数
  const results = await Promise.all(
    conversations.map(async (conv) => {
      const membership = conv.members.find(m => m.userId === auth.userId);
      const unreadCount = membership
        ? await prisma.message.count({
            where: {
              conversationId: conv.id,
              createdAt: { gt: membership.lastReadAt },
              senderId: { not: auth.userId },
            },
          })
        : 0;

      return toClientConversation(conv, auth.userId, unreadCount);
    }),
  );

  return Response.json({ success: true, data: results });
}

// POST /api/conversations — 创建会话
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  const { type, memberIds, name } = await request.json() as {
    type: 'direct' | 'group';
    memberIds: string[];
    name?: string;
  };

  // 单聊：确保 memberIds 包含且仅包含 1 个对方用户
  if (type === 'direct') {
    if (memberIds.length !== 1) {
      return Response.json(
        { success: false, error: 'Direct conversation requires exactly 1 other member' },
        { status: 400 },
      );
    }

    // 检查是否已存在单聊
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { members: { some: { userId: auth.userId } } },
          { members: { some: { userId: memberIds[0] } } },
        ],
      },
    });

    if (existing) {
      return Response.json({ success: true, data: { id: existing.id } });
    }
  }

  // 创建会话并添加成员（包含当前用户）
  const allMemberIds = [auth.userId, ...memberIds.filter(id => id !== auth.userId)];

  const conversation = await prisma.conversation.create({
    data: {
      type,
      name: type === 'group' ? name : null,
      members: {
        createMany: {
          data: allMemberIds.map(userId => ({ userId })),
        },
      },
    },
  });

  return Response.json(
    { success: true, data: { id: conversation.id } },
    { status: 201 },
  );
}
```

### 5.4 历史消息 API（游标分页）

```typescript
// src/app/api/conversations/[id]/messages/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { toClientMessage } from '@/types/message';
import type { PaginatedResponse } from '@/types/api';
import type { ClientMessage } from '@/types/message';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  const { id: conversationId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const before = searchParams.get('before');  // 毫秒时间戳
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 50);

  // 验证当前用户是会话成员
  const membership = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: auth.userId,
      },
    },
  });

  if (!membership) {
    return Response.json(
      { success: false, error: 'Not a member of this conversation' },
      { status: 403 },
    );
  }

  // 游标分页查询
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(before && { createdAt: { lt: new Date(parseInt(before, 10)) } }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // 反转为正序（前端按时间正序渲染）
  const items = messages.reverse().map(toClientMessage);
  const hasMore = messages.length === limit;
  const nextCursor = hasMore ? items[0]?.createdAt : undefined;

  const response: PaginatedResponse<ClientMessage> = {
    items,
    hasMore,
    nextCursor,
  };

  return Response.json({ success: true, data: response });
}
```

### 5.5 重连同步 API

```typescript
// src/app/api/messages/sync/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { toClientMessage } from '@/types/message';

// GET /api/messages/sync?since=<timestamp>
// 获取指定时间戳之后的所有消息（用于断线重连后补齐）
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  const since = request.nextUrl.searchParams.get('since');
  if (!since) {
    return Response.json(
      { success: false, error: 'since parameter is required' },
      { status: 400 },
    );
  }

  const sinceDate = new Date(parseInt(since, 10));

  // 获取用户所有会话 ID
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: auth.userId },
    select: { conversationId: true },
  });

  const conversationIds = memberships.map(m => m.conversationId);

  // 查询所有这些会话中 since 之后的消息
  // 限制最多返回 500 条，避免过多数据
  const messages = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      createdAt: { gt: sinceDate },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  return Response.json({
    success: true,
    data: messages.map(toClientMessage),
  });
}
```

### 5.6 文件上传 API

```typescript
// src/app/api/upload/route.ts
import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '@/lib/auth';
import type { UploadResponse } from '@/types/api';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return Response.json(
      { success: false, error: 'No file provided' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { success: false, error: 'File too large (max 50MB)' },
      { status: 413 },
    );
  }

  // 生成安全文件名
  const ext = file.name.split('.').pop() ?? 'bin';
  const safeName = `${randomUUID()}.${ext}`;
  const dateDir = new Date().toISOString().slice(0, 10); // 2026-04-16
  const targetDir = join(UPLOAD_DIR, dateDir);

  await mkdir(targetDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(targetDir, safeName);
  await writeFile(filePath, buffer);

  const url = `/uploads/${dateDir}/${safeName}`;

  const response: UploadResponse = {
    url,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  };

  // 生产环境应上传到 S3/R2 等对象存储，返回 CDN URL
  // 此处仅为开发演示使用本地文件系统

  return Response.json({ success: true, data: response }, { status: 201 });
}
```

---

## 6. Socket.IO 服务端逻辑

### 6.1 初始化与中间件

```typescript
// src/server/socket/index.ts
import { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@/types/socket-events';
import { authMiddleware } from './middleware';
import { registerMessageHandlers } from './handlers/message';
import { registerTypingHandlers } from './handlers/typing';
import { registerConversationHandlers } from './handlers/conversation';
import { registerPresenceHandlers } from './handlers/presence';

export type AppSocket = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: AppSocket;

export function getIO(): AppSocket {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function initSocketServer(httpServer: HTTPServer): AppSocket {
  io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    path: '/socket.io',
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    },
    // 连接状态恢复：2 分钟内重连可自动恢复未接收事件
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
    // 传输配置：先 polling 再升级到 websocket
    transports: ['polling', 'websocket'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // 认证中间件
  io.use(authMiddleware);

  // 连接事件
  io.on('connection', (socket) => {
    const { userId, username } = socket.data;
    console.log(`User connected: ${username} (${userId}), socket: ${socket.id}`);

    // 将用户加入个人房间（用于定向推送）
    socket.join(`user:${userId}`);

    // 注册各事件处理器
    registerMessageHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerConversationHandlers(io, socket);
    registerPresenceHandlers(io, socket);

    // 断开连接
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${username} (${userId}), reason: ${reason}`);
    });
  });

  return io;
}
```

### 6.2 认证中间件

```typescript
// src/server/socket/middleware.ts
import type { Socket } from 'socket.io';
import { verifyAccessToken } from '@/lib/auth';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@/types/socket-events';

type AppSocketInstance = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Socket.IO 认证中间件。
 * 客户端通过 auth 选项传递 JWT token。
 *
 * 客户端连接示例：
 * io('http://localhost:3000', { auth: { token: 'Bearer xxx' } })
 */
export function authMiddleware(
  socket: AppSocketInstance,
  next: (err?: Error) => void,
) {
  const token = socket.handshake.auth.token as string | undefined;

  if (!token) {
    return next(new Error('AUTH_REQUIRED'));
  }

  // 去掉 Bearer 前缀
  const jwt = token.startsWith('Bearer ') ? token.slice(7) : token;

  try {
    const payload = verifyAccessToken(jwt);
    // 将用户信息附加到 socket.data 上，后续处理器直接使用
    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    next();
  } catch {
    next(new Error('AUTH_FAILED'));
  }
}
```

### 6.3 消息处理器

```typescript
// src/server/socket/handlers/message.ts
import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/prisma';
import { toClientMessage, MessageType } from '@/types/message';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@/types/socket-events';

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const MAX_TEXT_LENGTH = 5000;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 分钟
const RATE_LIMIT_MAX = 30;           // 30 条/分钟

// 简易内存速率限制（生产环境用 Redis）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

export function registerMessageHandlers(io: IO, socket: AppSocket) {
  const { userId } = socket.data;

  // ---- message:send ----
  socket.on('message:send', async (payload, ack) => {
    try {
      // 速率限制
      if (!checkRateLimit(userId)) {
        return ack({ success: false, error: 'Rate limit exceeded' });
      }

      // 输入校验
      const { conversationId, clientId, type, content, replyTo, mentions } = payload;

      if (!conversationId || !clientId || !type || !content) {
        return ack({ success: false, error: 'Missing required fields' });
      }

      if (type === MessageType.TEXT) {
        const text = (content as { text?: string }).text;
        if (!text || text.length > MAX_TEXT_LENGTH) {
          return ack({ success: false, error: `Text must be 1-${MAX_TEXT_LENGTH} characters` });
        }
      }

      // 验证用户是会话成员
      const membership = await prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId, userId },
        },
      });

      if (!membership) {
        return ack({ success: false, error: 'Not a member of this conversation' });
      }

      // clientId 去重：如果已存在相同 clientId 的消息，直接返回
      const existing = await prisma.message.findUnique({
        where: { clientId },
      });

      if (existing) {
        return ack({
          success: true,
          messageId: existing.id,
          createdAt: existing.createdAt.getTime(),
        });
      }

      // 创建消息并更新会话时间
      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: {
            clientId,
            conversationId,
            senderId: userId, // 使用认证的 userId，不信任客户端传的
            type,
            content: content as any,
            replyTo: replyTo ?? null,
            mentions: mentions ?? [],
          },
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
      ]);

      // ACK 给发送者
      ack({
        success: true,
        messageId: message.id,
        createdAt: message.createdAt.getTime(),
      });

      // 广播给会话内所有其他成员
      const clientMessage = toClientMessage(message);
      socket.to(`conv:${conversationId}`).emit('message:new', clientMessage);

      // 也推送给发送者的其他设备（如果有多设备登录）
      socket.to(`user:${userId}`).emit('message:new', clientMessage);

    } catch (error) {
      console.error('message:send error:', error);
      ack({ success: false, error: 'Internal server error' });
    }
  });

  // ---- message:read ----
  socket.on('message:read', async (payload) => {
    try {
      const { conversationId, messageId } = payload;

      // 查找消息获取时间戳
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true },
      });

      if (!message) return;

      // 更新 lastReadAt
      await prisma.conversationMember.update({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        data: { lastReadAt: message.createdAt },
      });

      // 通知消息发送者（已读回执）
      // 找到该会话中在 lastReadAt 之前未标记已读的消息发送者
      socket.to(`conv:${conversationId}`).emit('message:status', {
        messageId,
        status: 'read',
      });

    } catch (error) {
      console.error('message:read error:', error);
    }
  });
}
```

### 6.4 Typing 处理器

```typescript
// src/server/socket/handlers/typing.ts
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@/types/socket-events';

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Typing 状态自动超时（3 秒无 stop 事件则自动取消）
const typingTimers = new Map<string, NodeJS.Timeout>();

function makeTypingKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

export function registerTypingHandlers(io: IO, socket: AppSocket) {
  const { userId } = socket.data;

  socket.on('typing:start', ({ conversationId }) => {
    const key = makeTypingKey(userId, conversationId);

    // 清除之前的超时
    const existing = typingTimers.get(key);
    if (existing) clearTimeout(existing);

    // 广播 typing 状态
    socket.to(`conv:${conversationId}`).emit('typing:update', {
      conversationId,
      userId,
      isTyping: true,
    });

    // 3 秒后自动取消
    typingTimers.set(key, setTimeout(() => {
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        isTyping: false,
      });
      typingTimers.delete(key);
    }, 3000));
  });

  socket.on('typing:stop', ({ conversationId }) => {
    const key = makeTypingKey(userId, conversationId);

    const existing = typingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      typingTimers.delete(key);
    }

    socket.to(`conv:${conversationId}`).emit('typing:update', {
      conversationId,
      userId,
      isTyping: false,
    });
  });

  // 断开连接时清理所有 typing 状态
  socket.on('disconnect', () => {
    for (const [key, timer] of typingTimers.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
  });
}
```

### 6.5 会话房间处理器

```typescript
// src/server/socket/handlers/conversation.ts
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@/types/socket-events';

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerConversationHandlers(io: IO, socket: AppSocket) {
  // 用户进入聊天页面时加入 Socket.IO 房间
  socket.on('conversation:join', (conversationId) => {
    socket.join(`conv:${conversationId}`);
    console.log(`${socket.data.username} joined room conv:${conversationId}`);
  });

  // 用户离开聊天页面时退出房间
  socket.on('conversation:leave', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
    console.log(`${socket.data.username} left room conv:${conversationId}`);
  });
}
```

### 6.6 在线状态处理器

```typescript
// src/server/socket/handlers/presence.ts
import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/prisma';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@/types/socket-events';

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// 在线用户集合（生产环境用 Redis Set）
const onlineUsers = new Set<string>();

export function registerPresenceHandlers(io: IO, socket: AppSocket) {
  const { userId } = socket.data;

  // 连接时标记在线
  onlineUsers.add(userId);

  // 获取该用户的所有会话成员，向他们广播上线状态
  broadcastPresence(io, userId, true);

  socket.on('disconnect', async () => {
    // 检查该用户是否还有其他活跃连接（多设备场景）
    const sockets = await io.in(`user:${userId}`).fetchSockets();

    if (sockets.length === 0) {
      onlineUsers.delete(userId);
      broadcastPresence(io, userId, false);
    }
  });
}

async function broadcastPresence(io: IO, userId: string, online: boolean) {
  try {
    // 查找该用户的所有会话
    const memberships = await prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    const payload = {
      userId,
      online,
      lastSeen: online ? undefined : Date.now(),
    };

    // 向所有相关会话房间广播
    for (const m of memberships) {
      io.to(`conv:${m.conversationId}`).emit('presence:update', payload);
    }
  } catch (error) {
    console.error('broadcastPresence error:', error);
  }
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}
```

### 6.7 Redis Adapter（多实例部署）

```typescript
// src/server/socket/redis-adapter.ts
// 当需要部署多个 server 实例时启用
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { AppSocket } from './index';

export async function attachRedisAdapter(io: AppSocket) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(createAdapter(pubClient, subClient));

  console.log('Socket.IO Redis adapter attached');

  // 优雅关闭
  process.on('SIGTERM', async () => {
    await pubClient.quit();
    await subClient.quit();
  });
}
```

在 `initSocketServer` 中可选启用：

```typescript
// server.ts 中或 src/server/socket/index.ts 中
if (process.env.REDIS_URL) {
  const { attachRedisAdapter } = await import('./redis-adapter');
  await attachRedisAdapter(io);
}
```

---

## 7. 前端页面与组件

### 7.1 聊天布局（Server Component + Client Component 分层）

```typescript
// src/app/(chat)/layout.tsx
// Server Component：负责初始数据加载
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toClientConversation } from '@/types/conversation';
import { ChatLayoutClient } from '@/components/chat/chat-layout-client';

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 在 Server Component 中验证身份
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    redirect('/login');
  }

  let auth;
  try {
    auth = verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  // 服务端预加载会话列表（首屏数据）
  const conversations = await prisma.conversation.findMany({
    where: {
      members: { some: { userId: auth.userId } },
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const initialConversations = await Promise.all(
    conversations.map(async (conv) => {
      const membership = conv.members.find(m => m.userId === auth.userId);
      const unreadCount = membership
        ? await prisma.message.count({
            where: {
              conversationId: conv.id,
              createdAt: { gt: membership.lastReadAt },
              senderId: { not: auth.userId },
            },
          })
        : 0;
      return toClientConversation(conv, auth.userId, unreadCount);
    }),
  );

  return (
    <ChatLayoutClient
      currentUserId={auth.userId}
      initialConversations={initialConversations}
    >
      {children}
    </ChatLayoutClient>
  );
}
```

```typescript
// src/components/chat/chat-layout-client.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { SocketProvider } from '@/components/providers/socket-provider';
import { ConversationList } from '@/components/chat/conversation-list';
import { useConversationStore } from '@/stores/conversation-store';
import type { ClientConversation } from '@/types/conversation';

interface ChatLayoutClientProps {
  currentUserId: string;
  initialConversations: ClientConversation[];
  children: ReactNode;
}

export function ChatLayoutClient({
  currentUserId,
  initialConversations,
  children,
}: ChatLayoutClientProps) {
  const setConversations = useConversationStore(s => s.setConversations);

  // 将 Server Component 预加载的数据注入到客户端 store
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations, setConversations]);

  return (
    <SocketProvider currentUserId={currentUserId}>
      <div className="flex h-screen">
        {/* 左侧：会话列表 */}
        <aside className="w-80 border-r flex flex-col">
          <ConversationList currentUserId={currentUserId} />
        </aside>

        {/* 右侧：聊天详情 */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </div>
    </SocketProvider>
  );
}
```

### 7.2 SocketProvider

```typescript
// src/components/providers/socket-provider.tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';
import { useConversationStore } from '@/stores/conversation-store';
import { useMessageStore } from '@/stores/message-store';
import { useAuthStore } from '@/stores/auth-store';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  socket: AppSocket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
});

export function useSocket() {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  currentUserId: string;
  children: ReactNode;
}

export function SocketProvider({ currentUserId, children }: SocketProviderProps) {
  const socketRef = useRef<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const addMessage = useMessageStore(s => s.addMessage);
  const updateMessageStatus = useMessageStore(s => s.updateMessageStatus);
  const updateConversation = useConversationStore(s => s.updateConversation);
  const getAccessToken = useAuthStore(s => s.accessToken);

  useEffect(() => {
    const socket: AppSocket = io({
      path: '/socket.io',
      auth: { token: `Bearer ${getAccessToken}` },
      // 不要将 token 放在 query string 中
      transports: ['polling', 'websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('Socket connected:', socket.id);

      // 如果不是自动恢复的连接，需要 REST 同步
      if (!socket.recovered) {
        syncMissedMessages();
      }
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      if (err.message === 'AUTH_FAILED') {
        // Token 过期，尝试刷新
        refreshAndReconnect(socket);
      }
    });

    // ---- 注册 S2C 事件 ----

    socket.on('message:new', (message) => {
      addMessage(message);
      // 更新会话列表的最后消息和未读数
      updateConversation({
        id: message.conversationId,
        lastMessage: message,
        updatedAt: message.createdAt,
      });
    });

    socket.on('message:status', ({ messageId, status }) => {
      updateMessageStatus(messageId, status);
    });

    socket.on('message:recalled', ({ messageId, conversationId }) => {
      updateMessageStatus(messageId, 'recalled');
    });

    socket.on('typing:update', ({ conversationId, userId, isTyping }) => {
      useConversationStore.getState().setTypingUser(conversationId, userId, isTyping);
    });

    socket.on('presence:update', ({ userId, online, lastSeen }) => {
      useConversationStore.getState().setUserPresence(userId, online, lastSeen);
    });

    socket.on('conversation:update', (partial) => {
      updateConversation(partial);
    });

    socket.on('sync:messages', (messages) => {
      for (const msg of messages) {
        addMessage(msg);
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUserId]); // currentUserId 变化时重建连接

  async function syncMissedMessages() {
    const lastSync = useMessageStore.getState().lastSyncTimestamp;
    if (!lastSync) return;

    try {
      const res = await fetch(`/api/messages/sync?since=${lastSync}`, {
        headers: { Authorization: `Bearer ${getAccessToken}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        for (const msg of data.data) {
          addMessage(msg);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  async function refreshAndReconnect(socket: AppSocket) {
    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json();

      if (data.success) {
        useAuthStore.getState().setAccessToken(data.data.accessToken);
        socket.auth = { token: `Bearer ${data.data.accessToken}` };
        socket.connect();
      } else {
        // 刷新失败，跳转登录页
        window.location.href = '/login';
      }
    } catch {
      window.location.href = '/login';
    }
  }

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}
```

### 7.3 聊天详情页

```typescript
// src/app/(chat)/[conversationId]/page.tsx
// Server Component：加载首屏消息数据
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toClientMessage } from '@/types/message';
import { ChatView } from '@/components/chat/chat-view';

interface ChatPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { conversationId } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  const auth = verifyAccessToken(token!);

  // 预加载最新 30 条消息
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const initialMessages = messages.reverse().map(toClientMessage);

  // 获取会话信息
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: {
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!conversation) {
    return <div>Conversation not found</div>;
  }

  return (
    <ChatView
      conversationId={conversationId}
      currentUserId={auth.userId}
      initialMessages={initialMessages}
      members={conversation.members.map(m => ({
        id: m.user.id,
        nickname: m.user.nickname,
        avatarUrl: m.user.avatarUrl,
      }))}
    />
  );
}
```

```typescript
// src/components/chat/chat-view.tsx
'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/components/providers/socket-provider';
import { useMessageStore } from '@/stores/message-store';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';
import { TypingIndicator } from './typing-indicator';
import type { ClientMessage } from '@/types/message';

interface ChatViewProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: ClientMessage[];
  members: Array<{ id: string; nickname: string; avatarUrl: string | null }>;
}

export function ChatView({
  conversationId,
  currentUserId,
  initialMessages,
  members,
}: ChatViewProps) {
  const { socket } = useSocket();
  const setMessages = useMessageStore(s => s.setMessages);
  const messages = useMessageStore(s => s.getMessages(conversationId));
  const initialized = useRef(false);

  // 注入 Server Component 预加载的消息
  useEffect(() => {
    if (!initialized.current) {
      setMessages(conversationId, initialMessages);
      initialized.current = true;
    }
  }, [conversationId, initialMessages, setMessages]);

  // 加入 / 离开 Socket.IO 房间
  useEffect(() => {
    if (!socket) return;

    socket.emit('conversation:join', conversationId);

    return () => {
      socket.emit('conversation:leave', conversationId);
    };
  }, [socket, conversationId]);

  // 标记已读
  useEffect(() => {
    if (!socket || messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.senderId !== currentUserId) {
      socket.emit('message:read', {
        conversationId,
        messageId: lastMessage.id,
      });
    }
  }, [socket, conversationId, messages, currentUserId]);

  // 发送消息
  const handleSend = useCallback(
    (type: string, content: unknown) => {
      if (!socket) return;

      const clientId = crypto.randomUUID();

      // 乐观更新：立即添加到本地状态
      const optimisticMessage: ClientMessage = {
        id: clientId,          // 临时 ID，ACK 后替换
        clientId,
        conversationId,
        senderId: currentUserId,
        type: type as any,
        content: content as any,
        status: 'sending' as any,
        createdAt: Date.now(),
        mentions: [],
      };

      useMessageStore.getState().addMessage(optimisticMessage);

      // 通过 Socket 发送
      socket.emit(
        'message:send',
        { conversationId, clientId, type: type as any, content },
        (res) => {
          if (res.success) {
            // 用服务端返回的真实 ID 和时间戳更新
            useMessageStore.getState().confirmMessage(clientId, res.messageId!, res.createdAt!);
          } else {
            // 标记为发送失败
            useMessageStore.getState().failMessage(clientId);
          }
        },
      );
    },
    [socket, conversationId, currentUserId],
  );

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表（虚拟滚动） */}
      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        members={members}
        conversationId={conversationId}
      />

      {/* 正在输入指示器 */}
      <TypingIndicator conversationId={conversationId} members={members} />

      {/* 消息输入框 */}
      <MessageInput
        conversationId={conversationId}
        onSend={handleSend}
      />
    </div>
  );
}
```

### 7.4 消息列表（虚拟滚动 + 向上加载更多）

```typescript
// src/components/chat/message-list.tsx
'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useMessageStore } from '@/stores/message-store';
import { useAuthStore } from '@/stores/auth-store';
import { MessageItem } from './message-item';
import type { ClientMessage } from '@/types/message';

interface MessageListProps {
  messages: ClientMessage[];
  currentUserId: string;
  members: Array<{ id: string; nickname: string; avatarUrl: string | null }>;
  conversationId: string;
}

export function MessageList({
  messages,
  currentUserId,
  members,
  conversationId,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const getAccessToken = useAuthStore(s => s.accessToken);

  // 新消息到达时自动滚动到底部
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 只在已经接近底部时自动滚动（避免正在翻看历史时跳转）
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  // 向上滚动加载更多历史消息
  const handleScroll = useCallback(async () => {
    const container = containerRef.current;
    if (!container || isLoadingMore || !hasMore) return;

    // 距离顶部 < 100px 时触发加载
    if (container.scrollTop > 100) return;

    setIsLoadingMore(true);
    const oldestMessage = messages[0];
    if (!oldestMessage) {
      setIsLoadingMore(false);
      return;
    }

    const prevScrollHeight = container.scrollHeight;

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?before=${oldestMessage.createdAt}&limit=30`,
        { headers: { Authorization: `Bearer ${getAccessToken}` } },
      );
      const data = await res.json();

      if (data.success) {
        const olderMessages: ClientMessage[] = data.data.items;
        if (olderMessages.length > 0) {
          useMessageStore.getState().prependMessages(conversationId, olderMessages);
        }
        setHasMore(data.data.hasMore);

        // 保持滚动位置（新消息插入到顶部后）
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [messages, conversationId, isLoadingMore, hasMore, getAccessToken]);

  const getMemberInfo = useCallback(
    (userId: string) => members.find(m => m.id === userId),
    [members],
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-2"
      onScroll={handleScroll}
    >
      {isLoadingMore && (
        <div className="text-center text-sm text-gray-400 py-2">Loading...</div>
      )}

      {!hasMore && (
        <div className="text-center text-sm text-gray-400 py-2">
          No more messages
        </div>
      )}

      {messages.map((message) => (
        <MessageItem
          key={message.clientId}
          message={message}
          isOwn={message.senderId === currentUserId}
          sender={getMemberInfo(message.senderId)}
        />
      ))}
    </div>
  );
}
```

### 7.5 消息输入框

```typescript
// src/components/chat/message-input.tsx
'use client';

import { useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { useSocket } from '@/components/providers/socket-provider';

interface MessageInputProps {
  conversationId: string;
  onSend: (type: string, content: unknown) => void;
}

export function MessageInput({ conversationId, onSend }: MessageInputProps) {
  const [text, setText] = useState('');
  const { socket } = useSocket();
  const typingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Typing 状态管理（防抖）
  const handleTyping = useCallback(() => {
    if (!socket) return;

    if (!typingRef.current) {
      typingRef.current = true;
      socket.emit('typing:start', { conversationId });
    }

    // 重置超时
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      typingRef.current = false;
      socket.emit('typing:stop', { conversationId });
    }, 2000);
  }, [socket, conversationId]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onSend('text', { text: trimmed });
    setText('');

    // 停止 typing 状态
    if (typingRef.current && socket) {
      typingRef.current = false;
      socket.emit('typing:stop', { conversationId });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  }, [text, onSend, socket, conversationId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // 文件上传
  const handleFileUpload = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (data.success) {
          const isImage = file.type.startsWith('image/');
          onSend(isImage ? 'image' : 'file', {
            url: data.data.url,
            fileName: file.name,
            fileSize: data.data.fileSize,
            mimeType: data.data.mimeType,
            width: data.data.width,
            height: data.data.height,
          });
        }
      } catch (error) {
        console.error('Upload failed:', error);
      }
    },
    [onSend],
  );

  return (
    <div className="border-t p-4">
      <div className="flex items-end gap-2">
        {/* 文件上传按钮 */}
        <label className="cursor-pointer p-2 hover:bg-gray-100 rounded">
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </label>

        {/* 文本输入 */}
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

### 7.6 RSC/Client Component 分层策略

| 层 | 组件类型 | 职责 | 示例 |
|------|---------|------|------|
| **数据预加载** | Server Component | 从数据库读取首屏数据，传给 Client Component | `(chat)/layout.tsx`, `[conversationId]/page.tsx` |
| **实时交互** | Client Component (`'use client'`) | Socket 监听、用户输入、状态更新、虚拟滚动 | `ChatView`, `MessageList`, `MessageInput` |
| **状态注入** | Client Component | 接收 Server Component 的 props，注入到 Zustand store | `ChatLayoutClient` 中的 `useEffect` |
| **纯展示** | Client Component | 渲染消息气泡、头像等（被 Client Component 引用的组件自动成为 Client Component） | `MessageItem`, `TypingIndicator` |

**设计原则**：

- Server Component 负责"首屏快"：SSR 阶段直接查数据库，HTML 中包含初始数据
- Client Component 负责"交互活"：Socket 连接、乐观更新、实时推送
- 数据流：Server Component Props -> `useEffect` -> Zustand Store -> UI
- 不要在 Server Component 中使用 `useEffect`、`useState` 或 Socket.IO

---

## 8. 状态管理

### 8.1 会话 Store

```typescript
// src/stores/conversation-store.ts
import { create } from 'zustand';
import type { ClientConversation } from '@/types/conversation';

interface TypingState {
  [conversationId: string]: Set<string>; // 正在输入的用户 ID 集合
}

interface PresenceState {
  [userId: string]: { online: boolean; lastSeen?: number };
}

interface ConversationStore {
  conversations: ClientConversation[];
  typingState: TypingState;
  presenceState: PresenceState;

  // 初始化（从 Server Component 注入）
  setConversations: (conversations: ClientConversation[]) => void;

  // 更新单个会话
  updateConversation: (partial: Partial<ClientConversation> & { id: string }) => void;

  // Typing 状态
  setTypingUser: (conversationId: string, userId: string, isTyping: boolean) => void;
  getTypingUsers: (conversationId: string) => string[];

  // 在线状态
  setUserPresence: (userId: string, online: boolean, lastSeen?: number) => void;
  isUserOnline: (userId: string) => boolean;

  // 未读数操作
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  typingState: {},
  presenceState: {},

  setConversations: (conversations) => set({ conversations }),

  updateConversation: (partial) =>
    set((state) => ({
      conversations: state.conversations
        .map((c) => (c.id === partial.id ? { ...c, ...partial } : c))
        // 按 updatedAt 重新排序
        .sort((a, b) => b.updatedAt - a.updatedAt),
    })),

  setTypingUser: (conversationId, userId, isTyping) =>
    set((state) => {
      const current = state.typingState[conversationId] ?? new Set();
      const next = new Set(current);
      if (isTyping) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      return {
        typingState: { ...state.typingState, [conversationId]: next },
      };
    }),

  getTypingUsers: (conversationId) => {
    const users = get().typingState[conversationId];
    return users ? Array.from(users) : [];
  },

  setUserPresence: (userId, online, lastSeen) =>
    set((state) => ({
      presenceState: {
        ...state.presenceState,
        [userId]: { online, lastSeen },
      },
    })),

  isUserOnline: (userId) => get().presenceState[userId]?.online ?? false,

  incrementUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c,
      ),
    })),

  clearUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    })),
}));
```

### 8.2 消息 Store

```typescript
// src/stores/message-store.ts
import { create } from 'zustand';
import type { ClientMessage } from '@/types/message';

interface MessageStore {
  // key: conversationId, value: 该会话的消息列表（按时间正序）
  messagesByConversation: Record<string, ClientMessage[]>;

  // 最后同步时间戳（用于断线重连）
  lastSyncTimestamp: number | null;

  // 获取某个会话的消息
  getMessages: (conversationId: string) => ClientMessage[];

  // Server Component 初始数据注入
  setMessages: (conversationId: string, messages: ClientMessage[]) => void;

  // 添加新消息（实时接收或乐观更新）
  addMessage: (message: ClientMessage) => void;

  // 向前追加历史消息（加载更多）
  prependMessages: (conversationId: string, messages: ClientMessage[]) => void;

  // 乐观更新 → 确认（替换临时 ID 和时间戳）
  confirmMessage: (clientId: string, serverId: string, serverCreatedAt: number) => void;

  // 标记消息发送失败
  failMessage: (clientId: string) => void;

  // 更新消息状态
  updateMessageStatus: (messageId: string, status: string) => void;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messagesByConversation: {},
  lastSyncTimestamp: null,

  getMessages: (conversationId) =>
    get().messagesByConversation[conversationId] ?? [],

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
      },
      lastSyncTimestamp: messages.length > 0
        ? Math.max(state.lastSyncTimestamp ?? 0, messages[messages.length - 1].createdAt)
        : state.lastSyncTimestamp,
    })),

  addMessage: (message) =>
    set((state) => {
      const convId = message.conversationId;
      const existing = state.messagesByConversation[convId] ?? [];

      // 去重：按 clientId 或 id 检查
      const isDuplicate = existing.some(
        (m) => m.clientId === message.clientId || m.id === message.id,
      );
      if (isDuplicate) return state;

      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [convId]: [...existing, message],
        },
        lastSyncTimestamp: Math.max(
          state.lastSyncTimestamp ?? 0,
          message.createdAt,
        ),
      };
    }),

  prependMessages: (conversationId, messages) =>
    set((state) => {
      const existing = state.messagesByConversation[conversationId] ?? [];
      const existingIds = new Set(existing.map((m) => m.id));

      // 过滤已存在的消息
      const newMessages = messages.filter((m) => !existingIds.has(m.id));

      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...newMessages, ...existing],
        },
      };
    }),

  confirmMessage: (clientId, serverId, serverCreatedAt) =>
    set((state) => {
      const updated: Record<string, ClientMessage[]> = {};

      for (const [convId, msgs] of Object.entries(state.messagesByConversation)) {
        updated[convId] = msgs.map((m) =>
          m.clientId === clientId
            ? { ...m, id: serverId, status: 'sent' as any, createdAt: serverCreatedAt }
            : m,
        );
      }

      return {
        messagesByConversation: updated,
        lastSyncTimestamp: Math.max(state.lastSyncTimestamp ?? 0, serverCreatedAt),
      };
    }),

  failMessage: (clientId) =>
    set((state) => {
      const updated: Record<string, ClientMessage[]> = {};

      for (const [convId, msgs] of Object.entries(state.messagesByConversation)) {
        updated[convId] = msgs.map((m) =>
          m.clientId === clientId ? { ...m, status: 'failed' as any } : m,
        );
      }

      return { messagesByConversation: updated };
    }),

  updateMessageStatus: (messageId, status) =>
    set((state) => {
      const updated: Record<string, ClientMessage[]> = {};

      for (const [convId, msgs] of Object.entries(state.messagesByConversation)) {
        updated[convId] = msgs.map((m) =>
          m.id === messageId ? { ...m, status: status as any } : m,
        );
      }

      return { messagesByConversation: updated };
    }),
}));
```

### 8.3 认证 Store

```typescript
// src/stores/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl: string | null;
  } | null;

  setTokens: (accessToken: string, refreshToken: string) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setAccessToken: (accessToken) => set({ accessToken }),

      setUser: (user) => set({ user }),

      logout: () =>
        set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'auth-storage',
      // 只持久化 refreshToken，accessToken 短期有效
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
```

### 8.4 数据流总结

```
Server Component (SSR)
  │
  │ props: initialConversations, initialMessages
  │
  ▼
ChatLayoutClient (Client Component)
  │
  │ useEffect → setConversations(initialConversations)
  │
  ▼
Zustand Store ◄──── Socket.IO Events (message:new, typing:update, ...)
  │                       ▲
  ▼                       │
React Components ────► socket.emit('message:send', ...)
                  ────► fetch('/api/conversations/...')
```

---

## 9. 中间件认证

```typescript
// middleware.ts（项目根目录或 src/ 目录下）
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路由：登录、注册、静态资源
  const publicPaths = ['/login', '/register', '/api/auth/login', '/api/auth/refresh'];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 静态资源和 Next.js 内部路由
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/uploads')
  ) {
    return NextResponse.next();
  }

  // API 路由：检查 Authorization header
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // 注意：middleware 中的 JWT 验证应使用轻量级方案
    // 因为 middleware 运行在 Edge Runtime，不支持所有 Node.js API
    // 可以只做 token 存在性检查，详细验证交给 Route Handler
    return NextResponse.next();
  }

  // 页面路由：检查 cookie 中的 token
  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 页面路由通过 cookie 携带 token，Server Component 可以直接读取
  return NextResponse.next();
}

export const config = {
  // 匹配所有路由，排除 _next 和静态文件
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Edge Runtime 限制**：

Next.js Middleware 运行在 Edge Runtime 中，不是完整的 Node.js 环境。`jsonwebtoken` 库依赖 Node.js 的 `crypto` 模块，无法在 Edge Runtime 中使用。

解决方案：
1. middleware 中只做 token 存在性检查，不做签名验证
2. 如果需要在 middleware 中验证 JWT，使用 `jose` 库（纯 JavaScript 实现，兼容 Edge Runtime）
3. 详细的 JWT 验证放在 Route Handler 中（运行在 Node.js Runtime）

```typescript
// 如果需要在 middleware 中验证 JWT，使用 jose：
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

async function verifyTokenEdge(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: string; username: string };
  } catch {
    return null;
  }
}
```

---

## 10. 关键依赖

```jsonc
// package.json
{
  "name": "nextjs-im",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "next build && tsc --project tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server.js",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    // ---- Next.js 核心 ----
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",

    // ---- Socket.IO ----
    "socket.io": "^4.8.0",          // 服务端
    "socket.io-client": "^4.8.0",   // 客户端

    // ---- 数据库 ----
    "@prisma/client": "^6.0.0",

    // ---- 认证 ----
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "jose": "^5.0.0",               // Edge Runtime 兼容的 JWT（middleware 中使用）

    // ---- 状态管理 ----
    "zustand": "^5.0.0",

    // ---- Redis（可选，多实例部署时使用）----
    "@socket.io/redis-adapter": "^8.3.0",
    "redis": "^4.7.0"
  },
  "devDependencies": {
    // ---- TypeScript ----
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/bcryptjs": "^2.4.0",

    // ---- Prisma CLI ----
    "prisma": "^6.0.0",

    // ---- 开发工具 ----
    "tsx": "^4.19.0",                // TypeScript 直接运行（开发模式的 server）
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

**依赖说明**：

| 依赖 | 用途 |
|------|------|
| `socket.io` + `socket.io-client` | WebSocket 实时通信，服务端和客户端分别使用 |
| `@prisma/client` + `prisma` | ORM，定义数据模型、生成类型、执行查询 |
| `jsonwebtoken` | Node.js Runtime 中的 JWT 签发与验证 |
| `jose` | Edge Runtime（middleware）中的 JWT 验证 |
| `bcryptjs` | 纯 JS 实现的 bcrypt，无需编译原生模块 |
| `zustand` | 轻量状态管理，替代 Redux |
| `tsx` | 开发模式下直接运行 TypeScript（替代 ts-node，更快） |
| `@socket.io/redis-adapter` | 多实例部署时 Socket.IO 跨进程广播 |

---

## 11. 开发与部署

### 11.1 环境变量

```bash
# .env
DATABASE_URL="postgresql://user:pass@localhost:5432/im_dev?schema=public"
JWT_SECRET="your-jwt-secret-at-least-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret-at-least-32-chars"
CORS_ORIGIN="http://localhost:3000"

# 可选：Redis（多实例部署时使用）
REDIS_URL="redis://localhost:6379"

# 可选：文件上传（生产环境使用对象存储）
UPLOAD_S3_BUCKET=""
UPLOAD_S3_REGION=""
```

### 11.2 开发模式启动

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
npx prisma migrate dev --name init

# 3. 生成 Prisma Client
npx prisma generate

# 4. 启动开发服务器
npm run dev
# 等价于 tsx watch server.ts
# - Next.js HMR 正常工作（前端代码热更新）
# - tsx watch 监听 server.ts 和 src/server/ 目录变更自动重启
```

### 11.3 生产构建与启动

```bash
# 构建
npm run build
# 等价于：
# 1. next build     → 编译 Next.js（.next/ 目录）
# 2. tsc --project tsconfig.server.json → 编译 server.ts（dist/ 目录）

# 启动
npm run start
# 等价于 NODE_ENV=production node dist/server.js
```

### 11.4 Docker 部署

```dockerfile
# Dockerfile
FROM node:22-alpine AS base

# 安装依赖
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# 构建
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 运行
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 11.5 Vercel 部署注意事项

Vercel 是 Serverless 平台，存在以下限制：

| 限制 | 影响 | 解决方案 |
|------|------|---------|
| **不支持 Custom Server** | `server.ts` 无法运行 | 无法使用 Custom Server |
| **不支持持久 WebSocket** | Socket.IO 无法工作 | 用 Pusher/Ably/Liveblocks 等托管 WebSocket 服务替代 |
| **Serverless 函数无状态** | 内存中的在线用户集合、typing 状态会丢失 | 所有状态必须外部化到 Redis |
| **函数执行时限** | 免费版 10s，Pro 版 60s | 长连接不可行 |

**Vercel 上的 IM 替代方案**：

```
Next.js (Vercel)                    Pusher / Ably
┌─────────────┐                    ┌──────────────┐
│ Route Handler│──trigger event──▶│  Channels     │
│ (REST API)  │                    │  (WebSocket)  │──push──▶ Client
│             │◀──webhook────────│              │
└─────────────┘                    └──────────────┘
```

- REST API 仍然使用 Next.js Route Handlers（在 Vercel 上正常运行）
- 实时通信替换为 Pusher/Ably 的 channel-based API
- 前端用 Pusher/Ably 的客户端 SDK 替代 Socket.IO
- 如果必须用 Socket.IO，需要在单独的 VPS/ECS 上部署 Custom Server

### 11.6 VPS / 容器平台部署

在支持长连接的平台（AWS ECS、GCP Cloud Run、Railway、Fly.io）上可以直接部署 Custom Server：

```bash
# Railway / Fly.io 等
# 直接使用 Dockerfile 部署
# 确保 health check 路径指向 /api/health（自行添加）

# Nginx 反向代理配置要点
# WebSocket 需要特殊配置
```

```nginx
# nginx.conf
upstream nextjs_im {
    server 127.0.0.1:3000;
}

server {
    listen 80;

    # WebSocket 升级
    location /socket.io/ {
        proxy_pass http://nextjs_im;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;  # 24 小时，避免空闲断开
    }

    # 其他请求
    location / {
        proxy_pass http://nextjs_im;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 12. 与分离方案的对比

### 全栈方案 vs 分离方案

| 维度 | Next.js 全栈（本 skill） | React + Python 分离方案 |
|------|--------------------------|------------------------|
| **技术栈** | TypeScript 全栈 | 前端 TypeScript + 后端 Python |
| **类型安全** | 天然共享，编译期校验 | 需要 OpenAPI/Protobuf 等契约工具 |
| **部署复杂度** | 单服务部署 | 前后端分别部署，CORS 配置 |
| **开发效率** | 一个 repo，一套工具链，迭代快 | 前后端可独立迭代，但需协调 |
| **团队要求** | 全员熟悉 TypeScript | 前后端可各自用擅长的语言 |
| **性能天花板** | Node.js 单线程，CPU 密集场景弱 | Python asyncio 或 Go 高并发更强 |
| **扩缩容灵活性** | HTTP 和 WS 绑定在一起，必须一起扩 | 可独立扩缩 HTTP API 和 WS 网关 |
| **SSR 支持** | 原生 RSC/SSR，首屏加载快 | 需要额外配置 SSR（如 Next.js 纯前端） |
| **生态** | Next.js + Prisma，Node.js 生态 | 后端可用 Django/FastAPI 成熟方案 |
| **适用规模** | 中小型（日活 < 10 万） | 中大型，或后端有特殊需求 |

### 选型建议

**选择 Next.js 全栈方案**：
- 团队 3-8 人，TypeScript 为主
- 从零开始的新项目，需要快速上线
- 不需要复杂的后端计算（AI 推理、视频转码等）
- 部署环境支持长连接（非纯 Serverless）

**选择分离方案**：
- 后端团队擅长 Python/Go/Java
- 已有成熟的后端微服务基础设施
- 需要独立扩缩前后端
- 后端有 CPU 密集型任务
- 需要部署到 Vercel 等纯 Serverless 平台

---

## 常见陷阱

| 陷阱 | 正确做法 |
|------|---------|
| 在 `next.config.ts` 中启用 `output: 'standalone'` | Custom Server 模式下不使用 standalone，它会内置自己的 HTTP server |
| 使用 `ts-node server.ts` 启动开发服务 | 使用 `tsx watch server.ts`，tsx 更快且无需额外配置 |
| 每次 import 都 `new PrismaClient()` | 使用全局单例模式，防止开发模式热重载导致连接泄漏 |
| 在 middleware.ts 中使用 `jsonwebtoken` 库 | middleware 运行在 Edge Runtime，使用 `jose` 库代替 |
| 在 Server Component 中使用 Socket.IO | Socket.IO 只能在 Client Component 中使用 |
| 将 WebSocket token 放在 URL query string 中 | 使用 Socket.IO 的 `auth` 选项传递 token |
| 部署到 Vercel 使用 Custom Server | Vercel 不支持 Custom Server，WebSocket 需要用 Pusher 等第三方服务 |
| 前端直接信任 `senderId` 字段 | 服务端从 `socket.data.userId` 取认证用户 ID |
| 消息列表用 offset 分页 | 使用游标分页（before timestamp），避免数据变动导致重复或遗漏 |
| 开发模式下 Prisma Client 连接耗尽 | `globalThis` 缓存 PrismaClient 实例 |
| Server Component 数据未注入到 Zustand store | 在 Client Component 的 `useEffect` 中调用 `setConversations` / `setMessages` |
| Socket.IO `connectionStateRecovery` 后不检查 `socket.recovered` | 恢复失败时需要走 REST 同步兜底 |
