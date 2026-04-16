---
name: playwright-react-spa
description: "Playwright + React SPA 测试模式。覆盖 hydration 等待、React Router 导航、React Query/fetch mock、localStorage auth token 注入、SSE 流测试、受控表单交互。"
tech_stack: [playwright, react]
language: [typescript]
---

# Playwright + React SPA 测试 Skill

> 适用于使用 Playwright 测试 React SPA 应用（Vite / CRA / Webpack）。
> 本 skill 是 `playwright-core` 的 React 特化补充。
> 不适用于 Next.js / Remix 等 SSR 框架。

---

## 1. React 应用就绪等待

### 等待 React mount 完成

React SPA 的 `#root` 初始为空，hydration/mount 后才有内容：

```typescript
// 等待 React 应用 mount
await page.goto('/');
await page.waitForFunction(() => {
  const root = document.getElementById('root');
  return root && root.children.length > 0;
});
```

### 等待特定 UI 元素（推荐）

```typescript
// 比等待 #root 更可靠——直接等待业务内容出现
await page.goto('/');
await expect(page.getByText('任务列表')).toBeVisible({ timeout: 10_000 });
```

### Vite HMR / 开发模式

开发模式下 Vite 的模块加载可能较慢，建议：

```typescript
// 给更长的首次加载超时
await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 });
```

---

## 2. React Router v6 导航测试

### 客户端路由（无全页刷新）

React Router 的导航不触发传统的 page load 事件，需要用 URL 断言：

```typescript
// 点击导航链接
await page.getByRole('link', { name: '任务详情' }).click();

// 等待 URL 变化（React Router 是 pushState，不触发 load）
await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+/);

// 同时验证内容已渲染
await expect(page.getByText('任务详情')).toBeVisible();
```

### 直接 URL 访问（刷新/深链接）

SPA 需要服务端配置 fallback 到 index.html：

```typescript
// 直接导航到深链接
await page.goto('/tasks/abc-123');

// 验证 React Router 正确匹配了路由
await expect(page.getByText('任务详情')).toBeVisible();
```

### 返回导航

```typescript
await page.goto('/tasks/abc-123');
await page.getByRole('button', { name: /返回/ }).click();
await expect(page).toHaveURL('/');
```

---

## 3. API Mock（fetch 拦截）

### Mock REST API

React 应用通常用 fetch/axios 调用 API，用 `page.route()` 拦截：

```typescript
// Mock GET /api/tasks
await page.route('**/api/tasks', async (route) => {
  if (route.request().method() === 'GET') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', title: '任务A', status: 'running', workspace: '/tmp/a' },
        { id: '2', title: '任务B', status: 'completed', workspace: '/tmp/b' },
      ]),
    });
  } else {
    await route.continue();
  }
});
```

### Mock POST 并验证请求体

```typescript
let capturedBody: Record<string, unknown> | null = null;

await page.route('**/api/tasks', async (route) => {
  if (route.request().method() === 'POST') {
    capturedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      body: JSON.stringify({ id: 'new-task', ...capturedBody }),
    });
  } else {
    await route.continue();
  }
});

// 执行创建操作后验证
expect(capturedBody).toMatchObject({
  workspace: '/tmp/test',
  requirement: expect.stringContaining('hello'),
});
```

### Mock React Query 轮询

React Query 会定时 refetch，需要持续 mock：

```typescript
// 第一次返回 running，之后返回 completed
let callCount = 0;
await page.route('**/api/tasks/task-1', async (route) => {
  callCount++;
  const status = callCount <= 2 ? 'running' : 'completed';
  await route.fulfill({
    body: JSON.stringify({ id: 'task-1', status, title: '测试' }),
  });
});
```

### Mock 冲突检测

```typescript
await page.route('**/api/tasks/check-conflict', async (route) => {
  await route.fulfill({
    body: JSON.stringify({ conflict: false }),
  });
});
```

---

## 4. localStorage / sessionStorage Auth

### 注入 Bearer Token

```typescript
// 方式 1：通过 URL 参数触发 bootstrapToken()
await page.goto('/?token=test-e2e-token');
await page.waitForFunction(() =>
  localStorage.getItem('ca_bearer_token') === 'test-e2e-token'
);

// 方式 2：直接注入 localStorage（在页面加载前）
await page.addInitScript((token) => {
  window.localStorage.setItem('ca_bearer_token', token);
}, 'test-e2e-token');
await page.goto('/');

// 方式 3：在已加载页面上注入
await page.goto('/');
await page.evaluate((token) => {
  localStorage.setItem('ca_bearer_token', token);
}, 'test-e2e-token');
await page.reload();
```

### 验证 Token 被发送

```typescript
// 拦截请求，验证 Authorization header
const requestPromise = page.waitForRequest('**/api/tasks');
await page.goto('/');
const request = await requestPromise;
expect(request.headers()['authorization']).toBe('Bearer test-e2e-token');
```

### 清理 Token

```typescript
test.afterEach(async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
});
```

---

## 5. SSE（Server-Sent Events）测试

### Mock SSE 流

```typescript
// Mock LangGraph 的 SSE stream
await page.route('**/threads/*/stream', async (route) => {
  const events = [
    'event: values\ndata: {"messages":[],"current_node":"pm_node"}\n\n',
    'event: values\ndata: {"messages":[{"role":"assistant","content":"分析中..."}]}\n\n',
    'event: end\ndata: {}\n\n',
  ].join('');

  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: events,
  });
});
```

### 验证 SSE 驱动的 UI 更新

```typescript
// 配置 SSE mock 后，验证 UI 反映了流式数据
await page.goto('/tasks/task-1');

// Timeline 应该展示节点执行
await expect(page.getByText('pm_node')).toBeVisible();
await expect(page.getByText('分析中...')).toBeVisible();
```

---

## 6. React 受控表单交互

### 基本 Input 填写

React 受控组件需要触发 `input` 和 `change` 事件，Playwright 的 `fill()` 自动处理：

```typescript
// fill() 会清空已有内容并输入新值，触发 React 事件
await page.getByLabel('Workspace 路径').fill('/tmp/my-project');
await page.getByLabel('需求描述').fill('实现一个 REST API');
```

### TextArea

```typescript
// TextArea 同样用 fill()
const textarea = page.getByPlaceholder('描述你希望完成的功能');
await textarea.fill('这是一段很长的需求描述...');

// 验证 maxLength（如果有 showCount）
await expect(page.getByText(/\d+\s*\/\s*4000/)).toBeVisible();
```

### 表单验证错误

```typescript
// 提交空表单触发验证
await page.getByRole('button', { name: '创建' }).click();

// 等待验证错误出现
await expect(page.getByText('请输入 workspace 绝对路径')).toBeVisible();
await expect(page.getByText('请输入需求描述')).toBeVisible();
```

### 清空输入

```typescript
// Ant Design Input 的 allowClear 按钮
await page.getByLabel('Workspace 路径').fill('/tmp/test');
// 点击清除按钮（通常是 .ant-input-clear-icon）
await page.locator('.ant-input-clear-icon').click();
await expect(page.getByLabel('Workspace 路径')).toHaveValue('');
```

---

## 7. React 异步状态等待

### 等待 Loading → Content 过渡

```typescript
// React Query 加载中状态
await page.goto('/tasks/task-1');

// 等待 Skeleton 消失、内容出现
await expect(page.locator('.ant-skeleton')).toBeHidden({ timeout: 10_000 });
await expect(page.getByText('任务详情')).toBeVisible();
```

### 等待 Mutation 完成

```typescript
// 点击操作按钮后等待请求完成
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/api/tasks') && resp.request().method() === 'POST'
);
await page.getByRole('button', { name: '创建' }).click();
const response = await responsePromise;
expect(response.status()).toBe(201);
```

### 等待 React Query invalidation 刷新

```typescript
// 操作成功后 React Query 会 invalidateQueries 触发 refetch
// 配置 mock 返回更新后的数据
let taskList = [{ id: '1', status: 'running' }];
await page.route('**/api/tasks', route =>
  route.fulfill({ body: JSON.stringify(taskList) })
);

// 创建任务后，更新 mock 数据
taskList = [{ id: '1', status: 'running' }, { id: '2', status: 'pending' }];

// 触发创建
await page.getByRole('button', { name: '创建' }).click();

// 等待列表更新
await expect(page.getByText('pending')).toBeVisible();
```

---

## 8. React Context / Provider 考量

### App-level Provider 影响

React 应用通常有多层 Provider（QueryClient, Router, ConfigProvider, App）。E2E 测试中无需关心这些——直接测试渲染出的 UI：

```typescript
// 不要尝试操作 React 内部状态
// DO: 通过 UI 操作验证行为
await page.goto('/');
await expect(page.getByText('任务列表')).toBeVisible();

// DON'T: 尝试直接修改 React state
// await page.evaluate(() => window.__REACT_QUERY__.invalidateQueries()); // 脆弱
```

### Error Boundary 测试

```typescript
// 模拟 API 错误触发 Error Boundary
await page.route('**/api/tasks/*', route =>
  route.fulfill({ status: 500, body: 'Internal Server Error' })
);
await page.goto('/tasks/nonexistent');
await expect(page.getByText(/加载失败|不存在/)).toBeVisible();
```

---

## 9. 性能与稳定性

### 避免 flaky 测试

```typescript
// 1. 不要依赖 networkidle（React Query 轮询会阻止 idle）
// BAD:
await page.goto('/', { waitUntil: 'networkidle' });
// GOOD:
await page.goto('/');
await expect(page.getByText('任务列表')).toBeVisible();

// 2. 等待 UI 稳定后再操作
await expect(page.getByRole('button', { name: '创建' })).toBeEnabled();
await page.getByRole('button', { name: '创建' }).click();

// 3. 用 toPass() 处理轮询数据
await expect(async () => {
  const rows = await page.getByRole('row').count();
  expect(rows).toBeGreaterThan(1);
}).toPass({ timeout: 10_000, intervals: [1000, 2000, 5000] });
```

### 多标签页 / 新窗口

```typescript
// React SPA 一般不需要多标签页，但如果有外部链接：
const [newPage] = await Promise.all([
  page.context().waitForEvent('page'),
  page.getByRole('link', { name: '外部文档' }).click(),
]);
await newPage.waitForLoadState();
```

---

## 10. 常用 Fixtures for React SPA

```typescript
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{
  authedPage: Page;
  mockApi: void;
}>({
  // 预注入 auth token
  authedPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ca_bearer_token', 'test-token');
    });
    await use(page);
  },

  // 自动 mock 常用 API
  mockApi: [async ({ page }, use) => {
    await page.route('**/api/tasks', route =>
      route.fulfill({
        body: JSON.stringify([
          { id: '1', title: '任务A', status: 'completed', workspace: '/tmp/a',
            created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T01:00:00Z' },
        ]),
      })
    );
    await use();
  }, { auto: true }],
});

export { expect };
```
