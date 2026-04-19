---
name: godot4-ui-control
description: Godot 4 Control 节点 UI 体系：锚点布局、容器、Theme 皮肤、字体、焦点导航与自定义控件
tech_stack: [godot4]
language: [gdscript]
capability: [ui-layout, ui-display]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 Control UI 体系

> 来源：https://docs.godotengine.org/en/stable/tutorials/ui/index.html（及 size_and_anchors / gui_containers / gui_skinning / custom_gui_controls / gui_using_theme_editor / gui_using_fonts / gui_navigation / class_control / control_node_gallery 子页面）

## 用途
Godot 所有 GUI 都基于 `Control` 节点树构建。本 skill 覆盖构建一套可响应分辨率、可换肤、支持键鼠/手柄导航的界面所需的全部核心概念：布局（锚点 + 容器）、样式（Theme + StyleBox + Font）、交互（输入 + 焦点）、自定义控件。

## 何时使用
- 搭建游戏主菜单、设置面板、HUD、对话框等 UI
- 需要自适应多分辨率、多宽高比的界面布局
- 需要统一风格/换肤的控件视觉
- 需要键盘或手柄完整可玩的 UI（主机、无障碍）
- 需要继承 `Control` 自绘自定义控件

## 控件分类（Control Gallery）
**内容型**：Button、Label、LineEdit、TextEdit、RichTextLabel、CheckBox、OptionButton、SpinBox、ProgressBar、Slider、ColorPicker、TextureRect 等。
**布局型**：HBoxContainer、VBoxContainer、GridContainer、MarginContainer、CenterContainer、ScrollContainer、TabContainer、H/VSplitContainer、PanelContainer、AspectRatioContainer、H/VFlowContainer、SubViewportContainer、FoldableContainer。

Demo 参考：`godotengine/godot-demo-projects/gui/control_gallery`。

## 布局：Size 与 Anchors

### 核心概念
每个 Control 有 `position`（相对父节点）与 `size`。四条边（left/right/top/bottom）各有：
- **anchor**：0.0=父起点、0.5=父中心、1.0=父终点
- **offset**：从该 anchor 位置的像素偏移

最终边位置 = `parent.size * anchor + offset`。

### 常用 preset（编辑器工具栏 Layout 按钮）
- `Top Left`、`Center`、`Full Rect`（占满父节点，常用于全屏 UI 根节点）
- `HCenter Wide` / `VCenter Wide`、四角 / 四边停靠
- 使用 preset 会**同时设置 anchor 和 offset**，不要只改一个

### 居中一个固定尺寸控件
1. 四个 anchor 都设 `0.5`
2. offset：left/top = -size/2，right/bottom = +size/2
（或直接用 preset `Center`）

### 代码 API
```gdscript
control.set_anchors_preset(Control.PRESET_FULL_RECT)
control.set_anchor_and_offset(SIDE_LEFT, 0.5, -50)
control.grow_horizontal = Control.GROW_DIRECTION_BOTH
```

## 容器（Container）

> 容器**接管子 Control 的 position/size**；手动改被接管子节点的 position/size 无效，要通过 size flags 控制。

### 子节点 Size Flags（Inspector > Layout > Container Sizing）
- **Fill**：填满分配空间
- **Expand**：与其他 Expand 节点按 `stretch_ratio` 分配剩余空间（常与 Fill 一起用）
- **Shrink Begin/Center/End**：按最小尺寸收缩，三种对齐
- **Stretch Ratio**：多个 Expand 之间的相对权重

### 内置容器速查

| 容器 | 用途 |
|------|------|
| HBoxContainer / VBoxContainer | 水平/垂直排列 |
| GridContainer | 固定列数网格（`columns` 属性） |
| MarginContainer | 外边距（通过 Theme constants `margin_left/top/right/bottom` 设置） |
| CenterContainer | 子节点按最小尺寸居中 |
| PanelContainer | 背后绘制 StyleBox，常用作卡片/面板 |
| ScrollContainer | 内容超出时出滚动条 |
| TabContainer | 每个子节点一个 tab |
| H/VSplitContainer | 两子节点 + 可拖分隔 |
| AspectRatioContainer | 锁定宽高比（fill / width-controls-height / height-controls-width / cover） |
| H/VFlowContainer | 溢出时换行/换列 |
| SubViewportContainer | 把 SubViewport 作为控件使用 |
| FoldableContainer | 可折叠 |

### 自定义容器
```gdscript
extends Container

func _notification(what):
    if what == NOTIFICATION_SORT_CHILDREN:
        for child in get_children():
            if child is Control:
                fit_child_in_rect(child, Rect2(Vector2.ZERO, size))

# 任何影响布局的参数变化后调用：
# queue_sort()
```

## Theme 与 GUI Skinning

### Theme 资源结构
Theme 按 **theme type**（通常等于控件类名，如 `Button`、`Label`）组织，每类型下 6 种条目：
- **Color**（如 `font_color`）
- **Constant**（整数，如间距）
- **Font**、**Font Size**
- **Icon**（Texture2D）
- **StyleBox**（`normal` / `hover` / `pressed` / `disabled` / `focus` 等；**`focus` 作为叠加层**绘制在其他 StyleBox 之上）

### 查找顺序（从高到低优先级）
1. 该节点 Inspector 里的 **Theme Overrides**（本地覆盖）
2. 祖先链上最近一个带 `theme` 属性的节点
3. Project Settings > GUI > Theme > Custom
4. Godot 内置默认 Theme

### 类型继承与变体
- 子类自动继承父类的 theme 条目（如 `Button` 自动能用 `Control` 条目）
- **Type Variation**：在 Theme 中把 `Header` 标记为 `Label` 的变体 → `Header` 未定义的条目回退到 `Label`；节点上设 `theme_type_variation = "Header"` 启用
- 自定义 type 脚本访问：`get_theme_color("font_color", "MyType")`

### Theme 编辑器（底部面板）
- 选中 Theme 资源时打开；左侧预览（Default Preview 或自定义场景 tab + Picker 拾取），右侧编辑
- **Override 单项** / **Override All** 快捷加覆盖；Manage Items 对话框批量管理（Remove Class/Custom/All、Import 自其他 Theme）
- **StyleBox pin**：同时编辑多个 StyleBox（如 normal + hover + pressed）时钉住，改动同步
- 默认 fallback Font **只能在 Inspector 中改**，Theme 编辑器不支持

## 字体（Fonts）

### 设置位置
- Theme 编辑器（对整个 Theme 生效）
- Control 节点 Inspector > Theme Overrides > Fonts（仅此节点）
- Theme 资源的 **Default Font**（兜底，仅 Inspector 可设）
- 未设时默认 **Open Sans SemiBold**

### Font Size（Godot 4 变化）
Godot 4 起 font size **存在节点上**（作为 Theme Override），不在 Font 资源里。按节点调大小：`Inspector > Theme Overrides > Font Sizes`。

### 支持格式
- 动态字体：TTF / OTF / WOFF / WOFF2（拖入 FileSystem 即可）
- 位图字体：BMFont `.fnt`；或 Image Font（配置 Character Ranges / Columns / Rows / Image Margin / Character Margin / space advance / X/Y offset / Kerning Pairs）

### 像素字体（Godot 4 陷阱）
Godot 4 的 texture filter 在 **节点/视口** 上，不在字体纹理上。像素字体要：
1. 承载控件（或全局）的 texture filter 设为 **Nearest**
2. 使用字号为字体原始尺寸的**整数倍**
3. 视口/窗口缩放也用整数倍

### 描边与阴影
- **Outline**：Theme 中设 `font_outline_color` + `outline_size`；MSDF 字体的 `Pixel Range` 至少 2× outline size
- **Shadow**：**仅 Label 和 RichTextLabel** 支持；设 `font_shadow_color` + `shadow_offset_x/y`

## 焦点与键盘/手柄导航

### 内置 UI action（勿挪作游戏操作）
`ui_up` / `ui_down` / `ui_left` / `ui_right` / `ui_focus_next` / `ui_focus_prev` / `ui_accept` / `ui_cancel`

### Focus Mode（Inspector > Control > Focus Mode）
- **All**：鼠标、键盘、手柄均可获得焦点
- **Click**：仅鼠标点击
- **None**：不可获焦
- 默认：`Label = None`，`Button = All`

### Focus Neighbor
手动配置方向与 tab 顺序（默认 Godot 按几何位置推导，复杂布局下常需手动覆盖）：
- `focus_neighbor_top/bottom/left/right`：各方向 NodePath
- `focus_next` / `focus_previous`：tab 顺序

### 初始焦点（必须显式设置）
```gdscript
func _ready():
    $StartButton.grab_focus.call_deferred()
```
`call_deferred` 保证场景完全就绪后再抓焦点。

## 自定义 Control（`_draw` + `_gui_input`）

> 官方自定义控件页在 Godot 4.6 标为 Work in Progress，以下 API 经 Control class 与邻页交叉验证可用。

```gdscript
extends Control

func _get_minimum_size() -> Vector2:
    return Vector2(30, 30)
    # 或在 _ready 里 set_custom_minimum_size(Vector2(30, 30))

func _draw() -> void:
    draw_rect(Rect2(Vector2.ZERO, size), Color.DARK_SLATE_GRAY)
    if has_focus():
        draw_rect(Rect2(Vector2.ZERO, size), Color.YELLOW, false, 2.0)

func _gui_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed:
        accept_event()
        queue_redraw()
```

`_gui_input` 仅在以下情形触发：鼠标位于控件上方 / 鼠标在控件上按下后移动 / 控件持有焦点（键盘事件）。

### 常用 Notification
| Notification | 触发 |
|---|---|
| `NOTIFICATION_MOUSE_ENTER` / `_EXIT` | 鼠标进入/离开 |
| `NOTIFICATION_FOCUS_ENTER` / `_EXIT` | 获得/失去焦点 |
| `NOTIFICATION_THEME_CHANGED` | Theme 变化（重建缓存的 StyleBox 等） |
| `NOTIFICATION_VISIBILITY_CHANGED` | 显隐切换 |
| `NOTIFICATION_RESIZED` | 尺寸变化（重新排版自绘内容） |

## Control 类关键成员速查
**属性**：`anchor_left/top/right/bottom`、`offset_*`、`size`、`position`、`custom_minimum_size`、`size_flags_horizontal/vertical`、`stretch_ratio`、`mouse_filter`（Stop/Pass/Ignore）、`focus_mode`、`focus_neighbor_*`、`theme`、`theme_type_variation`、`tooltip_text`、`clip_contents`、`grow_horizontal/vertical`。

**信号**：`focus_entered`、`focus_exited`、`gui_input(event)`、`mouse_entered`、`mouse_exited`、`resized`、`minimum_size_changed`、`size_flags_changed`。

**方法**：`grab_focus()` / `release_focus()` / `has_focus()`、`grab_click_focus()`、`set_anchor_and_offset()`、`set_anchors_preset()`、`get_combined_minimum_size()`、`accept_event()`、`warp_mouse()`、`find_next_valid_focus()`、`get_drag_data()` / `set_drag_preview()` / `is_drag_successful()`。

## 注意事项

- **Mouse Filter**：容器/装饰节点挡住了子控件点击？把它们的 `mouse_filter` 设为 `Pass` 或 `Ignore`。按钮等需要点击则保持 `Stop`。
- **最顶层 UI 根**：全屏 HUD/菜单习惯设 `Control.PRESET_FULL_RECT`，否则子节点位置算出来可能为 0。
- **Godot 4 Font size 迁移**：从 Godot 3 升级时，字号不再跟 Font 资源走，全部要改到节点/Theme override。
- **UI action 复用**：`ui_up` 等切勿用于玩家移动，否则会与 UI 焦点切换冲突；游戏逻辑自定义 action。
- **初始焦点必须手动 `grab_focus()`**，否则手柄/键盘玩家开场无反应。
- **容器内不要手动改子节点 position/size**，会被下一次 sort 覆盖；用 size flags + custom_minimum_size。
- **Theme 改动引发重排**：自定义控件缓存了 StyleBox 时务必监听 `NOTIFICATION_THEME_CHANGED`。
- **自定义 Container 必须在影响布局的属性变更后调用 `queue_sort()`**。
- **custom_gui_controls 官方页标为 WIP**：API 稳定但示例可能滞后，以 Control class 参考为准。

## 组合提示
- **响应式全屏 UI 骨架**：根 Control（FULL_RECT）→ MarginContainer → VBoxContainer/HBoxContainer → 业务控件
- **卡片/面板视觉**：`PanelContainer`（StyleBox 背景）→ `MarginContainer`（内边距）→ 内容容器
- **设置菜单**：`TabContainer` + 每页 `VBoxContainer` + `GridContainer(columns=2)` 做「标签 + 控件」行
- **主机 UI**：所有可交互项 `focus_mode = All`，显式配 `focus_neighbor_*`，`_ready` 里 `grab_focus.call_deferred()`
- **统一风格**：Project Settings > GUI > Theme 挂全局 Theme；局部变体用 `theme_type_variation`
- **本地化/多字号**：Theme override Font Sizes，不要改 Font 资源本身
