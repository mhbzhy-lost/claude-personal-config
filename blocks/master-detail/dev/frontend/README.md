# `@md/master-detail`

Master Detail block frontend layer. Scaffolded from `blocks/_shared/frontend/`.

参见 [`SKILL.md`](./SKILL.md) 了解何时使用、API 与反模式。

## 构建

```bash
pnpm install
pnpm build       # vite lib build + tsc 出 .d.ts
pnpm lint        # tsc --noEmit
```

## 下一步开发者

1. 在 `src/types.ts` 添加业务实体类型（参考 protocol/openapi.yaml）
2. 在 `src/api/client.ts` 扩展 `BlockClient` 添加业务方法
3. 在 `src/hooks/` 写 `use<Entity>` 主 hook
4. 在 `src/components/` 写组件
5. 在 `src/index.ts` export 公共 API
6. 在 `SKILL.md` 替换所有 TODO 段，写出**强指令型**的说明
7. 在 `examples/basic/` 写最小消费示例验证

参考：`blocks/im-conversation-list/frontend/`（含 WebSocket）
或 `blocks/commerce-product-list/frontend/`（HTTP only）。
