# im-conversation-list

多会话列表 business pattern block——SDK + dev 工程二合一。

```
im-conversation-list/
├── component/   ← agent 整体拷贝（SDK 表面） — 见 component/README.md
├── dev/         ← 维护工具：Makefile / tests / docker-compose / vite / codegen
├── examples/    ← 本地 demo
├── README.md    ← 你正在读
└── block.json
```

## 给消费者 / agent

**只看 [`component/README.md`](./component/README.md)**。

## 给维护者

```bash
# backend
cd dev/backend
make install && make db-up && make migrate
make seed-demo
make dev               # uvicorn :8080
make test

# protocol
cd dev/protocol
pnpm install && pnpm gen

# frontend lib build（可选）
cd dev/frontend
pnpm install && pnpm build

# example
cd examples/basic
pnpm install && pnpm dev
```
