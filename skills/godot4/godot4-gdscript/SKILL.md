---
name: godot4-gdscript
description: Godot 4.x GDScript 语法核心、静态类型、信号、lambda、await 协程、@ 注解与跨语言互操作要点
tech_stack: [godot4]
language: [gdscript]
capability: [game-rendering, game-physics, game-input]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# GDScript（Godot 4.x 脚本语言）

> 来源：
> - https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html
> - https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/index.html
> - https://raw.githubusercontent.com/godotengine/godot/master/CHANGELOG.md

## 用途

GDScript 是 Godot 引擎官方内建的高级、面向对象、渐进式类型脚本语言，采用类似 Python 的缩进语法，与引擎节点树、信号、资源系统深度集成。它独立于 Python，专为游戏逻辑热迭代、编辑器工具（`@tool`）与 Node 生命周期钩子而优化。

## 何时使用

- 编写 Godot 场景/节点的行为脚本（`extends Node`、`_ready`、`_process` 等）
- 快速原型、游戏逻辑、UI 交互、状态机
- 编辑器插件、`EditorScript`、`@tool` 脚本
- 不需要极致性能且希望与引擎 API 零摩擦互操作的场合
- 需要与 C#/GDExtension 互操作，但希望主业务用动态脚本时

不适合：CPU 密集型算法（用 GDExtension/C++）、需要强类型大型代码库协作（可考虑 C#）。

## 核心语法速览

### 文件即类 / 继承 / 注册

```gdscript
@icon("res://icon.svg")
class_name Enemy            # 注册为全局可见类名（可选）
extends CharacterBody2D     # 一个文件只能 extends 一个基类
```

### 变量与常量

```gdscript
var a = 5                   # 动态类型
var typed_var: int          # 显式类型
var inferred := "hello"     # 类型推断 :=
const MAX_HP := 100
enum State { IDLE, RUN, DEAD }
enum { UNIT_NEUTRAL, UNIT_ENEMY }   # 匿名枚举，成员直接可用
```

### 函数、默认参数、super

```gdscript
func damage(amount: int, crit: bool = false) -> int:
    return amount * (2 if crit else 1)

func _ready() -> void:
    super()                 # 调用父类同名方法
    super.custom(1, 2)      # 调用父类具名方法
```

### 控制流

```gdscript
match value:
    1, 2, 3: print("small")
    var x when x > 10: print("big ", x)   # 模式守卫 when
    [_, _]: print("2-element array")
    {"type": "hit", ..}: print("dict pattern")
    _: print("default")
```

## 静态类型与类型推断

GDScript 是**渐进式类型**：不写类型完全合法；写了类型编辑器会在编译期给警告/报错并生成更优字节码。

```gdscript
var hp: int = 10
var pos := Vector2.ZERO          # 推断为 Vector2
func add(a: int, b: int) -> int: return a + b

# 强制转换
var n := node as Enemy           # 失败返回 null（引用型）/ 报错（基本型）
if node is Enemy:                # 类型测试
    node.take_damage(10)
```

启用 `Project Settings → Debug → GDScript → Untyped Declaration` 警告可强制全量标注。

## 信号（Signals）

```gdscript
signal died                              # 无参
signal hp_changed(old: int, new: int)    # 带类型形参

func _ready() -> void:
    died.connect(_on_died)               # 4.x 推荐：Callable 直接 connect
    hp_changed.connect(_on_hp, CONNECT_ONE_SHOT)

func _on_died() -> void: queue_free()
func _on_hp(old: int, new: int) -> void: print(old, "->", new)

# 触发
died.emit()
hp_changed.emit(old_hp, new_hp)
```

要点：
- 4.x 用 `signal.connect(callable)`，**不再用** 3.x 的 `connect("signal_name", target, "method")`
- `Callable` 可带绑定参数：`btn.pressed.connect(_clicked.bind(item_id))`
- `disconnect` / `is_connected` 同样接受 `Callable`
- 信号形参可带类型但运行时不强制校验

## Lambda 表达式

```gdscript
var add := func(a, b): return a + b
print(add.call(1, 2))                    # 或 add.call_deferred(...)

# 带名 lambda（递归需要）
var fact := func f(n): return 1 if n <= 1 else n * f.call(n - 1)

# 与信号结合
timer.timeout.connect(func(): print("tick"))
```

注意：lambda 捕获的是**值快照**（非 Python 闭包引用）；在 lambda 内修改外层变量不会同步回外层。

## await 与协程

任何函数体内含 `await` 即为协程；返回值被包装为 awaitable。

```gdscript
func boot() -> void:
    await get_tree().create_timer(1.0).timeout    # 等待信号
    print("1 秒后")
    var reply = await fetch_data()                # 等待另一协程
    print(reply)

func fetch_data() -> String:
    await get_tree().process_frame
    return "done"
```

要点：
- `await x` 里 `x` 可为 `Signal` 或协程调用
- 不能在 `_init` / `_ready` 等返回 `void` 的路径中期望同步完成后续代码
- `await` 后 `self` 可能已被 `queue_free`，访问前做 `is_instance_valid(self)` 检查

## @ 注解（Annotations）

| 注解 | 用途 |
|---|---|
| `@tool` | 脚本在编辑器中也运行（编辑器工具） |
| `@icon("res://x.svg")` | 编辑器中节点的图标 |
| `@export var hp := 10` | 在 Inspector 中显示/编辑属性 |
| `@export_range(0, 100, 1)` | 带范围的导出 |
| `@export_enum("A", "B")` | 枚举式导出 |
| `@export_file("*.json")` | 文件路径选择器 |
| `@export_group("Combat")` | Inspector 分组 |
| `@onready var sprite := $Sprite2D` | 节点进入树后再赋值（等价 `_ready` 中赋值） |
| `@rpc("any_peer", "call_local", "reliable")` | 多人 RPC 方法 |
| `@warning_ignore("unused_variable")` | 本行关闭指定警告 |
| `@static_unload` | 允许脚本静态变量随脚本卸载释放 |

```gdscript
@tool
extends EditorScript

@export var speed := 200.0
@onready var anim: AnimationPlayer = $AnimationPlayer
```

## 类与内部类

```gdscript
class_name Inventory      # 全局注册

class Slot:               # 内部类
    var item: String
    var count := 0

func _init() -> void:
    var s := Slot.new()
    s.item = "potion"
```

构造函数用 `_init(args)`，`new()` 创建实例。继承 `RefCounted`（默认）会自动引用计数释放；继承 `Node` 需加入场景树或手动 `queue_free()`。

## 常用内置类型

- 标量：`int`、`float`、`bool`、`String`、`StringName`（`&"name"`）、`NodePath`（`^"path"`）
- 容器：`Array`、`Dictionary`、`PackedByteArray` 等 Packed 系列
- 向量：`Vector2/2i/3/3i/4/4i`、`Rect2`、`Transform2D/3D`、`Basis`、`Quaternion`、`Color`

类型化集合（4.x）：

```gdscript
var nums: Array[int] = [1, 2, 3]          # 元素类型数组
var refs: Array[Node] = []
```

## 跨语言互操作提示

- **与 C# 互操作**：C# 类同样可通过 `class_name` / `[GlobalClass]` 全局注册。GDScript 侧用 `load("res://Foo.cs").new()` 或直接用 `Foo.new()`（若 C# 侧标注 `[GlobalClass]`）。信号、属性通过引擎反射互通。
- **与 GDExtension (C++)**：注册后的类在 GDScript 中与内置类无感使用；类型名全局可见。
- **动态调用**：`obj.call("method_name", arg)`、`obj.callv("m", [a, b])`、`obj.get("prop")` 用于跨语言反射场景。
- **StringName 更快**：引擎 API 中多用 `StringName` 与 `NodePath`；用 `&"x"` / `^"x"` 字面量避免运行时转换开销。

## 注意事项

- `/` 与 `%` 遵循 C++ 语义：两个 `int` 相除会截断；想要浮点结果，至少一侧转 `float`。
- `**` 是**左结合**（与 Python 相反）：`2 ** 2 ** 3 == (2**2)**3 == 64`。
- 3.x → 4.x 破坏性变更：`tool` 关键字 → `@tool`；`export(int)` → `@export`；`yield` → `await`；信号连接 API 全面改用 `Callable`；`PoolXArray` → `PackedXArray`。
- `@onready` 只在节点进入场景树时一次性赋值；对**脱离场景树**的脚本（`RefCounted`）无意义。
- `await` 后务必检查 `self` 与目标节点仍有效，防止 use-after-free 风格崩溃。
- GDScript 不支持多继承，但可用内部类 + 组合 + 接口式 duck typing 替代。
- 避免在 `_process` 内频繁 `get_node("xxx")`，改用 `@onready` 缓存。
- `preload()` 在解析期加载（路径必须字面量）；`load()` 在运行期加载（路径可动态）。

## 组合提示

- 与 `godot4-signals-callables`、`godot4-resource-and-scene`、`godot4-input-map` 等 skill 搭配覆盖完整游戏脚本工作流
- C# 项目搭配 `godot4-csharp` skill；性能关键路径搭配 `godot4-gdextension` skill
- 编辑器插件场景搭配 `godot4-editor-plugin` skill（`@tool` + `EditorPlugin`）
