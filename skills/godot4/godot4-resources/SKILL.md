---
name: godot4-resources
description: Godot 4 Resource 系统：自定义 Resource、加载与缓存、引用计数语义、.tres/.res 保存格式与资产导入管线
tech_stack: [godot4]
language: [gdscript]
capability: [local-storage, state-management]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 Resources（资源系统）

> 来源：
> - https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html
> - https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/index.html

## 用途
`Resource` 是 Godot 的数据容器基类：可序列化、可在多个 Node 之间共享、引用计数自动回收。用于把配置 / 数值 / 素材从场景树中抽离成独立数据资产。

## 何时使用
- 需要把角色属性、道具表、关卡参数等**数据**从逻辑代码里抽出来，让策划在 Inspector 里编辑
- 多个 Node/Scene 需要**共享同一份数据**（Resource 默认是引用语义，不是副本）
- 自定义可序列化的资产类型，通过 `.tres`/`.res` 存盘
- 想让美术/音频资源使用统一的导入预设（Import Dock）

不适合放到 Resource 里的：带位置/生命周期的运行时对象（那是 Node 的工作）。

## 基础用法

### 加载与预加载
```gdscript
# 运行期加载（阻塞），路径可动态拼接
var tex = load("res://player.png")

# 脚本解析期加载，编辑器校验路径；路径必须是字面量
var tex2 = preload("res://player.png")

# 场景作为 PackedScene 资源
var scene := load("res://enemy.tscn") as PackedScene
add_child(scene.instantiate())
```

选择规则：**路径是编译期常量就用 `preload`**（编辑器可校验、脚本加载时已就绪）；路径运行时才确定用 `load`。

### 后台/异步加载
大型资源（关卡、角色）使用 `ResourceLoader` 避免主线程卡顿：
```gdscript
ResourceLoader.load_threaded_request("res://big_level.tscn")

# 轮询进度
var progress := []
var status := ResourceLoader.load_threaded_get_status("res://big_level.tscn", progress)
# progress[0] 是 0.0~1.0

if status == ResourceLoader.THREAD_LOAD_LOADED:
    var scene: PackedScene = ResourceLoader.load_threaded_get("res://big_level.tscn")
```

### 自定义 Resource
```gdscript
# bot_stats.gd — 必须独立文件 + class_name 才能在 Inspector 中作为类型使用
extends Resource
class_name BotStats

@export var max_health: int = 100
@export var move_speed: float = 3.0
@export var damage: int = 10
```

使用时作为字段导出：
```gdscript
extends CharacterBody2D
@export var stats: BotStats

func _ready():
    print("HP=", stats.max_health)
```

嵌套集合：
```gdscript
extends Resource
class_name BotStatsTable
@export var entries: Array[BotStats] = []
```

在文件系统面板右键 → New Resource → 选择 `BotStats` 生成 `.tres` 文件，再拖到 Inspector 的 `stats` 字段即可。

## 关键 API（摘要）

| 名称 | 说明 |
|---|---|
| `load(path)` | 运行期加载；结果会被引擎缓存（同路径返回同一实例） |
| `preload(path)` | 脚本解析期加载；路径必须字面量，编辑器校验存在性 |
| `ResourceLoader.load_threaded_request(path)` | 后台线程加载，不阻塞主线程 |
| `ResourceLoader.load_threaded_get_status(path, progress)` | 查询加载状态，`progress` 填充 0~1 |
| `ResourceLoader.load_threaded_get(path)` | 取走已加载完成的资源 |
| `ResourceSaver.save(res, path)` | 保存资源到 `.tres`（文本）或 `.res`（二进制） |
| `Resource.duplicate(subresources := false)` | 显式复制资源（打破引用共享） |
| `resource.unreference()` | 手动减引用，强制释放（仅应急） |
| `@export var x: MyRes` | 让自定义 Resource 可在 Inspector 赋值 |
| `class_name X` (GD) / `[GlobalClass]` (C#) | 注册为编辑器可识别的资源类型 |

## .tres vs .res

| 格式 | 内容 | 适用 |
|---|---|---|
| `.tres` | 文本（类 INI） | **默认首选**：利于 Git diff / 合并 / 手改 |
| `.res` | 二进制 | 体积小、加载快，适合大数据或最终发布产物 |

两者数据等价，可用 `ResourceSaver.save()` 互转。内置 (built-in) 资源则直接嵌在 `.tscn` 里，不能跨场景共享。

## 引用语义（易踩）

- `Resource` 是**引用计数**对象。把同一个 `.tres` 赋值给多个节点，它们共享同一份数据；一处改动所有人可见。
- 需要独立副本必须显式 `stats.duplicate()`；嵌套 Resource 还得 `duplicate(true)` 深拷贝。
- **引擎会缓存** `load()` 结果：同一路径两次 `load` 得到同一实例。想要独立副本用 `duplicate()` 或 `load(path, "", ResourceLoader.CACHE_MODE_IGNORE)`。
- `preload` 是脚本级常量，整个脚本实例共享同一份。
- 循环引用（A 里持有 B，B 里持有 A）会**阻止引用计数回收**，需手动断链或 `unreference()`。
- 不要对 Resource 调 `queue_free()`（那是 Node 的方法）；引用归零自动释放。

## 资产导入管线（Import Dock）

外部素材（png / ogg / ttf / gltf 等）首次进入项目时，Godot 会生成 `.import` 元数据并转换为引擎优化格式，运行时加载的是转换产物而非原始文件。

- **Import 面板**：选中资产 → 修改导入选项（如纹理的 Mipmaps/Filter/Compression、音频的 Loop/Normalize、字体的 Multichannel SDF）→ `Reimport`。
- **预设重用**：在 Import 面板点 `Preset → Save as Default for '<type>'`，后续同类型资产自动套用；可对子目录单独设预设。
- 常见类别的导入配置入口见官方 `assets_pipeline/` 下子章节：Images / Audio samples / Fonts / 3D scenes (glTF/FBX/Blender/Collada) / 2D textures / BitMap / Texture exporting / 3D skeleton retargeting。
- 报错处理：检查 `.import` 目录是否可写、源文件路径无非 ASCII、依赖缺失时重新导入父资源。

## 注意事项

- **自定义 Resource 必须独立文件 + `class_name`**：写成内嵌/内部类时编辑器认不出类型，`@export` 无法正确提示。
- `@export var arr: Array[MyRes]` 的强类型数组依赖 `class_name`，否则只能退化为 `Array`。
- C# 端用 `[GlobalClass]` 注册，等价于 GDScript 的 `class_name`。
- 修改 `.tres` 后记得提交——数据放代码里会让策划每次改都需要程序参与。
- 切勿在 `_ready` 里做大资源同步 `load`，用 `preload` 或 `load_threaded_request`。

## 组合提示
- 搭配 `@tool` 脚本可在编辑器里直接根据 Resource 生成关卡/预览。
- 与 `PackedScene` 配合：把"原型 + 数据"分离——场景负责结构，Resource 负责数值。
- 存档系统常用自定义 Resource + `ResourceSaver.save(..., ".res")` 写入 `user://`。
