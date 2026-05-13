# tree-explorer

树形浏览器(文件资源管理器风)（Tree Explorer）UI chrome block——前端 only，无后端、无协议层。

```
tree-explorer/
├── component/   ← agent 整体拷贝（SDK 表面） — 见 component/README.md
├── dev/         ← 维护工具
├── examples/    ← 本地 demo
├── README.md
└── block.json
```

## 给消费者 / agent

**只看 [`component/README.md`](./component/README.md)**。

## 给维护者

```bash
cd dev/frontend && pnpm install && pnpm build
cd examples/basic && pnpm install && pnpm dev
```
