# `@imcl/conversation-list`

`im-conversation-list` 业务模式 block 的前端层。把列表渲染 + 实时同步 +
分页 + cursor + WS 重连 + 智能时间 + 排序 + 操作菜单这些在每个 IM
应用都要重写一遍的"基础设施 660+ LoC"打包成可 import 的预制件。

参见 [`SKILL.md`](./SKILL.md) 了解何时使用、如何使用、严禁哪些反模式。

## 构建

```bash
pnpm install
pnpm build       # vite lib build + tsc 出 .d.ts
pnpm lint        # tsc --noEmit
```

构建产物：`dist/index.js` + `dist/index.d.ts`。

## 演示

```bash
cd examples/basic
pnpm install
pnpm dev         # http://localhost:5175
```

需要后端先起，参见 `../backend/README.md`。

## 设计原则

1. **API 收敛**：一个 `<ConversationList config={...} />` 解决 80% 用法
2. **逃生口克制**：先不开 renderItem 等深度槽，等真有需求再加，避免抽象漏出
3. **服务端权威**：客户端只渲染、不重排
4. **a11y 默认**：role/aria/键盘开箱即用
5. **强指令型 SKILL.md**：明确禁止的反模式比能用的功能更重要——agent 拿
   一个高层组件最容易的失败模式是"看了一眼就觉得能自己写更好"

## 当前限制

- v0.1 内部用，未发布 npm
- 无虚拟滚动（≥ 5k 项时滚动会卡，未来视需求加）
- 无单测 / Storybook（构建体系就位即可，后续补）
- 协议手写 mirror（`src/types.ts`），未自动 gen——同 protocol layer 一起升级
