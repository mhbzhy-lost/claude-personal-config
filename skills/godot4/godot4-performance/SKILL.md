---
name: godot4-performance
description: Godot 4 性能优化要点 —— 测量先行、Profiler 使用、drawcall/LOD/纹理/脚本层优化与移动端带宽规避
tech_stack: [godot4]
language: [gdscript]
capability: [observability]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 性能优化（Performance）

> 来源：https://docs.godotengine.org/en/stable/tutorials/performance/

## 用途
在 Godot 4 项目中定位并消除性能瓶颈：度量先行，按 CPU / GPU / 带宽分层处理，避免盲目微优化。

## 何时使用
- 帧率低于目标（60 FPS = 16.67 ms / 30 FPS = 33.33 ms / 120 FPS = 8.33 ms 预算）
- 掉帧、卡顿、移动端发热严重
- 需要在低端硬件 / 移动端上线前做一次性能体检
- 大量 drawcall、纹理或节点带来的 CPU/GPU/显存压力

## 基础用法：三步测量循环

```gdscript
# 1. 手工测 CPU 热点
var start := Time.get_ticks_usec()
_expensive_work()
var elapsed_ms := (Time.get_ticks_usec() - start) / 1000.0
print("Elapsed: ", elapsed_ms, " ms")
```

编辑器内测量：
- **Debugger → Profiler**：CPU 每函数耗时 + 每帧调用次数，区分 script vs native。
- **Debugger → Visual Profiler（Rendering 标签）**：GPU 各阶段耗时。
- 先用 Profiler 找相对热点，再用假设测试（禁用模块看是否变快）和二分法定位。
- **必须在目标硬件上 profile**，开发机结果不可直接推断移动端。

## 监控运行时性能（Performance 单例）

Godot 提供全局 `Performance` 单例读取各类计数器，适合自绘 HUD / 上报：

```gdscript
# 常用监视项（Performance.Monitor 枚举）
func _process(_dt: float) -> void:
    var fps        := Performance.get_monitor(Performance.TIME_FPS)
    var frame_ms   := Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
    var draw_calls := Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
    var obj_in_fr  := Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
    var prim       := Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
    var vmem       := Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)
    var mem_static := Performance.get_monitor(Performance.MEMORY_STATIC)
```

经验阈值（移动端尤其敏感）：
- `draw_calls` 控制在几百以内；过高优先合批 / MultiMesh / 图集。
- `RENDER_VIDEO_MEM_USED` 关注显存水位，纹理压缩收益最大。

## 关键优化手段（按收益顺序）

### 1. 减 drawcall（GPU/CPU 提交都受益）
- **MultiMeshInstance3D**：同一 Mesh 批量实例（植被、砖块、粒子群）。
- **纹理图集 / 合并材质**：相同材质的物体才能被引擎合批。
- **Occlusion culling / Visibility ranges (HLOD) / Mesh LOD**：不画 = 最快。
- **Batching**（2D）：共享材质 + 少变更 Z 层。

### 2. 纹理压缩（显存 + 带宽）
- 导入设置里开启 **VRAM Compression**，不要用 Lossless 作为运行时格式。
- 桌面 / 主机：**BPTC**（高质量，含法线贴图 RGTC 变体）。
- 移动端 / WebGL：**ETC2**（Android / iOS 全覆盖，`Project Settings → Rendering → Textures → VRAM Compression → Import ETC2 ASTC`）。
- UI / 像素艺术：保持无损 + 关闭 mipmap，避免模糊与额外带宽。

### 3. Mesh LOD & 可见性
- 导入网格时启用 Auto LOD；对大场景手动配置 `visibility_range_begin/end` 做 HLOD。
- 开启 Occlusion Culling：放置 OccluderInstance3D 或烘焙室内遮挡体。

### 4. 移动端 overdraw / 带宽规避
- 调试视图 **View → Overdraw**：半透明堆叠区域越亮越糟。
- 尽量避免大面积 alpha blend（粒子、UI 全屏特效）；改用 alpha scissor / alpha hash。
- 降低渲染分辨率：`Project Settings → Rendering → Viewport → Scaling 3D Scale`（FSR/Bilinear）。
- 关闭移动端不需要的 Glow / SSAO / SSR / Volumetric Fog。
- Forward Mobile 后端优先用于移动设备。

### 5. 脚本层（CPU 热路径）
- `_process(delta)` **只做必须每帧的事**；非实时逻辑用 `Timer` 或每 N 帧执行：

```gdscript
var _tick := 0
func _process(_dt):
    _tick += 1
    if _tick % 6 == 0:        # 每 6 帧一次
        _update_ai()
```

- 定频模拟（AI、物理相关）放 `_physics_process`（固定步长，默认 60 Hz）。
- 用 `process_mode` / `set_process(false)` 关掉不活跃节点。
- 避免每帧 `new` 对象：用对象池、预分配数组；`PackedXxxArray` 比 `Array` 更紧凑。
- 避免每帧 `get_node("...")` 字符串查找：`@onready var x := $Path` 缓存。
- 循环中避免 `signal connect/disconnect`、`add_child/remove_child`。
- GDScript 热路径若仍不够，迁 C#（显著更快）或 GDExtension（原生）。

### 6. 内存与资源
- 大资源 `preload` 换 `load` 并及时 `queue_free()` / 清引用，让 `RefCounted` 释放。
- 监控 `MEMORY_STATIC`、`RENDER_VIDEO_MEM_USED` 水位，防止显存抖动。
- 关闭不用的 mipmap / anisotropic；纹理尺寸取 2 的幂。

## 注意事项
- **先测量再优化**：Knuth 原则，97% 的微优化是负收益，破坏可维护性。
- Profiler 本身有开销，读相对值而非绝对值。
- 判清 **CPU-bound vs GPU-bound**：CPU 慢就减脚本 / drawcall，GPU 慢就减像素 / 后处理 / 纹理。
- "Smoke and mirrors"（LOD、culling、烘焙、动画假物理）通常比硬优化收益更大。
- 不要在编辑器开着其他重进程时 profile；务必在目标硬件上复测。

## 组合提示
- **godot4-rendering**（如有）：Forward+ / Forward Mobile / Compatibility 后端选择与后处理裁剪。
- **godot4-threads**：`WorkerThreadPool`、Thread-safe API 用于把重计算挪出主线程。
- **godot4-gdextension / godot4-csharp**：GDScript 热路径的原生化方案。
- **godot4-import**：纹理 / 网格导入预设（VRAM 压缩、LOD、法线压缩）。
