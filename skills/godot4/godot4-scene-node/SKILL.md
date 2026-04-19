---
name: godot4-scene-node
description: Godot 4 节点 / 场景 / SceneTree 体系核心概念、生命周期与实例化用法
tech_stack: [godot4]
language: [gdscript, csharp]
capability: [game-rendering, state-management]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 Scene & Node 体系

> 来源：
> - https://docs.godotengine.org/en/stable/getting_started/step_by_step/nodes_and_scenes.html
> - https://docs.godotengine.org/en/stable/tutorials/scripting/scene_tree.html
> - https://docs.godotengine.org/en/stable/tutorials/scripting/nodes_and_scene_instances.html

## 用途
Godot 的一切运行时对象都是 Node；Node 组成树形 Scene，Scene 通过 SceneTree 主循环驱动。这份 skill 汇总节点获取/创建、场景实例化、生命周期回调、SceneTree 操作等最常用的开发动作。

## 何时使用
- 从代码中引用/创建/销毁节点
- 加载并实例化另一个 `.tscn` 场景（子弹、敌人、关卡切换）
- 处理节点生命周期（初始化、逐帧逻辑、物理逻辑、进出树）
- 切换主场景、访问 root viewport、读取/广播 group
- 设置 autoload（单例）与暂停模式

## 基础用法

### 获取节点
```gdscript
@onready var sprite: Sprite2D = $Sprite2D                 # $ 是 get_node 的糖
@onready var anim: AnimationPlayer = $ShieldBar/AnimationPlayer
# 也可写：get_node("Sprite2D") / get_node("/root/Main/Player")
```
```csharp
private Sprite2D _sprite;
public override void _Ready() {
    _sprite = GetNode<Sprite2D>("Sprite2D");
}
```

### 从代码创建节点
```gdscript
var s = Sprite2D.new()
add_child(s)
# 销毁：
s.queue_free()   # 推荐：帧末安全删除
# s.free()       # 立即删除，引用立刻悬空，慎用
```

### 实例化场景
```gdscript
const EnemyScene := preload("res://enemy.tscn")   # 编译期加载（仅 GDScript）
# var EnemyScene = load("res://enemy.tscn")       # 运行期加载

func spawn():
    var enemy := EnemyScene.instantiate()
    add_child(enemy)
```
```csharp
var packed = GD.Load<PackedScene>("res://Enemy.tscn");
var enemy = packed.Instantiate();
AddChild(enemy);
```
`preload`/`load` 得到 `PackedScene`；每次调用 `instantiate()` 产生独立节点树。

### 切换当前场景
```gdscript
get_tree().change_scene_to_file("res://levels/level2.tscn")
# 或：
get_tree().change_scene_to_packed(preload("res://levels/level2.tscn"))
```
两种方式都会阻塞主线程直到新场景就绪；需要加载动画时应手动用 autoload + 后台线程加载。

### SceneTree 常用入口
```gdscript
get_tree()                 # 仅当节点已入树时可用
get_tree().root            # 根 Viewport，等价于 get_node("/root")
get_tree().quit()          # 结束进程
get_tree().paused = true   # 全局暂停
```

## 生命周期（必记顺序）
一次场景进入/退出树按如下顺序发出通知：

1. `_enter_tree()` — **pre-order（父 → 子）**；节点刚挂到树上，尚不保证子节点就绪
2. `_ready()` — **post-order（子 → 父）**；每个节点的所有子节点都 ready 之后才触发它自己，因此父在 `_ready` 里可安全访问所有子
3. 之后每帧：`_process(delta)`（渲染帧）与 `_physics_process(delta)`（固定物理步长）按 **tree order（上→下）** 调用
4. `_exit_tree()` — **bottom-up**（子 → 父）

执行顺序覆盖：在 Inspector 设置 `process_priority`，数值越小越先执行。

## 关键 API 摘要
| API | 作用 |
|-----|------|
| `get_node(path)` / `$path` | 按名称/路径取子节点；支持 `..`、`/root/...` |
| `get_tree()` | 取当前 SceneTree（必须已在树上） |
| `add_child(node)` / `remove_child(node)` | 挂载/卸载子节点 |
| `queue_free()` / `free()` | 延迟 / 立即销毁节点（自动销毁所有后代） |
| `PackedScene.instantiate()` | 从 PackedScene 生成节点树 |
| `preload(path)` / `load(path)` | 编译期/运行期加载资源 |
| `SceneTree.change_scene_to_file(path)` | 切换主场景（阻塞式） |
| `SceneTree.change_scene_to_packed(packed)` | 用已加载的 PackedScene 切场景 |
| `Node.add_to_group(name)` / `is_in_group()` | 组管理 |
| `SceneTree.call_group(group, method, ...)` | 广播调用组内所有节点方法 |
| `SceneTree.get_nodes_in_group(group)` | 取组内节点列表 |
| `SceneTree.paused` | 全局暂停；节点行为由 `Node.process_mode` 决定 |
| `Node.process_mode` | 暂停行为：INHERIT / PAUSABLE / WHEN_PAUSED / ALWAYS / DISABLED |

## Autoload（单例 / 全局脚本）
在 **Project Settings → Autoload** 注册 `.gd` 或 `.tscn`，引擎会在 SceneTree 启动时把它作为 `/root` 的直接子节点挂上，全局以其节点名访问：
```gdscript
GameState.score += 1      # GameState 是 autoload 名
```
Autoload 在任何普通场景之前进入树，适合放：全局状态、事件总线、异步加载器、存档管理。

## 注意事项
- **`_ready()` 之前不要用 `$Child` / `get_node`**：子节点尚未挂到树上。把赋值放在 `_ready()` 或用 `@onready`。
- **`queue_free` vs `free`**：优先 `queue_free`；立刻删除时其他脚本持有的引用会变成已释放对象，访问会崩。
- **`preload` 只在 GDScript 中可用**，C# 请用 `GD.Load<PackedScene>`；`preload` 的路径必须是编译期字面量。
- **`PackedScene.instantiate()` 返回的节点尚未入树**，不会触发 `_ready`，直到 `add_child` 后才触发。
- **`get_tree()` 在节点未入树时返回 null**（例如刚 `new()` 出来、还没 add_child）。
- **`change_scene_to_file` 是异步切换**：调用后当前帧继续执行，下一空闲帧才真正替换。不要在其后立刻假设新场景已就绪。
- **节点名包含空格或特殊字符时**，路径要用引号或重命名；官方推荐使用 PascalCase 节点名。
- **暂停时**默认所有节点冻结；若菜单、UI 需要在暂停时继续运行，设置其 `process_mode = PROCESS_MODE_WHEN_PAUSED` 或 `ALWAYS`。
- **释放父节点**会连带释放整棵子树，无需递归手动清理。

## 组合提示
- 与 **Signals**（`signal`/`connect`）搭配解耦节点通信，替代硬编码 `get_node` 路径。
- 大型场景切换用 **autoload + ResourceLoader.load_threaded_request** 做后台加载 + loading 界面。
- `Group` + `call_group` 适合"广播式"逻辑（所有敌人暂停、所有拾取物销毁）。
- 自定义可复用"组件"：把一组节点存为 `.tscn`，在编辑器里像内置节点一样拖拽实例化。
