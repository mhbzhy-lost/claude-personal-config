# `@dt/data-table`

Data Table block frontend layer. Scaffolded from `blocks/_shared/frontend/`.

参见 [`SKILL.md`](./SKILL.md) 了解何时使用、API 与反模式。

## 构建 / 检查

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint:a11y   # jsx-a11y 静态检查 (0 warning + 0 error 是阻塞门槛)
pnpm build       # vite lib build + tsc 出 .d.ts
```

## a11y 检查

- **静态层(必跑)**：`pnpm lint:a11y`——`eslint-plugin-jsx-a11y` recommended，
  扫 `component/frontend/src/**`。提交 block 前必须 0 warning + 0 error。
- **运行时层(开发者建好 `examples/basic/` 后必跑)**：用
  `@axe-core/playwright` 对 demo 页跑 WCAG 2.1 AA 扫描，0 critical + 0
  serious 才放行。具体接入参见 [`wcag-check`](../../../claude-skills/wcag-check/SKILL.md)
  skill 的"运行时层"段。

## 下一步开发者

1. 在 `src/types.ts` 添加业务实体类型（参考 protocol/openapi.yaml）
2. 在 `src/api/client.ts` 扩展 `BlockClient` 添加业务方法
3. 在 `src/hooks/` 写 `use<Entity>` 主 hook
4. 在 `src/components/` 写组件（注意：a11y 默认必备——`role` / `aria-*`
   / 键盘 / focus；`pnpm lint:a11y` 会卡）
5. 在 `src/index.ts` export 公共 API
6. 在 `SKILL.md` 替换所有 TODO 段，写出**强指令型**的说明
7. 在 `examples/basic/` 写最小消费示例验证，并按 `wcag-check` skill 加
   `a11y.spec.ts` 对 demo 路由跑运行时 WCAG 扫描

参考：`blocks/im-conversation-list/frontend/`（含 WebSocket）
或 `blocks/commerce-product-list/frontend/`（HTTP only）。
