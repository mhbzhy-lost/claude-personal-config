---
name: playwright-ci-integration
description: 在 CI（以 GitHub Actions 为主）中运行 Playwright：安装、分片、重试、报告器与产物发布
tech_stack: [playwright, github-actions]
language: [typescript]
capability: [e2e-testing, ci-cd]
version: "playwright unversioned"
collected_at: 2026-04-18
---

# Playwright CI 集成

> 来源：playwright.dev/docs/ci | ci-intro | test-sharding | test-retries | test-reporters

## 用途
把 Playwright 测试稳定、可并行地跑进 CI：装浏览器与系统依赖、用分片加速、用重试压抑 flaky、选对报告器并发布产物。

## 何时使用
- 新项目首次在 GitHub Actions 跑 E2E
- 测试套件变大需要横向并行 → 用 `--shard`
- 存在 flaky 测试 → 配置 `retries` 并识别 flaky 分类
- 需要对接 CI 系统（GitHub 注释、JUnit XML、HTML 报告、JSON 聚合）

## 基础用法

### 三步法（任何 CI）
1. 提供浏览器环境：用官方 Docker 镜像，或 `npx playwright install --with-deps`
2. `npm ci`
3. `npx playwright test`

### GitHub Actions 完整 workflow
```yaml
name: Playwright Tests
on:
  push: { branches: [main, master] }
  pull_request: { branches: [main, master] }
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: lts/* }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

### 分片（sharding）
```bash
npx playwright test --shard=1/4
npx playwright test --shard=2/4
# ...
```
GitHub Actions matrix：
```yaml
strategy:
  matrix:
    shardIndex: [1, 2, 3, 4]
    shardTotal: [4]
steps:
  - run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
```
CI 用 blob 报告器，再在汇总 job 合并：
```ts
// playwright.config.ts
reporter: process.env.CI ? 'blob' : 'html'
```
```bash
npx playwright merge-reports --reporter html ./all-blob-reports
```

### 重试
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({ retries: 3 });
```
或命令行：`npx playwright test --retries=3`。局部：`test.describe.configure({ retries: 2 })`。

运行时感知重试：
```ts
test('my test', async ({ page }, testInfo) => {
  if (testInfo.retry) await cleanSomeCachesOnTheServer();
});
```

### 报告器
```ts
reporter: [
  ['list'],
  ['json', { outputFile: 'test-results.json' }],
  ['junit', { outputFile: 'results.xml' }],
  ['github'],
]
```
条件：`reporter: process.env.CI ? 'dot' : 'list'`。

## 关键 API（摘要）

| 能力 | 配置 / 命令 |
|------|------|
| Workers | CI 建议 `workers: 1`，横向扩展靠分片 |
| 分片 | CLI `--shard=x/y`；配合 `fullyParallel: true` 按 test 粒度切分 |
| 合并分片报告 | `npx playwright merge-reports --reporter html <dir>` |
| 重试 | config `retries: N`；`testInfo.retry` 运行时检测 |
| Serial | `test.describe.serial()` / `test.describe.configure({ mode: 'serial' })` |
| 复用 page | `beforeAll` 建 page，`afterAll` close，配合 serial |
| Dot Reporter | CI 默认；`·`=pass、`F`=fail、`×`=将重试、`±`=flaky、`T`=timeout、`°`=skip |
| GitHub Reporter | `['github']` 自动在 GHA 打失败注释 |
| JUnit | `['junit', { outputFile }]` 输出 XML |
| Blob | 仅用于分片场景，ZIP + hash 命名 |
| JSON | `PLAYWRIGHT_JSON_OUTPUT_NAME` 或 config 指定输出文件 |
| HTML | `npx playwright show-report <dir>` 启动本地服务 |
| 分类 | passed / flaky（首跑失败重试通过）/ failed |

## 注意事项
- **不要缓存浏览器**：还原耗时 ≈ 重新下载，Linux 的 OS 依赖也无法缓存
- **Linux headed 模式**需要 Xvfb：命令前加 `xvfb-run`
- **调试启动失败**：`DEBUG=pw:browser`
- **分片负载均衡**：没开 `fullyParallel` 时按文件切分，需保持测试文件体量均衡
- **报告安全**：HTML 报告/trace 可能含凭据与源码，只上传到可信存储；PR 来自 fork 时无法访问 secrets，Azure 发布会失败
- **重试行为**：失败测试会在新的 worker 进程里重跑；整个 worker（含浏览器）在失败时被丢弃

## 组合提示
- 分片 + blob + merge-reports 是标准并行方案，别忘了在 matrix job 里 `upload-artifact`，再用一个 needs 的汇总 job 下载合并
- `github` reporter 与 HTML 报告通常同时启用，前者贴 PR 注释，后者做深度 trace 分析
- 想要 fail-fast 预检可用 `--only-changed` 配合 push 触发的轻量 job
