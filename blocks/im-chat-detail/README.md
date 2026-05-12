# im-chat-detail

双人对话详情 business pattern block——SDK + dev 工程的二合一。

```
im-chat-detail/
├── component/   ← agent 整体拷贝这个目录到目标项目（SDK 表面）
│                  消费者只读这里的 README.md / SKILL.md 即可
├── dev/         ← 维护这个 block 用的开发态工具（Makefile / tests / docker-compose / vite.config / codegen）
│                  agent 不需要拷贝
├── examples/    ← 本地 demo，展示 component/ 的用法
├── README.md    ← 你正在读
└── block.json   ← MCP block-catalog 用的索引元数据
```

## 给 agent / 消费者

**只看 [`component/README.md`](./component/README.md)**——里面有
"这个 SDK 解决什么 + 三层各自怎么接入 + 完整 API + 反向选型"。

## 给本 block 的维护者

在 dev 工程里跑：

```bash
# backend
cd dev/backend
make install && make db-up && make migrate
make seed-demo        # 装两个示例用户 Alice / Bob
make dev              # uvicorn :8084
make test             # pytest（rootdir = dev/backend/tests）

# protocol codegen
cd dev/protocol
pnpm install
pnpm gen              # 把 component/protocol/openapi.yaml 重生成 generated/*.ts
pnpm lint             # spectral

# frontend lib build（仅在你想发一个预构建包时用；agent 直接消费源码不需要）
cd dev/frontend
pnpm install
pnpm build            # 产出 dist/

# example：把上面三件起来后访问 http://127.0.0.1:5181
cd examples/basic
pnpm install
pnpm dev
```

dev/ 工具假设 cwd = `dev/<layer>/`；Makefile/scripts 内部都用相对
路径回到 `../../component/<layer>/`。修改时保持这个不变量。

## 这个 block 的设计要点（agent 不需要知道，维护者参考）

- **没有 Conversation 表**——双人对话由 (sender_id, recipient_id) 对隐式定义
- 消息软删除：`recall` 把内容改成 `{kind:'recall'}` 并设 `deleted_at`
- in-process WSHub：三类事件 `message.new / message.updated / message.read`
- 服务端独裁排序（前端不重排），cursor base64 URL-safe encoded
