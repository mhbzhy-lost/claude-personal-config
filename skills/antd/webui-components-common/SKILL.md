---
name: webui-components-common
description: "Web UI 套件总览（React + antd）。同时满足以下条件时启用本套件： Use when building web apps with React and Ant Design — consult this overview before picking specific ant-* component skills."
tech_stack: [antd]
applies_to: [architect, developer]
match:
  project_type_in: [web-app]
  tech_stack_any: [react, antd]
priority: 10
---

# Web UI 组件套件（Ant Design）

> 适用于 React + antd 的 Web 前端项目。

## 触发条件

**同时满足以下条件时启用本套件：**

1. 当前任务是 **web 应用**（不是 CLI / 纯后端 / 库）
2. 技术栈选用 **React**

**UI 框架决策规则（优先级由高到低）：**

- 已明确选用其它 UI 框架（MUI / Chakra / Arco / shadcn 等）→ **跳过本套件**
- 已明确选用 antd → 启用本套件
- **未明确指定 UI 框架 → 默认使用 antd**，启用本套件

非 React 前端（Vue / Svelte / Solid 等）一律不启用。

---

## 如何使用

**architect 阶段：**
1. 列出各页面/模块所需的 antd 组件清单
2. 在架构设计文档中引用对应的 `ant-<slug>` skill 路径
3. 技术选型结论中注明"UI 框架：Ant Design v5"

**developer 阶段：**
1. 实现页面前先 read 对应的 `skills/webui/ant-<slug>/SKILL.md`
2. 按"基础用法"段落起手，再按需扩展
3. 优先使用官方 props，不要硬编码 className 覆盖组件样式
4. 复杂 API 回头查：`https://ant.design/components/<slug>-cn`

---

## 组件索引

### 通用
| 组件 | 用途 | Skill |
|---|---|---|
| Button（按钮） | 触发即时操作 | `skills/webui/ant-button/SKILL.md` |
| FloatButton（悬浮按钮） | 页面全局悬浮操作 | `skills/webui/ant-float-button/SKILL.md` |
| Icon（图标） | 语义化矢量图标 | `skills/webui/ant-icon/SKILL.md` |
| Typography（排版） | 文本格式与展示 | `skills/webui/ant-typography/SKILL.md` |

### 布局
| 组件 | 用途 | Skill |
|---|---|---|
| Divider（分割线） | 区隔内容区域 | `skills/webui/ant-divider/SKILL.md` |
| Flex（弹性布局） | 对齐的弹性容器 | `skills/webui/ant-flex/SKILL.md` |
| Grid（栅格） | 24 栅格响应式布局 | `skills/webui/ant-grid/SKILL.md` |
| Layout（布局） | 页面整体框架 | `skills/webui/ant-layout/SKILL.md` |
| Masonry（瀑布流） | 不等高卡片瀑布流 | `skills/webui/ant-masonry/SKILL.md` |
| Space（间距） | 组件间距设置 | `skills/webui/ant-space/SKILL.md` |
| Splitter（分割器） | 可拖拽区域分割 | `skills/webui/ant-splitter/SKILL.md` |

### 导航
| 组件 | 用途 | Skill |
|---|---|---|
| Affix（固钉） | 固定页面元素位置 | `skills/webui/ant-affix/SKILL.md` |
| Anchor（锚点） | 跳转到指定位置 | `skills/webui/ant-anchor/SKILL.md` |
| Breadcrumb（面包屑） | 当前页面层级路径 | `skills/webui/ant-breadcrumb/SKILL.md` |
| Dropdown（下拉菜单） | 向下弹出的操作列表 | `skills/webui/ant-dropdown/SKILL.md` |
| Menu（菜单） | 页面导航菜单 | `skills/webui/ant-menu/SKILL.md` |
| Pagination（分页） | 长列表分页控制 | `skills/webui/ant-pagination/SKILL.md` |
| Steps（步骤条） | 分步任务流程引导 | `skills/webui/ant-steps/SKILL.md` |
| Tabs（标签页） | 切换不同内容区域 | `skills/webui/ant-tabs/SKILL.md` |

### 数据录入
| 组件 | 用途 | Skill |
|---|---|---|
| AutoComplete（自动完成） | 输入框联想补全 | `skills/webui/ant-auto-complete/SKILL.md` |
| Cascader（级联选择） | 多级联动选择框 | `skills/webui/ant-cascader/SKILL.md` |
| Checkbox（复选框） | 多项选择 | `skills/webui/ant-checkbox/SKILL.md` |
| ColorPicker（颜色选择） | 颜色选取控件 | `skills/webui/ant-color-picker/SKILL.md` |
| DatePicker（日期选择） | 日期/范围选择 | `skills/webui/ant-date-picker/SKILL.md` |
| Form（表单） | 数据录入与校验 | `skills/webui/ant-form/SKILL.md` |
| Input（输入框） | 基础文本输入 | `skills/webui/ant-input/SKILL.md` |
| InputNumber（数字输入） | 数值范围输入 | `skills/webui/ant-input-number/SKILL.md` |
| Mentions（提及） | @提及功能输入框 | `skills/webui/ant-mentions/SKILL.md` |
| Radio（单选框） | 单项选择 | `skills/webui/ant-radio/SKILL.md` |
| Rate（评分） | 评分操作控件 | `skills/webui/ant-rate/SKILL.md` |
| Select（选择器） | 下拉单/多选 | `skills/webui/ant-select/SKILL.md` |
| Segmented（分段控制） | 多选项分段切换 | `skills/webui/ant-segmented/SKILL.md` |
| Slider（滑块） | 范围数值输入 | `skills/webui/ant-slider/SKILL.md` |
| Switch（开关） | 两态切换 | `skills/webui/ant-switch/SKILL.md` |
| TimePicker（时间选择） | 时间选取控件 | `skills/webui/ant-time-picker/SKILL.md` |
| Transfer（穿梭框） | 双栏数据迁移 | `skills/webui/ant-transfer/SKILL.md` |
| TreeSelect（树选择） | 树形结构下拉选择 | `skills/webui/ant-tree-select/SKILL.md` |
| Upload（上传） | 文件上传控件 | `skills/webui/ant-upload/SKILL.md` |

### 数据展示
| 组件 | 用途 | Skill |
|---|---|---|
| Avatar（头像） | 用户/事物图标展示 | `skills/webui/ant-avatar/SKILL.md` |
| Badge（徽标） | 数字/状态徽章 | `skills/webui/ant-badge/SKILL.md` |
| Calendar（日历） | 日历数据容器 | `skills/webui/ant-calendar/SKILL.md` |
| Card（卡片） | 通用内容卡片 | `skills/webui/ant-card/SKILL.md` |
| Carousel（走马灯） | 轮播内容区域 | `skills/webui/ant-carousel/SKILL.md` |
| Collapse（折叠面板） | 可折叠内容区域 | `skills/webui/ant-collapse/SKILL.md` |
| Descriptions（描述列表） | 多字段只读展示 | `skills/webui/ant-descriptions/SKILL.md` |
| Empty（空状态） | 空数据占位图 | `skills/webui/ant-empty/SKILL.md` |
| Image（图片） | 可预览图片 | `skills/webui/ant-image/SKILL.md` |
| List（列表） | 基础列表展示 | `skills/webui/ant-list/SKILL.md` |
| Popover（气泡卡片） | 悬停弹出卡片浮层 | `skills/webui/ant-popover/SKILL.md` |
| QRCode（二维码） | 文本转二维码 | `skills/webui/ant-qr-code/SKILL.md` |
| Statistic（统计数值） | 统计指标展示 | `skills/webui/ant-statistic/SKILL.md` |
| Table（表格） | 结构化数据展示 | `skills/webui/ant-table/SKILL.md` |
| Tag（标签） | 分类/状态小标签 | `skills/webui/ant-tag/SKILL.md` |
| Timeline（时间轴） | 时间流信息展示 | `skills/webui/ant-timeline/SKILL.md` |
| Tooltip（文字提示） | 简单文字悬停提示 | `skills/webui/ant-tooltip/SKILL.md` |
| Tour（引导） | 分步功能引导 | `skills/webui/ant-tour/SKILL.md` |
| Tree（树形控件） | 多层级结构列表 | `skills/webui/ant-tree/SKILL.md` |

### 反馈
| 组件 | 用途 | Skill |
|---|---|---|
| Alert（警告提示） | 静态警告/信息提示 | `skills/webui/ant-alert/SKILL.md` |
| Drawer（抽屉） | 边缘滑出浮层面板 | `skills/webui/ant-drawer/SKILL.md` |
| Message（全局提示） | 顶部全局操作反馈 | `skills/webui/ant-message/SKILL.md` |
| Modal（对话框） | 模态对话框 | `skills/webui/ant-modal/SKILL.md` |
| Notification（通知） | 右上角通知提醒 | `skills/webui/ant-notification/SKILL.md` |
| Popconfirm（气泡确认） | 操作二次气泡确认 | `skills/webui/ant-popconfirm/SKILL.md` |
| Progress（进度条） | 操作进度展示 | `skills/webui/ant-progress/SKILL.md` |
| Result（结果） | 操作结果页面 | `skills/webui/ant-result/SKILL.md` |
| Skeleton（骨架屏） | 加载中占位图 | `skills/webui/ant-skeleton/SKILL.md` |
| Spin（加载中） | 区块加载状态 | `skills/webui/ant-spin/SKILL.md` |

### 其他（全局配置）
| 组件 | 用途 | Skill |
|---|---|---|
| App（应用包裹器） | 提供全局样式与上下文 | `skills/webui/ant-app/SKILL.md` |
| ConfigProvider（全局配置） | 统一全局参数 | `skills/webui/ant-config-provider/SKILL.md` |
| Watermark（水印） | 区域水印 | `skills/webui/ant-watermark/SKILL.md` |

---

## 高阶组件（ProComponents）

> 来自 `@ant-design/pro-components`，场景驱动，封装了完整的中后台页面模式。
> 安装：`npm install @ant-design/pro-components`

| 组件 | 核心场景 | Skill |
|---|---|---|
| ProLayout | 中后台整体布局框架（侧边导航 + Header + PageContainer） | `skills/webui/ant-pro-layout/SKILL.md` |
| ProTable | 带搜索栏的高级数据表格（含增删改查、批量操作、行内编辑） | `skills/webui/ant-pro-table/SKILL.md` |
| ProForm | 高级表单（含 ModalForm / DrawerForm / StepsForm / 字段联动） | `skills/webui/ant-pro-form/SKILL.md` |
| ProDescriptions | 可编辑详情描述列表（适合详情页、Drawer 内容展示） | `skills/webui/ant-pro-descriptions/SKILL.md` |
| ProList | 高级列表（卡片/列表视图切换、内置搜索、分页、操作按钮） | `skills/webui/ant-pro-list/SKILL.md` |
| ProCard + StatisticCard | 高级卡片与统计看板（分割布局、标签页、KPI 指标卡片） | `skills/webui/ant-pro-card/SKILL.md` |

### 高阶组件选型速查

| 场景 | 推荐组件 |
|---|---|
| 整个应用的外层布局（侧边栏 + 顶栏 + 内容区） | ProLayout |
| 带搜索和分页的数据列表页 | ProTable |
| 新建/编辑数据的表单（弹窗或独立页） | ProForm / ModalForm / DrawerForm |
| 多步骤数据录入向导 | StepsForm（ProForm 子组件） |
| 详情页展示多个字段（可能需要局部编辑） | ProDescriptions |
| 内容列表（文章/项目/卡片等，非纯数据表格） | ProList |
| 数据看板、统计面板、KPI 卡片 | ProCard + StatisticCard |
