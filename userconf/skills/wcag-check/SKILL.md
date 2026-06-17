---
name: wcag-check
description: 给 host 产出的 UI 接入 WCAG 2.1 AA 检查——静态 eslint-plugin-jsx-a11y + 运行时 axe-core via Playwright。0 critical/serious 违规为拦截级。block-driven-development Phase 6/7 引用。
---

# What

一份让 agent 在 host 项目里把"UI 是否可访问 / 是否有 WCAG 缺陷"
变成机械可验证项的接入手册。**两层**互补，不互相替代：

| 层 | 工具 | 时机 | 覆盖面 |
|---|---|---|---|
| 静态 | `eslint-plugin-jsx-a11y` | Phase 6 lint，commit 前 | aria 属性拼错、img 缺 alt、role 用错、label 漏关联 …… |
| 运行时 | `axe-core` via `@axe-core/playwright` | Phase 7 e2e | 颜色对比度、焦点序、动态 aria、实际 DOM 渲染态 |

**严格度**：WCAG 2.1 AA（行业默认；欧盟 EAA / 美 ADA / 中国《信息无障碍国家标准》普遍采纳）。
**拦截级**：`critical` + `serious` impact 必须为 0；`moderate` / `minor` 报告但不挂测试。

# When to Use

- 完成 host UI 改动后，本 skill 是 Phase 6 / Phase 7 的硬步骤
- 给已有 host 项目首次接入 a11y 检查
- 调查"为什么这个组件键盘不能用 / 屏幕阅读器读错"等具体 a11y bug

# Not When

- 修 block 内部组件的 a11y → block 维护者职责，走 block 的 dev 工具
  （本 skill 只覆盖 host 产物）
- 纯后端 / CLI 改动，没有渲染面
- 视觉回归测试（属于另一个维度，用 screenshot diff 工具）

# How

## 1. 静态层：eslint-plugin-jsx-a11y

### 安装

```bash
pnpm add -D eslint eslint-plugin-jsx-a11y @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### 配置（`eslint.config.js` flat config）

```js
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import a11y from 'eslint-plugin-jsx-a11y';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin, 'jsx-a11y': a11y },
    rules: {
      ...a11y.configs.recommended.rules,
      // 不开 strict——recommended 已对齐业界，strict 会和 antd 等组件库冲突
    },
  },
];
```

### 集成

`package.json`:
```json
{ "scripts": { "lint:a11y": "eslint . --max-warnings 0" } }
```

Phase 6 流程：
```bash
pnpm lint:a11y     # 必须 0 warning + 0 error 才能进 Phase 7
```

## 2. 运行时层：axe-core via Playwright

### 安装

```bash
pnpm add -D @playwright/test @axe-core/playwright axe-core
```

### 推荐模式：单独的 `a11y.spec.ts`

对每个关键路由扫一次，比每个 spec `afterEach` 都跑快得多。

```ts
// e2e/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = [
  { path: '/', name: '首页' },
  { path: '/orders', name: '订单列表' },
  { path: '/orders/01HXX', name: '订单详情' },
  // 列全部用户故事涉及的路由
];

for (const r of ROUTES) {
  test(`${r.name} 通过 WCAG 2.1 AA (${r.path})`, async ({ page }) => {
    await page.goto(r.path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    // 失败时打印可读详情，便于定位
    if (blocking.length > 0) {
      console.error(
        blocking
          .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n  nodes: ${v.nodes.length}`)
          .join('\n\n'),
      );
    }
    expect(blocking).toEqual([]);
  });
}
```

### 严格模式：每个 e2e 用例 `afterEach`

业务用例本身常会进入"含弹窗 / 选中详情"等中间状态，这些动态状态
是静态路由扫不到的。需要时加一个全局 fixture：

```ts
// e2e/fixtures.ts
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const test = base.extend({});

test.afterEach(async ({ page }, info) => {
  if (info.status !== 'passed') return;     // 只对通过的用例追扫，避免双重失败
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking, `a11y violations after ${info.title}`).toEqual([]);
});
```

业务 spec 改 `import { test } from './fixtures'` 即可。

## 3. 例外处理

绝对要豁免某条规则时（极少数）：

```ts
const results = await new AxeBuilder({ page })
  .withTags([...])
  .disableRules(['color-contrast'])    // 列豁免清单
  .analyze();
```

豁免必须：
- 在 `<workspace>/a11y-exceptions.md` 写一条：规则 id / 路由 / 原因 / 回填日期
- 仅本路由生效，不全局关
- 不能豁免 `critical` impact 的规则

## 4. CI 接入

```yaml
# .github/workflows/a11y.yml（或同等 CI）
- run: pnpm lint:a11y
- run: pnpm playwright test e2e/a11y.spec.ts
- run: pnpm playwright test                 # 业务 e2e 自带 afterEach 钩
```

# Constraints

1. **0 critical + 0 serious**：拦截级别，不许放过
2. **不引 axe v3**：Deque 早停止维护；用 axe-core 4.x（`@axe-core/playwright` 默认拉对）
3. **不 mock 渲染**：axe 必须打真页面（Playwright headless 即可），jsdom 下颜色对比度等关键规则无效
4. **豁免必须记账**：见 §3
5. **WCAG 2.1 AA tag 不删**：跑的是 `['wcag2a','wcag2aa','wcag21a','wcag21aa']`，别只跑 `wcag2aa`（漏 21 新增项）

# Anti-patterns

❌ **只跑静态不跑运行时**：jsx-a11y 看不到颜色对比 / 焦点序 / 动态 aria 同步，漏一大半
❌ **每个 spec 全跑一遍 axe**：单页 axe 跑 1-3s，业务用例多了会让 e2e 翻倍。先用专用 `a11y.spec.ts`，需要动态态再加 `afterEach`
❌ **把 `moderate/minor` 也设为拦截**：会把 antd 等成熟库的小提示也卡掉，团队疲劳后会一键豁免，反而劣化
❌ **用 axe 的 HTML reporter 当主输出**：CI/agent 友好的是 `analyze()` 返回的结构化 JSON，HTML 留给人工 debug
❌ **a11y 检查放在 commit 之后才跑**：晚发现晚修；务必接进 Phase 6 lint 阶段

# Reference

- axe-core 规则索引：https://dequeuniversity.com/rules/axe/
- WCAG 2.1 AA quick reference：https://www.w3.org/WAI/WCAG21/quickref/
- `eslint-plugin-jsx-a11y` 规则表：https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/tree/main/docs/rules
- `@axe-core/playwright` 文档：https://playwright.dev/docs/accessibility-testing
