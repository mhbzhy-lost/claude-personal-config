# `@cpl/product-list`

`commerce-product-list` 业务模式 block 的前端层。把电商商品瀑布流的
基础设施（grid 渲染 + 多维筛选 + 5 种排序 + offset 分页 + 收藏/加购 +
价格格式化 + 匿名/登录两套 UX）打包成一次 import 解决的预制件。

参见 [`SKILL.md`](./SKILL.md) 了解何时使用、如何使用、严禁哪些反模式。

## 构建

```bash
pnpm install
pnpm build       # vite lib build + tsc 出 .d.ts
pnpm lint        # tsc --noEmit
```

## 演示

```bash
cd examples/basic
pnpm install
pnpm dev         # http://localhost:5176
```

需要后端先起，参见 `../backend/README.md`。

## 设计原则

与 `@imcl/conversation-list` 同一套（参见那边 README §设计原则）：
- API 收敛、逃生口克制、服务端权威、a11y 默认、强指令型 SKILL.md

刻意保持的差异（用于测试 block 模板的可复用性）：
- 无 WebSocket
- offset 而非 cursor 分页
- grid 而非列表布局
- 显式按钮而非右键菜单交互模型

## 当前限制

- v0.1 内部用，未发布 npm
- 无虚拟滚动（大量 image lazy load 应能撑住 1k）
- 无单测 / Storybook
- 协议手写 mirror，未自动 gen
