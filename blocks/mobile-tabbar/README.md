# mobile-tabbar

移动端底部 tabbar UI chrome block（前端 only，无后端、无协议层）。

```
mobile-tabbar/
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
cd dev/frontend && pnpm install && pnpm build
cd examples/basic && pnpm install && pnpm dev
```
