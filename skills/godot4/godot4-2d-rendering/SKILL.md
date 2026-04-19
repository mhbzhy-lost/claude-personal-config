---
name: godot4-2d-rendering
description: Godot 4 的 2D 渲染体系——CanvasItem/变换链/自定义绘制/光影/动画/粒子/视差/TileMap/CanvasItem Shader 一站式指南
tech_stack: [godot4]
language: [gdscript]
capability: [game-rendering]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 2D 渲染（2D Rendering）

> 来源：https://docs.godotengine.org/en/stable/tutorials/2d/ 及 CanvasItem shader 参考（particle_systems_2d、2d_meshes 采用 en/latest 分支内容）

## 用途

Godot 所有 2D 节点（Node2D / Control 及其子类）都继承自 **CanvasItem**，共享同一套渲染管线：Canvas 变换链、modulate/z_index、`_draw()` 自定义绘制、Light2D 光影、CanvasItem Shader。本 skill 汇总 2D 渲染常用节点与 API，覆盖从入门到自定义着色器的典型工作流。

## 何时使用

- 需要在 2D 场景里加光照、阴影或法线贴图
- 写自定义 `_draw()` 或 CanvasItem shader
- 构建 TileMap 关卡、视差背景、精灵动画
- 处理 2D 坐标变换（局部 → 全局 → 画布 → 屏幕）
- 发射 2D 粒子或做 flipbook 动画
- 优化大透明图像的 overdraw（Sprite2D → MeshInstance2D）

## CanvasItem 基础

所有 2D 节点的公共父类。核心属性：

| 属性 | 作用 |
|---|---|
| `modulate` / `self_modulate` | 颜色调制（含子节点 / 仅自身） |
| `z_index` / `z_as_relative` | 同层渲染顺序（-4096..4095） |
| `y_sort_enabled` | 按 Y 坐标动态排序（顶视角 2D 常用） |
| `light_mask` / `visibility_layer` | 光照与剔除位掩码 |
| `texture_filter` / `texture_repeat` | 继承式纹理过滤/重复策略 |
| `material` / `use_parent_material` | Shader 材质 |
| `show_behind_parent` / `top_level` / `clip_children` | 层级/裁剪控制 |

常用信号：`draw`、`visibility_changed`、`item_rect_changed`。

## 变换链（Viewport & Canvas Transforms）

从 CanvasItem 局部坐标到屏幕像素要经过：

```
local → global (CanvasItem) → CanvasLayer → Global Canvas → Stretch/Window → screen
```

把局部坐标换算成屏幕坐标：

```gdscript
var screen_pos = get_viewport().get_screen_transform() \
               * get_global_transform_with_canvas() * local_pos
```

注入自定义输入事件时用同样的变换：

```gdscript
var ie = InputEventMouseButton.new()
ie.button_index = MOUSE_BUTTON_LEFT
ie.position = get_viewport().get_screen_transform() \
            * get_global_transform_with_canvas() * Vector2(10, 20)
Input.parse_input_event(ie)
```

默认所有节点在 Layer 0 的内建 Canvas；用 **CanvasLayer** 节点可独立一层（常用于 HUD）。

## 自定义绘制（`_draw()`）

重写 `_draw()` 调用 `draw_*` 系列函数：

```gdscript
extends Node2D

func _draw():
    draw_circle(Vector2.ZERO, 30, Color.WHITE)
    draw_line(Vector2(1.5, 1), Vector2(1.5, 4), Color.GREEN, 1.0)
    draw_rect(Rect2(10, 10, 50, 50), Color.RED, false)
```

- `_draw()` 只在初次 / 失效时调用，绘制命令会被缓存
- 数据变了要手动 `queue_redraw()` 触发下一帧重绘
- 每帧动画：`_process()` 里 `queue_redraw()`
- 坐标使用 CanvasItem 本地坐标系；用 `draw_set_transform()` 临时改变
- **奇数线宽对齐**：宽度为 1/3/5 的线或 `filled=false` 的矩形，坐标要偏 0.5 像素才能正好落在像素中心

```gdscript
@export var texture: Texture2D:
    set(value):
        texture = value
        queue_redraw()   # 数据变更立即重绘

func _draw():
    draw_texture(texture, Vector2.ZERO)
```

## 2D 光影

默认 2D 场景无光照，需要：

1. 加 **CanvasModulate** 定义环境色（通常偏暗）
2. 加 **PointLight2D** 或 **DirectionalLight2D** 照亮物体
3. 背景用 Sprite2D（Environment 的 Clear Color 不受光照影响）

**PointLight2D** 关键属性：`Texture`（决定形状与范围）、`Offset`、`Texture Scale`、`Height`（0..1，参与法线计算）。

**DirectionalLight2D**：`Height`、`Max Distance`。注意它的阴影始终无限长。

**通用 Light2D**：`Color`、`Energy`、`Blend Mode`（Add/Sub/Mix）、`Range` (Z Min/Max、Layer、Item Cull Mask)。

**阴影**：开 `Shadow > Enabled`，场景里放 **LightOccluder2D**（可从 Sprite2D 菜单自动生成遮挡多边形）。过滤器 `None / PCF5 / PCF13`（越后越柔越贵）。

**法线/高光贴图**：用 **CanvasTexture** 资源包含 Diffuse + Normal Map + Specular，替换原 Texture2D 使用。

**像素艺术光照**：默认光照按视口分辨率计算（会出现平滑光）。用 shader 把 `LIGHT_VERTEX` 量化回纹素：

```glsl
void light() {
    vec2 snapped = floor(LIGHT_VERTEX / 2.0) * 2.0;
    // ... 用 snapped 替代位置
}
```

**廉价替代**：CanvasItemMaterial 的 `Blend Mode = Add` 做发光效果，不产生阴影也忽略法线，但比 Light2D 快。

## 2D Sprite 动画

两种方式：

**AnimatedSprite2D + SpriteFrames**（简单场景）：
```gdscript
$AnimatedSprite2D.play("walk")
$AnimatedSprite2D.stop()
```
- 可从单张图或 Sprite Sheet（指定行列）导入帧
- 在 SpriteFrames 面板里设 Speed FPS

**Sprite2D + AnimationPlayer**（复杂场景）：
- Sprite2D 设 `Hframes` / `Vframes`，AnimationPlayer 对 `frame` 属性打关键帧
- 可在同一动画里同时 tween 位置 / 缩放 / 其它属性

⚠️ **陷阱**：`play()` 在下一帧才生效。需立即更新帧请调用 `advance(0)`。

## 2D 粒子系统

### GPUParticles2D vs CPUParticles2D

| 维度 | GPUParticles2D | CPUParticles2D |
|---|---|---|
| 计算位置 | GPU | CPU |
| 性能 | 大量粒子更快 | 低端/GPU 瓶颈场景更好 |
| 配置方式 | `ParticleProcessMaterial`（+ 可选自定义 shader） | 节点属性直填 |
| 未来维护 | 新特性持续添加 | 不再新增特性，仅接受对齐 PR |
| 互转 | 编辑器菜单 **Convert to CPUParticles2D** | 菜单 **Convert to GPUParticles2D** |

**官方建议优先使用 GPUParticles2D**，除非有明确理由。GPU→CPU 转换可能丢失 GPU-only 特性。

### 配置 ParticleProcessMaterial

新建 GPUParticles2D 后只会看到白点并有 warning，原因是未指定处理材质：
Inspector → `Process Material` → `New ParticleProcessMaterial`。此时粒子应开始向下发射白点。

### Texture 与 flipbook 动画

- **单张 Texture**：在节点 `Texture` 属性直接填
- **Flipbook**（spritesheet 动画帧）：另建 **CanvasItemMaterial** 放到节点 `Material` 槽，勾选 **Particle Animation** 并填 **H Frames / V Frames**。随后 ParticleProcessMaterial（GPU 版）或 CPUParticles2D Inspector 里的 **Animation** 区才会生效。
- ⚠️ Flipbook 背景如果是黑色而非透明，要把 blend mode 改为 **Add**，或在图像编辑器里用 GIMP **Color > Color to Alpha** 抠成透明背景。

### Time 参数

| 参数 | 含义 |
|---|---|
| `Lifetime` | 单粒子存活秒数 |
| `One Shot` | 开启后只发射一轮 |
| `Preprocess` | 场景加载时预跑 N 秒，避免进场才开始冒烟 |
| `Speed Scale` | 整体快慢，默认 1 |
| `Explosiveness` | 0=均匀按 Lifetime/count 间隔发射；1=一次齐发；中间值允许 |
| `Randomness` | 公式：`initial = value + value * randomness` |
| `Fixed FPS` | 渲染帧率（不影响模拟速度）。e.g. 2 → 每秒 2 帧，做像素风 |
| `Fract Delta` | 开启后按帧内小数 delta 精确插值，抖动更少，代价是性能 |

⚠️ **Godot 4.3+ 2D 粒子不支持物理插值**：若抖动，在节点 `Node > Physics Interpolation > Mode` 关掉物理插值。

### Drawing 参数

- `Visibility Rect`：视口外则不渲染。可用工具栏 **Particles > Generate Visibility Rect** 让 Godot 模拟几秒自动测量（最长 25 秒，不够可临时调 `preprocess`）
- `Local Coords`：**关**（默认）= 世界空间发射，节点移动不影响已发射粒子；**开** = 粒子跟随节点移动
- `Draw Order`：`Index`（按发射序，默认）/ `Lifetime`（按剩余寿命）

## 视差（Parallax2D）

Godot 4 推荐 **Parallax2D** 节点（替代旧 ParallaxBackground/Layer）。

- `scroll_scale`：`0` 静止、`1` 跟相机同速、`>1` 比相机快（前景）
- 典型 5 层远→近：`0.0, 0.25, 0.5, 0.75, 1.0`
- `repeat_size` 设为背景图宽/高即可无限滚动
- 子节点纹理必须从 `(0,0)` 开始，不能居中
- `repeat_size` / `region_rect` 不考虑子节点缩放（在 Parallax2D 本地坐标系计算）
- `repeat_times`：额外追加重复副本，用于镜头拉远
- `scroll_offset`：起始位置偏移
- 分屏：克隆视差树到每个 SubViewport，用 `visibility_layer` + `canvas_cull_mask` 隔离

## 2D 网格（MeshInstance2D）

Godot 2D 引擎无法直接渲染 3D mesh（需通过 Viewport + ViewportTexture）。2D mesh 忽略 Z 轴，可由 **SurfaceTool** 代码构造，或导入 OBJ，或从 Sprite2D 转换。

### 优化大透明图像的 overdraw

绘制大尺寸透明图（屏幕级、多层视差背景等）时，Sprite2D 会把整个 quad 含透明区域一起画到屏幕，对移动端 fillrate 压力大。**转成 2D mesh 后只画不透明区域**。

### Sprite2D 转 MeshInstance2D 工作流

1. 准备一张边缘含大面积透明的图，放到 Sprite2D
2. 右键菜单 **Convert to MeshInstance2D**
3. 弹窗预览生成的 2D mesh；按需调 **Growth**（轮廓外扩）/ **Simplification**（简化多边形）
4. 点 **Convert 2D Mesh**，Sprite2D 被替换为 MeshInstance2D

## TileMap（TileMapLayer + TileSet）

Godot 4 用 **TileMapLayer** 节点（不再是旧 TileMap 的多 layer 属性）。TileSet 存为外部资源便于复用。

**多层策略**：前/后景或 Y-sort 要分开时，叠多个 TileMapLayer。单层同位置只能有一个 tile。

**TileMapLayer 属性**：
- Rendering：`Y Sort Origin`、`X Draw Order Reversed`、`Rendering Quadrant Size`
- Physics：`Collision Enabled`、`Use Kinematic Bodies`
- Navigation：`Navigation Enabled`（复杂地图建议改烘焙 NavigationRegion2D；⚠️ 2D 导航网格不能分层堆叠）

**编辑器画笔**：S 选/P 画/L 线/R 矩形/B 桶/I 吸/E 擦。

### 创建 TileSet

1. TileMapLayer 新建 TileSet 资源
2. **先设 Tile Size**（决定切分），再拖入 tilesheet
3. Godot 会按非透明区域自动创建 tile

**Atlas 属性**：`Margins`、`Separation`、`Texture Region Size`、`Use Texture Padding`（强烈建议开，加 1px border 防纹理溢出）。

**Atlas Merging Tool**（三点菜单）可把多张小图合成大图，自动建 tile proxy。

**Scene Collections**：tile 可以是整个场景实例 ⚠️ 开销远高于普通纹理 tile。

**碰撞/导航/遮挡**：先在 TileSet 里新建对应 Physics / Navigation / Occlusion **Layer**，再在 tile 上画多边形。选中 tile 按 **F** 自动生成默认矩形碰撞形状。

## CanvasItem Shader（2D 着色器）

声明：`shader_type canvas_item;`

**Render modes**：`blend_mix`（默认）/`blend_add`/`blend_sub`/`blend_mul`/`blend_premul_alpha`/`blend_disabled`/`unshaded`/`light_only`/`skip_vertex_transform`/`world_vertex_coords`。

三个处理函数：`vertex()` / `fragment()` / `light()`。Godot 4 所有光照都在常规 draw pass 完成，不再为每个光源重绘物体；定义了 `light()` 就完全接管（即使空）。

**关键 built-ins**：

| 阶段 | 变量 | 含义 |
|---|---|---|
| global | `TIME` / `PI` / `TAU` / `E` | 全局常量 |
| vertex | `VERTEX`(inout vec2) | 局部空间顶点，像素坐标 |
| vertex | `MODEL_MATRIX` / `CANVAS_MATRIX` / `SCREEN_MATRIX` | 局部→世界→画布→裁剪 |
| vertex | `UV` / `COLOR` / `TEXTURE_PIXEL_SIZE` | 常用顶点数据 |
| frag | `FRAGCOORD` / `SCREEN_UV` / `SCREEN_PIXEL_SIZE` | 屏幕空间 |
| frag | `TEXTURE` / `UV` / `COLOR`(inout) | 默认纹理+输出色 |
| frag | `NORMAL` / `NORMAL_MAP` / `NORMAL_TEXTURE` | 法线相关 |
| frag | `SHADOW_VERTEX` / `LIGHT_VERTEX` | 修改阴影/光照位置 |
| light | `LIGHT_COLOR` / `LIGHT_ENERGY` / `LIGHT_DIRECTION` / `LIGHT_POSITION` / `LIGHT_IS_DIRECTIONAL` / `LIGHT`(out) | 光照计算 |

粒子实例数据：`INSTANCE_CUSTOM.x` = 旋转弧度、`.y` = 生命周期相位(0..1)、`.z` = 动画帧。

典型采样组合：

```glsl
// 只要纹理、丢掉顶点色
void fragment() { COLOR = texture(TEXTURE, UV); }

// 只要顶点色（需要 varying 从 vertex 传过来）
varying vec4 v_color;
void vertex()   { v_color = COLOR; }
void fragment() { COLOR = v_color; }

// 3D 法线贴图在 2D 用（Godot 自动转换）
void fragment() { NORMAL_MAP = texture(NORMAL_TEXTURE, UV).rgb; }

// 自定义光照（使用法线）
void light() {
    float n = max(0.0, dot(NORMAL, LIGHT_DIRECTION));
    LIGHT = vec4(LIGHT_COLOR.rgb * COLOR.rgb * LIGHT_ENERGY * n, LIGHT_COLOR.a);
}
```

**SDF 函数**（仅在 `fragment()` / `light()` 可用，需 LightOccluder2D 开 SDF Collision）：
`texture_sdf(pos)`、`texture_sdf_normal(pos)`、`sdf_to_screen_uv(pos)`、`screen_uv_to_sdf(uv)`。

## 注意事项

- **`AT_LIGHT_PASS` 在 Godot 4 始终为 false**（保留仅为兼容）
- **`SCREEN_TEXTURE` 已移除**：改用 `uniform sampler2D tex : hint_screen_texture;`
- `_draw()` 不是每帧调用，务必 `queue_redraw()` 触发更新
- 奇数线宽 / 空心矩形要偏 0.5 像素避免模糊
- DirectionalLight2D 的阴影始终无限长
- Environment Clear Color 不参与光照，背景要当做 Sprite2D 画出来
- 2D 导航网格不能堆叠；TileMap 复杂导航改烘焙到 NavigationRegion2D
- AnimationPlayer `play()` 次帧生效，需要立即帧请 `advance(0)`
- Godot 4.3+ 2D 粒子无物理插值，抖动时关掉该节点的物理插值
- Flipbook 黑底纹理记得 blend mode 设 Add 或抠透明背景
- GPUParticles2D 新建时只见白点是正常现象——必须配 ParticleProcessMaterial 才出效果
- Parallax2D 子节点纹理必须从 (0,0) 开始；`repeat_size` 不感知子节点缩放
- 大透明图（屏幕级、视差背景）优先 Sprite2D → MeshInstance2D，省移动端 overdraw

## 组合提示

- **TileMapLayer** + **LightOccluder2D**（通过 TileSet Occlusion Layer）做关卡光影
- **Parallax2D** + **CanvasLayer** 背景层
- **Camera2D** + **Parallax2D**（Parallax2D 自动读相机位移）
- **Sprite2D/Polygon2D** + **CanvasItemMaterial (Blend=Add)** 做廉价发光
- **MeshInstance2D** + **Parallax2D** 降低远景 overdraw
- **CanvasModulate** + **PointLight2D** + **CanvasTexture**（Normal/Specular）= 完整 2D 动态光照
- **GPUParticles2D** + **ParticleProcessMaterial** + **CanvasItemMaterial**（Particle Animation）做 flipbook 特效
