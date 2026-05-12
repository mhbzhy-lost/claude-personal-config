# {{SLUG}} SDK

{{TITLE_CN}}（{{TITLE_EN}}）SDK——把这个 `component/` 目录原样拷贝到目标
项目即可用。**不需要打包，不需要 npm publish，只读 API 文档**。

> 🚧 占位骨架。请把下面 TODO 全部替换成业务实际描述。

```
component/
├── frontend/    React + antd 组件 + 类型 + SKILL.md（详细 API 文档）
├── backend/     FastAPI + SQLAlchemy + alembic
└── protocol/    OpenAPI 契约 + 生成的 TS 类型
```

## 整体复制

```bash
cp -r blocks/{{SLUG}}/component your-project/sdk/{{SLUG}}
```

## 三层接入

### 1. 前端

```bash
pnpm add file:./sdk/{{SLUG}}/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
// TODO: import block's main component
// import { <Main> } from '@{{PKG_NS}}/{{SLUG}}';
// import '@{{PKG_NS}}/{{SLUG}}/styles.css';

<ConfigProvider><AntdApp>
  {/* TODO: minimal usage example */}
</AntdApp></ConfigProvider>
```

`main`/`types` 指向 `src/index.ts`，目标项目直接消费 TS 源码，无需 build。

**完整 props 见 `frontend/SKILL.md`。**

### 2. 后端

```bash
cd sdk/{{SLUG}}/backend
uv venv && uv pip install -e '.[dev]'
uv run alembic upgrade head
uv run uvicorn app.main:app --port {{BACKEND_PORT}}
```

### 3. 协议

```ts
import type { components } from './sdk/{{SLUG}}/protocol/generated/openapi';
// TODO: pick the relevant schema types
```

## 关键设计契约

TODO：列出消费者需要知道的核心契约（per-user 状态、cursor 分页、auth pattern、
独裁排序等）。

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:{{BACKEND_PORT}}` |
| postgres | `:{{POSTGRES_PORT}}` |
| env prefix | `{{ENV_PREFIX}}_` |
| frontend pkg | `@{{PKG_NS}}/{{SLUG}}` |

## 何时**不**用

TODO：反向选型。
