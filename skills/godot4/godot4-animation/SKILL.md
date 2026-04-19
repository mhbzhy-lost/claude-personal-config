---
name: godot4-animation
description: Godot 4 动画系统（AnimationPlayer、AnimationTree、StateMachine、BlendSpace、RootMotion）的核心用法与控制套路
tech_stack: [godot4]
language: [gdscript]
capability: [game-rendering]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 动画系统（AnimationPlayer & AnimationTree）

> 来源：
> - https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html
> - https://docs.godotengine.org/en/stable/classes/class_animationplayer.html
> - https://docs.godotengine.org/en/stable/classes/class_animationtree.html

## 用途
Godot 用 `AnimationPlayer` 作为所有动画的"数据源"（能对任意节点/资源的任意属性打关键帧），再用 `AnimationTree` 做高级的混合、状态机与根运动；二者搭配覆盖 2D/3D 的全部动画需求。

## 何时使用
- 只需要播放单条动画或通过固定 cross-fade 切换 → 直接用 `AnimationPlayer`。
- 需要混合、分层、状态机、条件跳转、BlendSpace（行走/奔跑/转向）→ 用 `AnimationTree` 驱动 `AnimationPlayer`。
- 需要角色位移由动画本身提供（脚不打滑）→ 用 RootMotion 把根骨骼 transform 取出喂给 `CharacterBody3D.move_and_slide`。
- 需要复用同一套动画资源到多个角色 → 把动画打包成 `AnimationLibrary`，在 `AnimationPlayer` 中挂载。

## 基础用法

### AnimationPlayer：播放/队列/跳转
```gdscript
@onready var ap: AnimationPlayer = $AnimationPlayer

func _ready() -> void:
    ap.play("idle")                         # 播放
    ap.queue("attack")                      # idle 播完自动接 attack
    ap.animation_finished.connect(_on_done) # 注意：此信号定义在父类 AnimationMixer 上
    ap.set_blend_time("idle", "run", 0.2)   # 设置两条动画间的交叉淡化

func _on_done(anim: StringName) -> void:
    if anim == "attack":
        ap.play("idle")

# 跳转与反向
ap.seek(1.5, true)      # 跳到 1.5 秒并立即更新画面
ap.play_backwards("run")
ap.stop(true)           # keep_state=true 保留停止瞬间的属性值，不回 RESET
```

### AnimationTree：最小可运行骨架
```gdscript
@onready var at: AnimationTree = $AnimationTree

func _ready() -> void:
    at.active = true   # 必须激活才会覆盖 AnimationPlayer 的输出
```
Inspector 里设置 `anim_player` 指向目标 `AnimationPlayer`，`tree_root` 设为 `AnimationNodeStateMachine` / `AnimationNodeBlendTree` / `AnimationNodeBlendSpace1D/2D` 之一。

### 用 property path 设置混合参数
所有运行时参数都挂在 `parameters/...` 下，既可 `set()` 也可用 `[]`：
```gdscript
at.set("parameters/eye_blend/blend_amount", 1.0)
at["parameters/eye_blend/blend_amount"] = 1.0
```
Inspector 中悬停参数即可看到完整路径。动画资源是共享的，改这些参数才是每实例独立的正确做法。

### StateMachine 控制（travel / start）
```gdscript
var sm: AnimationNodeStateMachinePlayback = at["parameters/playback"]
sm.start("idle")          # 或在图里连接 Start 节点
sm.travel("attack")       # A* 遍历中间态抵达目标；无路径则瞬移
sm.get_current_node()
```
转场类型：**Immediate / Sync / At End**；属性 `Xfade Time`、`Reset`、`Priority`、`Advance Mode (Disabled/Enabled/Auto)`、`Advance Condition`、`Advance Expression`。
- Advance Condition 只能判真；Advance Expression 支持任意表达式（如 `velocity > 0 && !is_idle`），大小写敏感。
- 使用 Advance Expression 前，必须把 AnimationTree 的 `advance_expression_base_node` 指向持有变量的脚本节点。

### BlendTree 的常用节点
```gdscript
# OneShot：触发一次性动作（攻击、受击）
at["parameters/OneShot/request"] = AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE
at["parameters/OneShot/request"] = AnimationNodeOneShot.ONE_SHOT_REQUEST_ABORT
var active: bool = at["parameters/OneShot/active"]

# Transition：简化版状态机
at["parameters/Transition/transition_request"] = "state_2"

# TimeSeek：跳到指定秒
at["parameters/TimeSeek/seek_request"] = 0.0   # 回到开头
# TimeScale：1.0 正常，0 暂停，负值倒放
at["parameters/TimeScale/scale"] = 0.5
```
`Blend2/Blend3` 支持轨道过滤（filter），可用于上半身/下半身分层。

### BlendSpace1D / 2D
把动画点摆在 1D 线/2D 平面上（2D 会自动 Delaunay 三角化），运行时写 `blend_position` 即可线性插值：
```gdscript
at["parameters/locomotion/blend_position"] = Vector2(velocity.x, velocity.z)
```
Blend 模式：**Interpolated（默认）/ Discrete（逐帧动画）/ Carry（离散但保留播放进度）**。

### RootMotion（3D 角色位移）
在 `AnimationTree` Inspector 里把根骨骼选作 *Root Motion Track*（会取消该骨骼的视觉位移），然后：
```gdscript
func _physics_process(_delta: float) -> void:
    var motion: Vector3 = at.get_root_motion_position()  # 本帧增量（Transform 相对值）
    var rot: Quaternion = at.get_root_motion_rotation()
    velocity = (transform.basis * motion) / _delta
    move_and_slide()
```
同时提供 `get_root_motion_{position,rotation,scale}_accumulator()` 读累计值。场景中可放 `RootMotionView` 辅助节点作为自定义"地板"，仅编辑器可见。

### AnimationLibrary
把多个 `Animation` 打包成 `AnimationLibrary` 资源，可在不同场景/角色间共享；`AnimationPlayer` 里按 `"lib_name/anim_name"` 命名引用，也能动态 `add_animation_library()`。

## 关键 API（摘要）

### AnimationPlayer
- `play(name="", custom_blend=-1, custom_speed=1.0, from_end=false)` — 播放；省略 name 则续播 `assigned_animation`。
- `play_backwards(name, custom_blend=-1)` — 反向。
- `play_section(name, start, end, ...)` / `play_section_with_markers(...)` — 只播一段或到指定 marker。
- `play_with_capture(name, duration, ...)` — 从当前属性值平滑过渡到动画首帧（需 capture track；`playback_auto_capture=true` 时 `play()` 会自动走此路径）。
- `queue(name)` / `clear_queue()` / `get_queue()` / `animation_set_next(from, to)` — 排队播放。
- `pause()` / `stop(keep_state=false)` — `keep_state=true` 保留当前属性，不回 RESET。
- `seek(seconds, update=false, update_only=false)` — 跳转；`update=true` 立即刷新画面。
- `set_blend_time(a, b, sec)` / `get_blend_time` / `playback_default_blend_time` — 配置交叉淡化。
- 属性：`autoplay`、`current_animation`、`current_animation_length/position`、`speed_scale`（负值倒放、0 暂停）。
- 信号：`animation_finished(name)`（继承自 `AnimationMixer`，循环动画不触发）、`animation_changed(old, new)`（仅 queue 切换时发射，`play()` 不发）、`current_animation_changed(name)`。

### AnimationTree
- 属性：`active`、`anim_player`(NodePath)、`tree_root`(AnimationRootNode)、`advance_expression_base_node`。
- `get_root_motion_position/rotation/scale()` 与 `*_accumulator()`。
- 信号：`animation_finished`、`animation_started`。

### AnimationNodeStateMachinePlayback（通过 `parameters/playback` 取得）
- `start(node, reset=true)` / `stop()` / `travel(node, reset=true)` / `get_current_node()` / `get_travel_path()`。

## 注意事项
- **AnimationTree 不持有动画**，播放前必须先把它 `anim_player` 指向有动画的 `AnimationPlayer`，再 `active = true`。
- **资源共享陷阱**：`AnimationNode*` 是 Resource，跨实例共享；运行时请通过 `parameters/...` 修改（每实例独立），不要改节点资源本身。
- **Advance Expression 不在 `parameters/` 里**（属脚本变量），但 Advance Condition 在；调试时别找错位置。
- **确定性混合**：没写的属性轨道按"初始值"参与混合——3D 骨骼用 Bone Rest，其它属性用 0 或 RESET 动画首帧。人形模型建议 **T-pose 导入**，否则旋转 >180° 会被限制。
- **RESET 动画** 仅用于定义默认姿态，不应被 timeline 正常播放。
- `AnimationProcessCallback` / `AnimationMethodCallMode` 已废弃，改用父类 `AnimationMixer.callback_mode_process / callback_mode_method`。
- `animation_finished` 对循环动画不会触发；`animation_changed` 信号只在 `queue()` 衔接时发射，`play()` 或 AnimationTree 切换都不发。
- StateMachine 的 `travel()` 前必须已 `start()` 或已从图的 Start 节点进入，否则调用无效。
- Advance Expression 大小写敏感：GDScript 引擎属性用 `snake_case`（`velocity`、`is_on_floor()`），C# 脚本用 `PascalCase`。
- RootMotion 返回的是"每帧增量"，要除以 `delta` 或直接喂给位移函数；若想要累计值用 `*_accumulator()`。

## 组合提示
- `CharacterBody3D` + `AnimationTree(StateMachine)` + RootMotion 是标准 3D 角色控制套路。
- 2D 逐帧动画用 `BlendSpace2D` + **Discrete/Carry** 模式切换方向。
- 上半身射击 + 下半身行走：`BlendTree` 里用 `Blend2` + **filter** 做轨道分层。
- 技能触发用 `OneShot`（FIRE/ABORT + `active` 读回），比硬切状态机更简单。
- 多角色共享动画库时用 `AnimationLibrary`，角色场景里只放空 `AnimationPlayer` 再 `add_animation_library()`。
