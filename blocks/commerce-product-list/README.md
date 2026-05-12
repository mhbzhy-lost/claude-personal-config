# commerce-product-list

电商商品瀑布流 business pattern block。

```
commerce-product-list/
├── component/   ← agent 整体拷贝（SDK 表面） — 见 component/README.md
├── dev/         ← 维护工具
├── examples/
├── README.md
└── block.json
```

## 给消费者 / agent

**只看 [`component/README.md`](./component/README.md)**。

## 给维护者

```bash
cd dev/backend
make install && make db-up && make migrate
make seed-demo && make dev

cd dev/protocol && pnpm install && pnpm gen
cd dev/frontend && pnpm install && pnpm build
cd examples/basic && pnpm install && pnpm dev
```
