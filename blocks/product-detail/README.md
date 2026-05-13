# product-detail

商品详情（Product Detail）business pattern block——SDK + dev 工程二合一。

```
product-detail/
├── component/   ← agent 整体拷贝（SDK 表面） — 见 component/README.md
├── dev/         ← 维护工具：Makefile / tests / docker-compose / vite / codegen
├── examples/    ← 本地 demo
├── README.md    ← 你正在读
└── block.json
```

## 给消费者 / agent

**只看 [`component/README.md`](./component/README.md)**——里面有"这个 SDK
解决什么 + 三层各自怎么接入 + 完整 API + 反向选型"。

## 给本 block 的维护者

```bash
# backend
cd dev/backend
make install && make db-up && make migrate
make seed-demo
make dev               # uvicorn :8086
make test

# protocol
cd dev/protocol && pnpm install && pnpm gen

# frontend lib build（可选，agent 直接消费源码不需要）
cd dev/frontend && pnpm install && pnpm build

# example
cd examples/basic && pnpm install && pnpm dev
```

dev/ 工具假设 cwd = `dev/<layer>/`；内部相对路径回到 `../../component/<layer>/`。
