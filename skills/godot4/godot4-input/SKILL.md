---
name: godot4-input
description: Godot 4 输入系统全景 —— InputEvent 体系、Input/InputMap 单例、事件传播顺序、键鼠触屏手柄实战
tech_stack: [godot4]
language: [gdscript, csharp]
capability: [game-input]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 Input（输入系统）

> 来源：https://docs.godotengine.org/en/stable/tutorials/inputs/

## 用途

Godot 4 的输入系统统一抽象键盘、鼠标、触屏、手柄、MIDI、手势等物理输入为 `InputEvent` 对象，并通过 `InputMap`（动作映射）+ `Input` 单例（状态查询/反馈）+ 节点回调（事件处理）三件套覆盖从事件到轮询的全部场景。

## 何时使用

- 角色移动、跳跃、攻击等游戏逻辑的输入绑定
- 需要在 PC / 主机 / 移动端共用一套逻辑（通过 action 抽象）
- 支持手柄（包含死区、震动、多设备）
- 多点触控、手势、拖拽交互
- 自定义光标、鼠标模式（捕获/限制）、窗口关闭确认

## 两种处理范式：事件 vs 轮询

```gdscript
# 一次性事件（跳跃、确认）→ 用 _input / _unhandled_input
func _input(event):
    if event.is_action_pressed("jump"):
        jump()

# 持续状态（移动）→ 用 Input 单例轮询
func _physics_process(delta):
    if Input.is_action_pressed("move_right"):
        position.x += speed * delta
```

## 节点回调与事件传播顺序（Viewport 8 步）

事件由 DisplayServer → root Window → Viewport，然后按顺序分发（任一步调用 `Viewport.set_input_as_handled()` 或 `Control.accept_event()` 即停止传播）：

1. 嵌入 Window 的窗口管理（拖动/缩放）
2. 嵌入 Window 聚焦时直接送给该 Window
3. **`Node._input(event)`** —— 所有重写节点都会收到，早于 GUI
4. **`Control._gui_input(event)`** —— 仅 Control 节点，受 `mouse_filter` 影响；发出 `gui_input` 信号
5. **`Node._shortcut_input(event)`** —— 仅 `InputEventKey` / `InputEventShortcut` / `InputEventJoypadButton`
6. **`Node._unhandled_key_input(event)`** —— 仅 `InputEventKey`
7. **`Node._unhandled_input(event)`** —— GUI 未处理时的游戏玩法事件首选入口
8. Object Picking（2D/3D 的 `CollisionObject._input_event`）

节点遍历采用**反向深度优先**（叶子 → 根）。Control 的 GUI 鼠标事件只冒泡到目标 Control 的直系祖先；GUI 键盘/手柄事件不冒泡。SubViewport 不会自动收到父 Viewport 的事件，需用 SubViewportContainer 或手动转发。

> 经验：普通玩法逻辑用 `_unhandled_input`（避免穿透 UI）；全局快捷键用 `_shortcut_input`；覆写 UI 拦截用 `_input`。

## InputEvent 子类型速查

| 子类 | 用途/关键字段 |
|------|---------------|
| InputEventKey | `keycode` / `physical_keycode` / `unicode` / 修饰键 |
| InputEventMouseButton | `button_index`（MOUSE_BUTTON_LEFT…）、`double_click`、`position` |
| InputEventMouseMotion | `position` / `relative` / `velocity` / `screen_relative` |
| InputEventJoypadMotion | `axis`、`axis_value` |
| InputEventJoypadButton | `button_index`、`pressure`、`pressed` |
| InputEventScreenTouch | `index`（手指）、`position`、`pressed`、`double_tap`、`canceled` |
| InputEventScreenDrag | `index`、`position`、`relative`、`velocity` |
| InputEventMagnifyGesture / PanGesture | `position`、`factor` / `delta` |
| InputEventAction | 由代码合成的动作事件（手势识别等） |
| InputEventShortcut / InputEventMIDI | 快捷键 / MIDI |

访问子类专属字段前务必先 `if event is InputEventXxx`，否则会报错。

## Input 单例常用 API

**动作查询（推荐基于 InputMap）**：
```gdscript
Input.is_action_pressed("jump")                 # 持续按住
Input.is_action_just_pressed("jump")            # 仅按下那一帧
Input.is_action_just_released("jump")
Input.get_action_strength("accelerate")         # 0.0~1.0，模拟输入
Input.get_axis("move_left", "move_right")       # -1.0~1.0
Input.get_vector("move_left","move_right","move_forward","move_back", deadzone)  # 圆形死区，推荐
```

**底层状态**：
```gdscript
Input.is_key_pressed(KEY_SPACE)
Input.is_physical_key_pressed(KEY_W)            # 不受键盘布局影响
Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
Input.get_mouse_button_mask()
Input.is_joy_button_pressed(device, JOY_BUTTON_A)
Input.get_joy_axis(device, JOY_AXIS_LEFT_X)
Input.get_connected_joypads()                   # Array[int]
```

**鼠标/光标**：
```gdscript
Input.mouse_mode = Input.MOUSE_MODE_CAPTURED    # VISIBLE/HIDDEN/CAPTURED/CONFINED/CONFINED_HIDDEN
Input.warp_mouse(Vector2(100, 100))
Input.set_custom_mouse_cursor(tex, Input.CURSOR_ARROW, Vector2.ZERO)
# 图片必须 ≤ 256×256（推荐 ≤ 128×128），Web 上限 128×128
```

**震动（手柄/手持设备）**：
```gdscript
Input.start_joy_vibration(device, weak, strong, duration)
Input.stop_joy_vibration(device)
Input.vibrate_handheld(500, -1.0)               # Android 需 VIBRATE 权限
```

**反馈与合成**：
```gdscript
Input.action_press("ui_left", 1.0)              # 程序触发动作
Input.action_release("ui_left")
Input.parse_input_event(ev)                     # 向引擎注入自制 InputEvent
Input.add_joy_mapping(sdl_mapping, true)        # 运行时加载 SDL 映射
```

信号：`joy_connection_changed(device, connected)`。

## InputMap 单例（运行时改键）

```gdscript
InputMap.add_action("dash", 0.2)                # 第二参为 deadzone
var ev := InputEventKey.new()
ev.keycode = KEY_SHIFT
InputMap.action_add_event("dash", ev)

InputMap.action_erase_events("dash")            # 清空绑定
InputMap.action_set_deadzone("dash", 0.3)
InputMap.get_actions()                          # Array[StringName]
InputMap.load_from_project_settings()           # 恢复到 project.godot 定义
```

> 编辑器脚本/EditorPlugin 里读到的是编辑器自身的 action；要访问项目 action 请改读 `ProjectSettings.get_setting("input/...")`。

## 坐标系

- 输入事件原点在**窗口左上**，y 向下。
- `event.position` 是 **Viewport 坐标**；受相机/缩放影响的世界坐标需自行换算。
- `get_viewport().get_visible_rect().size` → 视口像素尺寸。
- `get_viewport().get_mouse_position()` → 当前鼠标 Viewport 坐标。
- `MOUSE_MODE_CAPTURED` 下 `event.position` 无意义，改用 `event.relative` 或 `event.screen_relative`（后者考虑了缩放/多屏）。

## 键盘 + 修饰键

```gdscript
func _input(event):
    if event is InputEventKey and event.pressed:
        if event.keycode == KEY_T:
            print("Shift+T" if event.shift_pressed else "T")
```

`InputEventWithModifiers` 提供 `shift_pressed` / `ctrl_pressed` / `alt_pressed` / `meta_pressed`。

> Keyboard ghosting：廉价键盘同按多键可能丢事件，默认键位应规避此问题。

## 鼠标拖拽完整示例

```gdscript
extends Node2D
var dragging := false
const CLICK_RADIUS := 32

func _input(event):
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if (event.position - $Sprite2D.position).length() < CLICK_RADIUS:
            if not dragging and event.pressed:
                dragging = true
        if dragging and not event.pressed:
            dragging = false
    elif event is InputEventMouseMotion and dragging:
        $Sprite2D.position = event.position
```

C# 版本同理：`@event is InputEventMouseButton mouseEvent && mouseEvent.ButtonIndex == MouseButton.Left`。

## 触屏与手势

- `InputEventScreenTouch`：`index`（多指）、`position`、`pressed`、`double_tap`、`canceled`。
- `InputEventScreenDrag`：含 `relative` 和 `velocity`。
- `InputEventMagnifyGesture` / `InputEventPanGesture` 继承自 `InputEventGesture`（`position` 在 `_gui_input` 中相对该 Control）。
- 桌面调试：Project Settings → Input Devices/Pointing 开启 **Emulate Touch From Mouse**。
- 反向联动：`Input.emulate_mouse_from_touch` / `Input.emulate_touch_from_mouse`。

## 手柄（Godot 4.5+ 基于 SDL 3）

**三种模拟量读取方式**：
- 双轴摇杆 / WASD → `Input.get_vector()`（圆形死区，推荐）
- 单轴双向（油门、转向）→ `Input.get_axis()`
- 扳机或单向强度 → `Input.get_action_strength()`

**关键差异**：
- **死区**：手柄摇杆即使不碰也会漂移（如 0.062），Godot 默认 action deadzone = 0.5；`get_vector()` 第 5 参可覆盖。
- **无 echo 事件**：长按手柄 D-pad 不会像键盘那样重复触发，需自己用 Timer + `Input.parse_input_event()` 合成。
- **窗口焦点**：手柄事件会送到**所有**窗口包括未聚焦的。需要忽略失焦时创建 `Focus` autoload：

```gdscript
# Focus.gd
extends Node
var focused := true
func _notification(what):
    if what == NOTIFICATION_APPLICATION_FOCUS_OUT: focused = false
    elif what == NOTIFICATION_APPLICATION_FOCUS_IN: focused = true
func input_is_action_pressed(action): return focused and Input.is_action_pressed(action)
```

- **省电抑制**：键鼠会抑制系统休眠，手柄不会。Godot 默认开启 `Display > Window > Energy Saving > Keep Screen On`。
- **Windows XInput 限制**：最多同时 4 个手柄。
- **自定义映射**：`SDL_GAMECONTROLLERCONFIG` 环境变量，或 `Input.add_joy_mapping()` 在 `_ready()` 里尽早注入；SDL 映射不适用于 Android/iOS/Web（这些平台仍用 Godot 自研代码）。
- **鼠标+手柄共用某 action**（如第一人称视角）仍需分开代码路径。

## 退出请求（Quit）

```gdscript
# 默认 NOTIFICATION_WM_CLOSE_REQUEST 会触发 SceneTree.quit()
# 关闭自动行为：
get_tree().set_auto_accept_quit(false)

func _notification(what):
    if what == NOTIFICATION_WM_CLOSE_REQUEST:
        # 让所有节点都收到通知以保存
        get_tree().root.propagate_notification(NOTIFICATION_WM_CLOSE_REQUEST)
        get_tree().quit()
```

- 移动端**不发送** `WM_CLOSE_REQUEST`：
  - iOS 发 `NOTIFICATION_APPLICATION_PAUSED`，约 5 秒后 OS 强杀
  - Android 发 `NOTIFICATION_WM_GO_BACK_REQUEST`（返回键）

## 注意事项

- `_input` 会收到全部事件（含 GUI）；游戏玩法优先选 `_unhandled_input` 以尊重 UI 拦截。
- 访问特定字段前必须先 `is InputEventXxx`。
- `is_action_just_pressed()` 只在按下后**一帧**为 true，别用它做持续判断。
- `get_vector()` 的圆形死区优于手写 `Vector2(axis_x, axis_y).limit_length(1.0)`（后者是方形死区）。
- 4.5 之前桌面端用 Godot 自研控制器代码，不同版本行为可能不一致；升级后应重测映射。
- 震动应提供游戏内开关/强度条，照顾敏感玩家。
- 自定义光标最大 256×256（Web 128×128）。
- InputMap 改动不会自动持久化，改键功能需自己写入 `user://` 配置。

## 组合提示

- **角色控制器**：`Input.get_vector()` + `CharacterBody2D/3D` 的 `move_and_slide()`
- **UI 快捷键**：`_shortcut_input` + `Shortcut` 资源
- **改键 UI**：运行时监听下一个 `InputEvent` → `InputMap.action_erase_events` + `action_add_event`，最后写入 `user://` 配置
- **手势识别**：自定义手势 → `InputEventAction` → `Input.parse_input_event()`
- **多点触控游戏**：按 `index` 字段区分每根手指，配合 SubViewportContainer 处理子视口事件
