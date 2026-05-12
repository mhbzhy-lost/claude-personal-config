# {{SLUG}}

{{TITLE_CN}}（{{TITLE_EN}}）business pattern block —— 端到端预制件，含
**前端组件 + 协议契约 + 后端服务**三层配对资产。

> 🚧 本 README 是脚手架生成的占位骨架。**消费者向**应当替换以下 TODO 段，
> 把"你这个 block 解决什么问题 / 怎么消费"说清楚。参考已就位 block 的
> README 风格（如 `blocks/im-conversation-list/README.md`）。

## 这个 block 解决的问题

TODO：一段话说清业务场景 + 典型用例 3 条。

## 何时**不**用这个 block（反向选型）

TODO：列出邻近场景应当用什么替代。引导消费者避免误用。

## 你需要消费什么资源

### 1. 前端组件

```bash
pnpm add file:../path/to/blocks/{{SLUG}}/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
// TODO: import the block's main component
// import { <MainComponent> } from '@{{PKG_NS}}/{{SLUG}}';

// TODO: 5-10 line minimal usage example
```

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

### 2. 后端服务

```bash
docker run -d --name {{ENV_PREFIX_LOWER}}-pg \
  -e POSTGRES_USER={{ENV_PREFIX_LOWER}} \
  -e POSTGRES_PASSWORD={{ENV_PREFIX_LOWER}} \
  -e POSTGRES_DB={{ENV_PREFIX_LOWER}} \
  -p {{POSTGRES_PORT}}:5432 postgres:17-alpine
docker exec {{ENV_PREFIX_LOWER}}-pg psql -U {{ENV_PREFIX_LOWER}} -d {{ENV_PREFIX_LOWER}} -c "CREATE DATABASE {{ENV_PREFIX_LOWER}}_test OWNER {{ENV_PREFIX_LOWER}};"

cd blocks/{{SLUG}}/backend
make install && make migrate
make seed-demo               # TODO: 写明 seed 出来的是什么
make dev                     # uvicorn :{{BACKEND_PORT}}
```

### 3. 协议契约（自实现后端时用）

- **OpenAPI**：[`protocol/openapi.yaml`](./protocol/openapi.yaml)
- **人类可读说明**：[`protocol/types.md`](./protocol/types.md)
- **TS 类型**：[`protocol/generated/openapi.ts`](./protocol/generated/openapi.ts)
- **zod + zodios**：[`protocol/generated/zodios.ts`](./protocol/generated/zodios.ts)

TODO：如果有业务级约束（如状态机迁移规则）必须列在这里。

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:{{BACKEND_PORT}}` |
| postgres | `:{{POSTGRES_PORT}}` |
| env prefix | `{{ENV_PREFIX}}_` |
| frontend pkg | `@{{PKG_NS}}/{{SLUG}}` |

## 这个 block 包含什么（开发者向）

```
{{SLUG}}/
├── protocol/   OpenAPI + codegen + spectral lint
├── backend/    FastAPI 服务（TODO 端点 / TODO 测试）
└── frontend/   React lib（TODO 主组件 + TODO hook）
```

参考已就位 block 的实现：
- `blocks/im-conversation-list/`（含 WebSocket / cursor 分页）
- `blocks/commerce-product-list/`（无 WS / offset 分页 / 匿名可读）
- `blocks/order-detail/`（单实体 + 嵌套 + 状态机驱动）
