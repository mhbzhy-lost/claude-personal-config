---
name: godot4-2d-physics
description: Godot 4 二维物理体系（Area2D / StaticBody2D / RigidBody2D / CharacterBody2D）、碰撞层掩码、move_and_slide、射线检测与信号使用指南
tech_stack: [godot4]
language: [gdscript]
capability: [game-physics]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 · 2D 物理体系

> 来源：https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html

## 用途
在 Godot 4 中组合使用 `CollisionObject2D` 的四种衍生节点来完成 2D 碰撞检测与响应：触发区域、静态地形、完整刚体模拟以及由代码驱动的角色体。

## 何时使用
- 需要检测"进入/离开/重叠"事件但不产生物理响应 → `Area2D`
- 不动的环境（墙、平台、传送带） → `StaticBody2D`
- 需要引擎自动模拟重力/碰撞/反弹（掉落木块、车辆、弹珠） → `RigidBody2D`
- 玩家角色、敌人、由代码精细控制移动与跳跃 → `CharacterBody2D`
- 需要精确视线/命中判定 → `RayCast2D`

## 基础用法

### 四种碰撞对象选型
| 节点 | 受引擎推动 | 参与碰撞 | 典型用途 |
|------|------------|----------|----------|
| `Area2D` | 否 | 仅检测 | 触发器、伤害区、重力区 |
| `StaticBody2D` | 否 | 是 | 地面、墙、平台 |
| `RigidBody2D` | 是（力驱动） | 是 | 物理模拟物体 |
| `CharacterBody2D` | 否（代码驱动） | 是 | 角色、NPC |

每个物体必须挂至少一个 `CollisionShape2D` 或 `CollisionPolygon2D` 作为子节点。

### CharacterBody2D + move_and_slide（最常用角色控制模板）
```gdscript
extends CharacterBody2D

var run_speed = 350
var jump_speed = -1000
var gravity = 2500

func _physics_process(delta):
    velocity.y += gravity * delta        # gravity 是加速度，需乘 delta
    if Input.is_action_pressed("ui_right"): velocity.x = run_speed
    elif Input.is_action_pressed("ui_left"): velocity.x = -run_speed
    else: velocity.x = 0
    if is_on_floor() and Input.is_action_just_pressed("ui_select"):
        velocity.y = jump_speed
    move_and_slide()                     # 不要乘 delta！内部已含时间步
```

### RigidBody2D + 力驱动
```gdscript
extends RigidBody2D

func _integrate_forces(state):           # 刚体修改请用 _integrate_forces，不要直接改 position / linear_velocity
    if Input.is_action_pressed("ui_up"):
        state.apply_force(Vector2(0, -250).rotated(rotation))
    state.apply_torque(20000 * sign_of_rotation_input)
```

### Area2D 信号检测
```gdscript
# 编辑器中连接 body_entered(body) / body_exited(body) / area_entered(area)
func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group("player"):
        body.take_damage()
```

### 碰撞层 / 掩码
- `collision_layer`：我**在**哪些层里（别人扫这些层才能发现我）
- `collision_mask`：我**扫描**哪些层（只和这些层上的对象产生碰撞）
- 32 位 bitmask，层名可在 Project Settings > Layer Names > 2D Physics 配置

```gdscript
# 编程启用 layer 1, 3, 4
collider.set_collision_mask_value(1, true)
collider.set_collision_mask_value(3, true)
collider.set_collision_mask_value(4, true)

# 或直接位运算
collider.collision_mask = (1 << 0) | (1 << 2) | (1 << 3)   # layer 号从 1 起但位从 0 起

@export_flags_2d_physics var my_layers   # 编辑器友好 GUI
```

### RayCast2D 射线检测
```gdscript
# 场景树中挂 RayCast2D 子节点，设置 target_position（局部坐标）
@onready var ray: RayCast2D = $RayCast2D

func _physics_process(_d):
    if ray.is_colliding():
        var hit = ray.get_collider()
        var point = ray.get_collision_point()
        var normal = ray.get_collision_normal()
```
配置 `collision_mask` 控制射线扫描哪些层；`enabled = true` 才生效。

## 关键 API（摘要）

**CharacterBody2D**
- `velocity: Vector2` — 内置速度属性，被 `move_and_slide` 读写
- `move_and_slide()` — 按 `velocity` 移动并沿碰撞面滑动，**不要乘 delta**
- `move_and_collide(motion: Vector2)` — 移动一次，返回 `KinematicCollision2D` 或 null
- `is_on_floor() / is_on_wall() / is_on_ceiling()` — slide 后查询

**RigidBody2D**
- `_integrate_forces(state: PhysicsDirectBodyState2D)` — 安全修改物理态的回调
- `apply_force / apply_impulse / apply_torque / apply_torque_impulse`
- `mass / gravity_scale / linear_damp / angular_damp / freeze / can_sleep`
- `contact_monitor = true` + `max_contacts_reported > 0` 才会发 `body_entered` 信号

**Area2D**
- 信号：`body_entered(body)`、`body_exited(body)`、`area_entered(area)`、`area_exited(area)`
- `gravity / gravity_space_override / linear_damp` 可覆盖区域内物理

**PhysicsBody2D（基类）**
- `test_move(from, motion)` — 试探移动是否会碰撞
- `add_collision_exception_with(body)` / `get_collision_exceptions()`

**KinematicCollision2D**
- `get_position() / get_normal() / get_collider() / get_remainder()`

## 注意事项

- **不要缩放 CollisionShape2D**：保持 `scale = (1,1)`，改大小用 `Shape2D.size`/`radius` 或 handle，scale 会导致未定义行为
- **物理代码必须在 `_physics_process`**：60Hz 定频，和渲染帧率解耦
- `move_and_slide()` 内部已应用 delta，`velocity` 直接是「每秒像素数」；但 `gravity` 作为加速度仍要 `velocity.y += gravity * delta`
- RigidBody2D **禁止**直接赋值 `position` / `linear_velocity`，会破坏引擎积分；必须在 `_integrate_forces` 中改
- RigidBody2D **默认休眠**以省性能，休眠时不会调用 `_integrate_forces`；如需保活设 `can_sleep = false`
- 层号从 **1** 开始（UI/Inspector 语义），但位移从 **0** 开始：`1 << (layer - 1)`
- Area2D 默认也会接收鼠标/触摸事件，若只做物理检测可关 `input_pickable`

## 组合提示
- `CharacterBody2D` + `RayCast2D`：常用于角色脚底检测（`is_on_floor` 边界情况）、墙抓检测、AI 视线
- `Area2D` + `Tween`：区域触发剧情/相机切换
- `RigidBody2D` + `Area2D(gravity_space_override)`：水下/反重力区
- `StaticBody2D(constant_linear_velocity)`：传送带效果，不动但推动接触物
- **Jolt 物理**：Godot 4.6 起 `Jolt Physics` 作为官方 3D 备选后端（参见 *Using Jolt physics* 教程）；**Jolt 目前仅作用于 3D**，2D 继续使用 Godot Physics 2D（GodotPhysics2D），本 skill 中的 2D API 与行为不受 Jolt 切换影响
