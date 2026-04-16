---
name: playwright-core
description: "Playwright Test (JS/TS) 通用 E2E 测试模式。涵盖配置、locator 策略、断言、等待机制、网络拦截、fixtures、认证、最佳实践。"
tech_stack: [playwright, frontend]
language: [typescript]
---

# Playwright Test 通用 E2E 测试 Skill

> 适用于使用 `@playwright/test` 编写 JS/TS E2E 测试脚本的场景。
> 本 skill 是 Playwright 脚手架的基础层，另有 `playwright-react-spa` 和 `playwright-antd` 提供框架特化模式。

---

## 1. 项目配置

### playwright.config.ts 模板

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 启动被测应用
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### 多 webServer 配置（前后端分离）

```typescript
webServer: [
  {
    command: 'python -m uvicorn app:app --port 8765',
    url: 'http://localhost:8765/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
],
```

---

## 2. Locator 策略（优先级从高到低）

Playwright 推荐语义化 locator，按优先级：

| 优先级 | 方法 | 适用场景 | 示例 |
|---|---|---|---|
| 1 | `getByRole()` | 有明确 ARIA 角色的元素 | `page.getByRole('button', { name: '提交' })` |
| 2 | `getByLabel()` | 表单元素（关联 label） | `page.getByLabel('用户名')` |
| 3 | `getByPlaceholder()` | 有 placeholder 的 input | `page.getByPlaceholder('请输入...')` |
| 4 | `getByText()` | 可见文本内容 | `page.getByText('创建成功')` |
| 5 | `getByTestId()` | 自定义 data-testid | `page.getByTestId('submit-btn')` |
| 6 | `locator()` CSS | 最后手段，依赖 DOM 结构 | `page.locator('.ant-modal-content')` |

### Locator 组合与过滤

```typescript
// 链式过滤
page.getByRole('listitem').filter({ hasText: '任务 A' });

// 在容器中查找
const modal = page.locator('.ant-modal');
modal.getByRole('button', { name: '确认' });

// nth 定位
page.getByRole('row').nth(2);

// has 嵌套过滤
page.locator('tr').filter({ has: page.getByText('running') });
```

### Locator 严格模式

```typescript
// 默认严格模式：匹配多个元素会报错
// 用 .first() / .last() / .nth(n) 处理多匹配
page.getByRole('button', { name: '删除' }).first();
```

---

## 3. 断言（Assertions）

### Web-first 断言（自动重试，推荐）

```typescript
// 可见性
await expect(page.getByText('加载完成')).toBeVisible();
await expect(page.getByText('加载中')).toBeHidden();

// 文本内容
await expect(page.locator('h1')).toHaveText('任务详情');
await expect(page.locator('.status')).toContainText('运行中');

// 属性
await expect(page.getByRole('button')).toBeEnabled();
await expect(page.getByRole('button')).toBeDisabled();
await expect(page.locator('input')).toHaveValue('hello');
await expect(page.locator('.item')).toHaveAttribute('data-status', 'active');

// CSS class
await expect(page.locator('.tag')).toHaveClass(/success/);

// 数量
await expect(page.getByRole('row')).toHaveCount(5);

// URL
await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+/);
await expect(page).toHaveTitle(/Dashboard/);

// 取反
await expect(page.getByText('错误')).not.toBeVisible();
```

### 通用断言（无自动重试）

```typescript
// 读取值后断言
const text = await page.locator('.count').textContent();
expect(Number(text)).toBeGreaterThan(0);
```

### 自定义超时

```typescript
await expect(page.getByText('完成')).toBeVisible({ timeout: 15_000 });
```

---

## 4. 等待机制

### 自动等待（Playwright 内置）

Playwright 的 action 方法（click, fill, check 等）内置自动等待：
- 元素 attached 到 DOM
- 元素可见
- 元素稳定（无动画）
- 元素可接收事件（无遮挡）
- 元素 enabled

**不要手动 sleep**，Playwright 会自动等待。

### 显式等待

```typescript
// 等待特定元素出现
await page.waitForSelector('.ant-modal', { state: 'visible' });

// 等待元素消失
await page.waitForSelector('.ant-spin', { state: 'hidden' });

// 等待 URL 变化
await page.waitForURL('**/tasks/*');

// 等待网络请求完成
await page.waitForResponse(resp =>
  resp.url().includes('/api/tasks') && resp.status() === 200
);

// 等待网络空闲（页面加载完成）
await page.waitForLoadState('networkidle');

// 等待自定义条件（轮询）
await expect(async () => {
  const count = await page.locator('.item').count();
  expect(count).toBeGreaterThan(0);
}).toPass({ timeout: 10_000 });

// 等待请求发出
const requestPromise = page.waitForRequest('**/api/tasks');
await page.getByRole('button', { name: '刷新' }).click();
const request = await requestPromise;
```

---

## 5. 网络拦截与 Mock

### 拦截 API 返回 mock 数据

```typescript
await page.route('**/api/tasks', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 'task-1', title: '测试任务', status: 'running' },
    ]),
  });
});
```

### 修改真实响应

```typescript
await page.route('**/api/tasks', async (route) => {
  const response = await route.fetch();
  const json = await response.json();
  json.push({ id: 'extra', title: '额外任务', status: 'completed' });
  await route.fulfill({ response, body: JSON.stringify(json) });
});
```

### 拦截并延迟（模拟慢网络）

```typescript
await page.route('**/api/**', async (route) => {
  await new Promise(resolve => setTimeout(resolve, 3000));
  await route.continue();
});
```

### 拦截特定方法

```typescript
await page.route('**/api/tasks', async (route) => {
  if (route.request().method() === 'POST') {
    const postData = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      body: JSON.stringify({ id: 'new-id', ...postData }),
    });
  } else {
    await route.continue();
  }
});
```

### 取消拦截

```typescript
await page.unroute('**/api/tasks');
// 或一次性拦截
await page.route('**/api/tasks', async (route) => {
  await route.fulfill({ body: '[]' });
}, { times: 1 });
```

### Mock SSE（Server-Sent Events）

```typescript
// SSE 本质是 HTTP 长连接，用 route 拦截
await page.route('**/api/stream', async (route) => {
  const body = [
    'data: {"event":"start"}\n\n',
    'data: {"event":"update","node":"pm_node"}\n\n',
    'data: {"event":"end"}\n\n',
  ].join('');
  await route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    body,
  });
});
```

---

## 6. Fixtures

### 自定义 fixture

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';

type MyFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<MyFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // 注入 auth token
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('ca_bearer_token', token);
    }, 'test-token-xxx');
    await page.reload();
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

### 使用 fixture

```typescript
import { test, expect } from './fixtures';

test('authenticated user sees dashboard', async ({ authenticatedPage: page }) => {
  await page.goto('/');
  await expect(page.getByText('任务列表')).toBeVisible();
});
```

---

## 7. 认证模式

### storageState 复用（推荐）

```typescript
// global-setup.ts — 一次登录，所有测试复用
import { chromium } from '@playwright/test';

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/?token=test-token');
  await page.waitForURL('**/');
  await page.context().storageState({ path: '.auth/state.json' });
  await browser.close();
}
export default globalSetup;
```

```typescript
// playwright.config.ts
export default defineConfig({
  globalSetup: require.resolve('./global-setup'),
  use: {
    storageState: '.auth/state.json',
  },
});
```

### localStorage 直接注入

```typescript
test.beforeEach(async ({ page }) => {
  await page.addInitScript((token) => {
    window.localStorage.setItem('ca_bearer_token', token);
  }, 'test-bearer-token');
});
```

---

## 8. Page Object 模式

```typescript
// page-objects/DashboardPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly taskList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: /新建/ });
    this.taskList = page.locator('.task-list');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.taskList).toBeVisible();
  }

  async createTask(workspace: string, requirement: string) {
    await this.createButton.click();
    // ... fill form
  }

  async getTaskCount(): Promise<number> {
    return this.taskList.locator('.task-item').count();
  }
}
```

---

## 9. 测试编写模式

### 基本结构

```typescript
import { test, expect } from '@playwright/test';

test.describe('任务管理', () => {
  test.beforeEach(async ({ page }) => {
    // 每个测试前的准备
    await page.goto('/');
  });

  test('应能创建新任务', async ({ page }) => {
    // Arrange
    await page.getByRole('button', { name: '新建任务' }).click();

    // Act
    await page.getByLabel('Workspace 路径').fill('/tmp/test-project');
    await page.getByLabel('需求描述').fill('实现一个 hello world');
    await page.getByRole('button', { name: '创建' }).click();

    // Assert
    await expect(page).toHaveURL(/\/tasks\//);
    await expect(page.getByText('实现一个 hello world')).toBeVisible();
  });
});
```

### 串行测试（有依赖关系）

```typescript
test.describe.serial('完整任务生命周期', () => {
  let taskId: string;

  test('创建任务', async ({ page }) => {
    // ...
    taskId = page.url().split('/tasks/')[1];
  });

  test('查看任务详情', async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    // ...
  });
});
```

### 参数化测试

```typescript
const statuses = ['running', 'completed', 'failed', 'orphaned'];

for (const status of statuses) {
  test(`任务状态 ${status} 应正确显示`, async ({ page }) => {
    await page.route('**/api/tasks/test-id', route =>
      route.fulfill({
        body: JSON.stringify({ id: 'test-id', status, title: '测试' }),
      })
    );
    await page.goto('/tasks/test-id');
    await expect(page.getByText(status, { exact: false })).toBeVisible();
  });
}
```

---

## 10. 调试技巧

```bash
# 带 UI 运行（可视化调试）
npx playwright test --ui

# 带浏览器头运行
npx playwright test --headed

# 使用 Playwright Inspector 逐步调试
npx playwright test --debug

# 查看 trace
npx playwright show-trace trace.zip

# 只运行特定测试
npx playwright test tests/e2e/task-create.spec.ts

# 只运行匹配名称的测试
npx playwright test -g "创建任务"
```

### 测试中暂停调试

```typescript
test('调试用', async ({ page }) => {
  await page.goto('/');
  await page.pause(); // 打开 Inspector
});
```

---

## 11. 最佳实践

### DO

- **用语义化 locator**：`getByRole`, `getByLabel`, `getByText` 优先于 CSS selector
- **用 web-first 断言**：`await expect(locator).toBeVisible()` 而非手动 waitFor + assert
- **独立测试**：每个测试应能独立运行，不依赖其他测试的副作用
- **mock 外部依赖**：用 `page.route()` mock API，避免测试依赖后端状态
- **用 `test.describe` 分组**：按功能模块组织测试
- **适当超时**：对慢操作设置合理的 timeout，而非全局放大
- **trace on failure**：配置 `trace: 'on-first-retry'`，失败时自动保留 trace

### DON'T

- **不要用 `page.waitForTimeout()`**：硬编码等待时间不可靠
- **不要依赖 CSS class 名**：Ant Design 等框架的 class 名可能变化
- **不要在测试间共享状态**：用 fixture 或 beforeEach 确保干净状态
- **不要测试第三方组件内部实现**：只验证面向用户的行为
- **不要写超长测试**：一个 test 验证一个行为，而非整个流程
- **不要忽略 flaky 测试**：调查根因而非简单增加 retry

---

## 12. 常用 CLI 命令

```bash
# 安装
npm init playwright@latest

# 安装浏览器
npx playwright install chromium

# 运行所有测试
npx playwright test

# 生成代码（录制模式）
npx playwright codegen http://localhost:5173

# 查看测试报告
npx playwright show-report
```
