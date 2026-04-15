---
name: playwright-antd
description: "Playwright + Ant Design 5.x 组件交互模式。涵盖 Modal、Form、Table、Select、Popconfirm、Collapse、Message、Tag、Result、Empty、Skeleton、Splitter 等组件的 DOM 结构与 Playwright selector 映射。Use when writing Playwright E2E tests for apps using Ant Design 5.x."
applies_to:
  markers_any:
    - "dependency: antd"
priority: 8
---

# Playwright + Ant Design 5.x 组件交互 Skill

> 适用于使用 Playwright 测试 Ant Design 5.x 应用时的组件选择器与交互模式。
> 本 skill 是 `playwright-core` 的 Ant Design 特化补充。
> Ant Design 5.x 使用 CSS-in-JS（`@ant-design/cssinjs`），类名前缀为 `ant-`。

---

## 核心原则

1. **优先用语义化 locator**：`getByRole()`, `getByText()`, `getByLabel()` 优先于 CSS class
2. **CSS class 作为兜底**：Ant Design 的 `.ant-*` class 稳定可靠，但语义化选择器更抗重构
3. **Portal 元素注意**：Modal、Select dropdown、Popconfirm、Message 渲染在 `document.body` 下的 Portal 中，不在组件父元素内
4. **动画等待**：许多组件有进入/退出动画，需等待动画完成后再断言

---

## 1. Modal（对话框）

### DOM 结构

```
body
└── .ant-modal-root
    └── .ant-modal-wrap                 ← 遮罩层
        └── .ant-modal                  ← 对话框容器
            ├── .ant-modal-content
            │   ├── .ant-modal-close    ← 关闭按钮（如果 closable=true）
            │   ├── .ant-modal-header
            │   │   └── .ant-modal-title
            │   ├── .ant-modal-body     ← 内容区
            │   └── .ant-modal-footer   ← 底部按钮区
            │       ├── button (取消)
            │       └── button (确定)
```

### 交互模式

```typescript
// 等待 Modal 打开（渲染在 body Portal 中）
await expect(page.locator('.ant-modal')).toBeVisible();

// 通过标题定位特定 Modal
const modal = page.locator('.ant-modal').filter({ hasText: '新建任务' });
await expect(modal).toBeVisible();

// Modal 内的按钮
await modal.getByRole('button', { name: '确定' }).click();
await modal.getByRole('button', { name: '取消' }).click();

// 等待 Modal 关闭（动画后 DOM 移除）
await expect(page.locator('.ant-modal')).toBeHidden();

// 自定义 footer=null 的 Modal：按钮在 .ant-modal-body 中
const bodyModal = page.locator('.ant-modal-body');
await bodyModal.getByRole('button', { name: '批准' }).click();

// destroyOnClose: Modal 关闭后 DOM 完全移除
await expect(page.locator('.ant-modal')).toHaveCount(0);

// closable=false, maskClosable=false 的 Modal 不可通过点击遮罩或关闭按钮关闭
// 必须通过内部按钮操作
```

---

## 2. Form（表单）

### DOM 结构

```
.ant-form
├── .ant-form-item
│   ├── .ant-form-item-label
│   │   └── label[for="field_name"]
│   └── .ant-form-item-control
│       ├── .ant-form-item-control-input
│       │   └── input / textarea / select ...
│       └── .ant-form-item-explain        ← 验证错误
│           └── .ant-form-item-explain-error
```

### 交互模式

```typescript
// 通过 label 定位表单字段（推荐）
await page.getByLabel('Workspace 路径').fill('/tmp/project');
await page.getByLabel('需求描述').fill('实现功能 X');

// 通过 placeholder 定位
await page.getByPlaceholder('/path/to/your/project').fill('/tmp/test');

// 表单验证错误断言
await page.getByRole('button', { name: '创建' }).click();
await expect(page.locator('.ant-form-item-explain-error')).toBeVisible();
await expect(page.getByText('请输入 workspace 绝对路径')).toBeVisible();

// 验证特定字段的错误
const workspaceItem = page.locator('.ant-form-item').filter({ hasText: 'Workspace' });
await expect(workspaceItem.locator('.ant-form-item-explain-error')).toHaveText('请输入绝对路径（以 / 开头）');

// Form disabled 状态
await expect(page.getByLabel('Workspace 路径')).toBeDisabled();
```

---

## 3. Input / TextArea

### DOM 结构

```
.ant-input-affix-wrapper          ← 有前缀/后缀时的外层
├── .ant-input-prefix             ← 前缀图标
├── input.ant-input               ← 实际 input
├── .ant-input-suffix             ← 后缀
│   └── .ant-input-clear-icon     ← allowClear 的清除按钮
```

### 交互模式

```typescript
// 基本填写
await page.getByLabel('Workspace 路径').fill('/tmp/test');

// 清空（allowClear）
await page.getByLabel('Workspace 路径').fill('something');
await page.locator('.ant-input-clear-icon').click();

// TextArea
await page.getByRole('textbox', { name: '需求描述' }).fill('详细需求...');

// TextArea showCount
await expect(page.getByText(/\d+\s*\/\s*4000/)).toBeVisible();

// Input 带前缀图标
const inputWrapper = page.locator('.ant-input-affix-wrapper').filter({
  has: page.locator('.anticon-folder-open'),
});
await inputWrapper.locator('input').fill('/tmp/project');

// copyable Text
await page.locator('.ant-typography-copy').click();
```

---

## 4. Button

### DOM 结构

```
button.ant-btn.ant-btn-primary     ← type="primary"
button.ant-btn.ant-btn-default     ← type="default"
button.ant-btn.ant-btn-text        ← type="text"
button.ant-btn.ant-btn-link        ← type="link"
button.ant-btn.ant-btn-dangerous   ← danger=true
button.ant-btn-loading             ← loading=true
```

### 交互模式

```typescript
// 通过文本定位（推荐）
await page.getByRole('button', { name: '新建任务' }).click();
await page.getByRole('button', { name: '创建' }).click();

// 等待 loading 状态结束
await expect(page.getByRole('button', { name: '创建' })).toBeEnabled();

// 带图标的按钮（图标不影响 name 匹配）
await page.getByRole('button', { name: /返回/ }).click();

// danger 按钮
await page.locator('.ant-btn-dangerous').click();

// confirmLoading 状态
await expect(page.getByRole('button', { name: '创建' }))
  .toHaveClass(/ant-btn-loading/);
```

---

## 5. Select / Dropdown

### DOM 结构

```
.ant-select                           ← 选择器容器
├── .ant-select-selector
│   ├── .ant-select-selection-search
│   │   └── input                     ← 搜索输入
│   └── .ant-select-selection-item    ← 已选值显示

body (Portal)
└── .ant-select-dropdown              ← 下拉菜单（Portal!）
    └── .rc-virtual-list
        └── .ant-select-item          ← 选项
            └── .ant-select-item-option-content
```

### 交互模式

```typescript
// 打开 Select 下拉
await page.locator('.ant-select').click();
// 或通过 label
await page.getByLabel('状态筛选').click();

// 选择选项（下拉在 Portal 中，用 page 级 locator）
await page.locator('.ant-select-dropdown').getByText('运行中').click();

// 搜索 + 选择
await page.locator('.ant-select-selection-search input').fill('run');
await page.locator('.ant-select-dropdown').getByText('running').click();

// 验证已选值
await expect(page.locator('.ant-select-selection-item')).toHaveText('running');

// 清除选择
await page.locator('.ant-select-clear').click();

// 多选模式
await page.locator('.ant-select').click();
await page.locator('.ant-select-dropdown').getByText('选项A').click();
await page.locator('.ant-select-dropdown').getByText('选项B').click();
// 关闭下拉
await page.keyboard.press('Escape');
```

---

## 6. Table

### DOM 结构

```
.ant-table-wrapper
└── .ant-table
    ├── .ant-table-thead
    │   └── tr
    │       └── th.ant-table-cell
    └── .ant-table-tbody
        └── tr.ant-table-row[data-row-key="..."]
            └── td.ant-table-cell
```

### 交互模式

```typescript
// 表格行数
await expect(page.locator('.ant-table-row')).toHaveCount(5);

// 定位特定行
const row = page.locator('.ant-table-row').filter({ hasText: '任务A' });
await expect(row).toBeVisible();

// 行内按钮
await row.getByRole('button', { name: '查看' }).click();

// 表头排序
await page.locator('th').filter({ hasText: '创建时间' }).click();

// 分页
await page.locator('.ant-pagination').getByText('2').click();
// 或
await page.locator('.ant-pagination-next').click();

// 空状态
await expect(page.locator('.ant-empty')).toBeVisible();
await expect(page.getByText('暂无数据')).toBeVisible();

// 加载中
await expect(page.locator('.ant-spin')).toBeVisible();
```

---

## 7. Popconfirm（气泡确认框）

### DOM 结构

```
body (Portal)
└── .ant-popover.ant-popconfirm
    └── .ant-popover-inner
        ├── .ant-popconfirm-message
        │   ├── .ant-popconfirm-title    ← 标题
        │   └── .ant-popconfirm-description ← 描述
        └── .ant-popconfirm-buttons
            ├── button (取消)
            └── button (确定)
```

### 交互模式

```typescript
// 触发 Popconfirm（点击触发元素）
await page.getByRole('button', { name: '归档' }).click();

// 等待 Popconfirm 出现（Portal 中）
const popconfirm = page.locator('.ant-popconfirm');
await expect(popconfirm).toBeVisible();

// 验证标题/描述
await expect(popconfirm.locator('.ant-popconfirm-title')).toHaveText('归档此任务？');

// 确认
await popconfirm.getByRole('button', { name: '归档' }).click();
// 或取消
await popconfirm.getByRole('button', { name: '取消' }).click();

// 等待 Popconfirm 关闭
await expect(popconfirm).toBeHidden();

// danger 确认按钮
await popconfirm.locator('.ant-btn-dangerous').click();
```

---

## 8. Collapse（折叠面板）

### DOM 结构

```
.ant-collapse
└── .ant-collapse-item
    ├── .ant-collapse-header           ← 可点击的标题栏
    │   ├── .ant-collapse-expand-icon
    │   └── .ant-collapse-header-text
    └── .ant-collapse-content          ← 展开/折叠的内容
        └── .ant-collapse-content-box
```

### 交互模式

```typescript
// 展开折叠面板
await page.locator('.ant-collapse-header').filter({ hasText: '任务详情' }).click();

// 等待内容展开（有动画）
const content = page.locator('.ant-collapse-content').filter({ hasText: '任务 ID' });
await expect(content).toBeVisible();

// ghost 模式的 Collapse 没有边框，但结构相同
```

---

## 9. Descriptions（描述列表）

### DOM 结构

```
.ant-descriptions
└── .ant-descriptions-view
    └── table
        └── tbody
            └── tr.ant-descriptions-row
                ├── th.ant-descriptions-item-label    ← "任务 ID"
                └── td.ant-descriptions-item-content  ← 值
```

### 交互模式

```typescript
// 通过 label 定位描述项的值
const taskIdRow = page.locator('.ant-descriptions-row').filter({ hasText: '任务 ID' });
const taskIdValue = taskIdRow.locator('.ant-descriptions-item-content');
await expect(taskIdValue).toContainText('abc-123');

// 简写：直接用文本
await expect(page.locator('.ant-descriptions')).toContainText('任务 ID');
await expect(page.locator('.ant-descriptions')).toContainText('abc-123');
```

---

## 10. Tag（标签）

### DOM 结构

```
span.ant-tag                    ← 基础标签
span.ant-tag.ant-tag-green      ← 颜色标签
span.ant-tag.ant-tag-processing ← processing 状态（带动画点）
```

### 交互模式

```typescript
// 定位特定颜色的 Tag
await expect(page.locator('.ant-tag-green')).toHaveText('completed');
await expect(page.locator('.ant-tag-processing')).toHaveText('running');

// 或通过文本
await expect(page.locator('.ant-tag').filter({ hasText: 'running' })).toBeVisible();
```

---

## 11. Result（结果）

### DOM 结构

```
.ant-result
├── .ant-result-icon          ← 图标区
├── .ant-result-title         ← 标题
├── .ant-result-subtitle      ← 副标题
└── .ant-result-extra         ← 操作区
    └── button ...
```

### 交互模式

```typescript
// 验证 Result 状态
await expect(page.locator('.ant-result-title')).toHaveText('任务执行失败');
await expect(page.locator('.ant-result')).toBeVisible();

// Result 中的操作按钮
await page.locator('.ant-result-extra').getByRole('button', { name: '恢复任务' }).click();
```

---

## 12. Message（全局提示）

### DOM 结构

```
body
└── .ant-message
    └── .ant-message-notice
        └── .ant-message-notice-content
            ├── .ant-message-success  ← 成功
            ├── .ant-message-error    ← 错误
            ├── .ant-message-warning  ← 警告
            └── .ant-message-info     ← 信息
```

### 交互模式

```typescript
// 等待成功提示出现
await expect(page.locator('.ant-message-success')).toBeVisible();
await expect(page.locator('.ant-message-success')).toContainText('创建成功');

// 等待错误提示
await expect(page.locator('.ant-message-error')).toContainText('创建失败');

// 等待提示消失（Message 有自动关闭）
await expect(page.locator('.ant-message-success')).toBeHidden({ timeout: 5_000 });
```

---

## 13. Skeleton（骨架屏）

### DOM 结构

```
.ant-skeleton.ant-skeleton-active     ← 加载中（有动画）
├── .ant-skeleton-header
│   └── .ant-skeleton-avatar
├── .ant-skeleton-content
│   ├── .ant-skeleton-title
│   └── .ant-skeleton-paragraph
│       └── li (多行)
```

### 交互模式

```typescript
// 等待加载完成（Skeleton 消失）
await expect(page.locator('.ant-skeleton')).toBeHidden({ timeout: 10_000 });

// 验证正在加载
await expect(page.locator('.ant-skeleton-active')).toBeVisible();
```

---

## 14. Empty（空状态）

### DOM 结构

```
.ant-empty
├── .ant-empty-image
└── .ant-empty-description    ← 描述文字
```

### 交互模式

```typescript
await expect(page.locator('.ant-empty')).toBeVisible();
await expect(page.locator('.ant-empty-description')).toHaveText('暂无执行数据');

// Empty 内的操作按钮
await page.locator('.ant-empty').getByRole('button', { name: '返回总览' }).click();
```

---

## 15. Splitter（分栏）

### DOM 结构

```
.ant-splitter
├── .ant-splitter-panel       ← 左面板
├── .ant-splitter-bar         ← 拖拽条
│   └── .ant-splitter-bar-dragger
└── .ant-splitter-panel       ← 右面板
```

### 交互模式

```typescript
// 验证双栏布局
await expect(page.locator('.ant-splitter-panel')).toHaveCount(2);

// 左面板内容
const leftPanel = page.locator('.ant-splitter-panel').first();
await expect(leftPanel.getByText('Timeline')).toBeVisible();

// 右面板内容
const rightPanel = page.locator('.ant-splitter-panel').last();
await expect(rightPanel.getByText('Decomposition')).toBeVisible();
```

---

## 16. Space（间距）

```typescript
// Space 渲染为 .ant-space
// 通常不需要直接选择 Space，通过内部元素定位
await page.locator('.ant-space').filter({ hasText: '返回' }).getByRole('button').click();
```

---

## 17. Notification（通知）

### DOM 结构

```
body
└── .ant-notification
    └── .ant-notification-notice
        ├── .ant-notification-notice-message    ← 标题
        ├── .ant-notification-notice-description ← 内容
        └── .ant-notification-notice-close       ← 关闭按钮
```

### 交互模式

```typescript
await expect(page.locator('.ant-notification-notice-message')).toHaveText('操作成功');
await page.locator('.ant-notification-notice-close').click();
```

---

## 18. Typography（排版）

```typescript
// copyable text：点击复制按钮
await page.locator('.ant-typography').filter({ hasText: 'task-id-xxx' })
  .locator('.ant-typography-copy').click();

// code 样式的文本
await expect(page.locator('code').filter({ hasText: 'task-id' })).toBeVisible();

// 省略展开
await page.locator('.ant-typography-expand').click();
```

---

## 19. Tooltip（文字提示）

```typescript
// Tooltip 需要 hover 触发
await page.getByRole('button', { name: '附件' }).hover();
await expect(page.locator('.ant-tooltip')).toBeVisible();
await expect(page.locator('.ant-tooltip-inner')).toContainText('选择文件');
```

---

## 20. 综合交互模式

### Modal 内的 Form

```typescript
// 打开 Modal
await page.getByRole('button', { name: '新建任务' }).click();
const modal = page.locator('.ant-modal');
await expect(modal).toBeVisible();

// 在 Modal 内填写 Form
await modal.getByLabel('Workspace 路径').fill('/tmp/project');
await modal.getByLabel('需求描述').fill('实现功能 X');

// 提交（Modal footer 的确定按钮）
await modal.getByRole('button', { name: '创建' }).click();

// 等待 Modal 关闭
await expect(modal).toBeHidden();
```

### Popconfirm 确认后的 Message

```typescript
// 触发 Popconfirm
await page.getByRole('button', { name: '归档' }).click();

// 在 Popconfirm 中确认
const popconfirm = page.locator('.ant-popconfirm');
await popconfirm.getByRole('button', { name: '归档' }).click();

// 等待成功 Message
await expect(page.locator('.ant-message-success')).toContainText('任务已归档');
```

### Collapse 展开后的 Descriptions

```typescript
// 展开 Collapse
await page.locator('.ant-collapse-header').first().click();

// 在展开的内容中找 Descriptions
const descriptions = page.locator('.ant-collapse-content .ant-descriptions');
await expect(descriptions).toBeVisible();

// 读取特定字段
await expect(descriptions).toContainText('任务 ID');
```

### 等待 Loading 完成的通用模式

```typescript
/**
 * 等待 Ant Design 加载状态完成。
 * 适用于 Skeleton、Spin、Button loading 等。
 */
async function waitForAntLoading(page: Page) {
  // 等待所有 Skeleton 消失
  await expect(page.locator('.ant-skeleton')).toHaveCount(0, { timeout: 15_000 });
  // 等待所有 Spin 消失
  const spins = page.locator('.ant-spin');
  if (await spins.count() > 0) {
    await expect(spins).toHaveCount(0, { timeout: 15_000 });
  }
}
```
