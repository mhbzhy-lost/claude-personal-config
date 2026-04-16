---
name: nextjs-testing
description: "Next.js 15 测试策略：Vitest/Jest 做单元/组件测试、RSC 测试的现实限制、Playwright E2E 指南。"
tech_stack: [nextjs, react, frontend]
language: [typescript]
---

# Next.js 测试策略

> 来源：https://nextjs.org/docs/app/building-your-application/testing

## 用途

给 Next.js 项目配上可维护的测试金字塔：单元测试 + 组件测试 + E2E。

## 何时使用

- 新项目选测试框架
- 需要决定"哪些东西该单测，哪些只能 E2E"

## 现状总览

| 层 | 工具 | 覆盖范围 |
|---|---|---|
| 单元 / 纯函数 | Vitest（推荐）/ Jest | 工具函数、zod schema、纯逻辑 |
| 组件（client） | Vitest + RTL / Jest + RTL | Client Component、hooks |
| 组件（RSC） | 有限支持，优先用 E2E | async RSC 难在 node 环境运行 |
| E2E | Playwright（官方推荐） | 端到端、真实浏览器 |

**核心建议**：RSC 与 Server Actions 不用单元测试覆盖，用 Playwright E2E 验证集成行为。

## Vitest 配置（推荐）

```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

```json
// package.json
{ "scripts": { "test": "vitest", "test:run": "vitest run" } }
```

## Client Component 测试

```tsx
// app/components/Counter.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Counter from './Counter';

test('counter increments', async () => {
  render(<Counter />);
  const btn = screen.getByRole('button');
  await userEvent.click(btn);
  await userEvent.click(btn);
  expect(btn).toHaveTextContent('2');
});
```

## 纯工具函数 / zod schema

```ts
// lib/slug.test.ts
import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('strips accents', () => expect(slugify('Héllo')).toBe('hello'));
});
```

## Jest 注意事项

如仍选 Jest：
- 用 `next/jest` 预设：`import nextJest from 'next/jest.js'`
- 新项目推荐 Vitest，启动更快、ESM 原生、API 与 Jest 基本兼容

```js
// jest.config.js
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });
module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterEach: ['<rootDir>/jest.setup.ts'],
});
```

## RSC / Server Actions 测试

- **避免**直接调用 async Server Component 并期待它 render 成 DOM——运行环境缺失 Next 的 runtime
- **可以**：把业务逻辑从 RSC 里抽离成纯函数 / 服务层，单测纯函数
- **E2E**：用 Playwright 对完整流程做黑盒测试

```ts
// lib/posts.test.ts —— 单测业务层
import { getPost } from './posts';
test('getPost returns null when not found', async () => {
  expect(await getPost('missing')).toBeNull();
});
```

## Playwright E2E

```bash
npm init playwright@latest
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run build && npm run start',   // 测 prod 产物
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

```ts
// tests/e2e/home.spec.ts
import { test, expect } from '@playwright/test';

test('home renders hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
});
```

注：对 App Router 建议 E2E 跑在 `next build && next start` 产物上，`next dev` 的流式与缓存行为与 prod 有差异。

## 关键推荐

- 单元 / 工具：Vitest + RTL
- 端到端：Playwright
- 代码组织：把 RSC 内的业务逻辑下沉到 `lib/` / `services/`，便于单测
- Mock 外部依赖在 E2E 中用 `page.route()`

## 常见陷阱

- 在 Node/jsdom 中 render async Server Component → 报错或空 DOM；移到 E2E
- E2E 跑 `next dev` → 首次响应慢，偶发 flaky；改 `next start`
- 忘记设置 `NEXT_PUBLIC_*` 测试用的值 → client 读到 undefined
- `next/image` 在 jsdom 中行为受限；组件测试建议 mock 成普通 `<img>`

## 组合提示

E2E 具体细节见 `playwright-core` / `playwright-react-spa`（Next.js 场景下仍多数适用，但 SSR 首屏不需要等 hydrate 即可见文本）。
