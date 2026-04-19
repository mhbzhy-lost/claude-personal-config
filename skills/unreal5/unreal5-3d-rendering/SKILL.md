---
name: unreal5-3d-rendering
description: UE5 次世代渲染三件套 Nanite / Lumen / VSM 的启用、适用边界与移动端降级策略
tech_stack: [unreal5]
language: [cpp, blueprint, hlsl]
capability: [game-rendering]
version: "unreal-engine 5.x"
collected_at: 2026-04-19
---

# UE5 Nanite / Lumen / Virtual Shadow Maps 渲染管线

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine

## 用途

UE5 默认动态渲染管线的三大支柱：Nanite 做虚拟化几何（自动 LOD + 簇化剔除）、Lumen 做全动态 GI 与反射、Virtual Shadow Maps 做高分辨率动态阴影。目标是让美术直接导入电影级资产、取消手工 LOD/烘焙步骤，并在次世代主机 / 高端 PC 上达到 60 FPS。

## 何时使用

- 次世代主机（PS5 / Xbox Series S|X）或高端 PC（RTX 2000+ / RX 6000+）项目
- 依赖高面数美术资产（ZBrush sculpt、photogrammetry 扫描）
- 需要全动态日夜循环、可破坏/可构建场景，不希望烘焙 lightmap
- 希望取消手工 LOD，由引擎按屏幕像素自适应几何密度
- **不适用**：移动端/Switch/Quest、VR、Forward Shading、需要 MSAA 的项目

## 基础用法

### 启用 Nanite

```
# 单资产导入时：Build Nanite 勾选（若不用 Lightmass，建议关闭 Generate Lightmap UVs）
# 批量：Content Browser 选中 → 右键 Nanite > Enable
# 单个：Static Mesh Editor → Details > Nanite Settings > Enable Nanite Support
```

支持组件：Static / Skeletal / Instanced Static / Spline / HISM / GeometryCollection / Foliage / Landscape Grass。

### 启用 Lumen（新项目默认开启；UE4 升级项目需手动）

```
Project Settings > Engine > Rendering
  Dynamic Global Illumination Method = Lumen
  Reflection Method                  = Lumen
  Generate Mesh Distance Fields      = On  (Software RT 必须)
```

启用硬件光追（获得三角形级反射、skinned mesh 支持）：

```
Support Hardware Ray Tracing          = On
Use Hardware Ray Tracing when available = On
Ray Lighting Mode = Hit Lighting for Reflections   # 需最高画质时
```

避免同时驻留 SDF 与 HWRT 内存，可在 `DefaultEngine.ini`：

```
[SystemSettings]
r.DistanceFields.SupportEvenIfHardwareRayTracingSupported=0
```

## 关键设置摘要

### Nanite 适配判断

| 适合启用 Nanite | 不适合启用 |
|---|---|
| 三角形很多或屏幕占比很小 | 天空球（大面积、单实例、不遮挡） |
| 场景内大量实例 | Translucent / 需要 MSAA 的材质 |
| 作为主要遮挡体 | 依赖 Morph Target 变形的 mesh |
| 使用 VSM 投影阴影 | Forward Rendering / VR / Split Screen |

Nanite 硬限制：场景实例数上限 **16M**；材质仅支持 Opaque / Masked；不支持 MSAA、Lighting Channels、Forward、VR、传统 Ray Tracing（实验性 `r.RayTracing.Nanite.Mode 1`）；不存每顶点切线（像素着色器隐式推导）；不支持 Mesh Decals；WPO 支持但受限；Wireframe 不支持。

### Lumen Software vs Hardware Ray Tracing

| 维度 | Software RT（SDF） | Hardware RT（三角形） |
|---|---|---|
| 硬件要求 | SM6 + `Generate Mesh Distance Fields` | RTX-2000+/RX-6000+，PS5/XSX |
| 几何类型 | 仅 Static / ISM / HISM / Landscape；foliage 需勾 `Affect Distance Field Lighting` | 额外支持 Skeletal / skinned |
| 材质 | **不支持 WPO**；材质覆盖 BlendMode 不同会失配 | 可 Hit Lighting 评估完整材质 |
| 最大范围 | 200 m（可调至 800 m，`Lumen Scene View Distance`） | Far Field 默认 1 km（`r.LumenScene.FarField=1` + World Partition HLOD1） |
| 开销 | 低，适合大量重叠实例 | 100k+ 实例场景 scene update 显著 |
| 反射质量 | Surface Cache 近似 | 可 mirror 质量 |
| Tracing Mode | `Detail Tracing`（默认，逐 mesh SDF）/ `Global Tracing`（仅 Global SDF，最快） | — |

### Post Process Volume 常调参数

- `Lumen Scene Detail`：小物件在反射/GI 中消失时上调
- `Lumen Scene View Distance`：>200m 处天光/GI 失效时上调
- `Max Trace Distance`：大型洞穴漏光时上调
- `Final Gather Quality` / `Quality (Reflections)`：降噪但吃 GPU
- `Final Gather Lighting Update Speed`：全局光变化（如关太阳）传播太慢时上调
- `Max Reflection Bounces`：默认 1，需多次反射时上调（需 HWRT + Hit Lighting）
- `Skylight Leaking` / `Diffuse Color Boost`：非物理美术旋钮，室内避免死黑

## Virtual Shadow Maps（VSM）

VSM 为 Nanite 设计的高分辨率虚拟化阴影贴图：每光源一张 16k×16k 虚拟页表，仅驻留可见页。Nanite mesh 应使用 VSM 投影阴影（不用 CSM）。启用 Nanite 是 VSM 性能的前置条件——非 Nanite 高面数 mesh 会让 VSM 的 cache invalidation 成本暴涨。

## 移动端适配（关键）

**Nanite 在移动端完全不可用**。构建移动端版本必须：

1. **保留传统 LOD 链**：美术为所有 mesh 手工烘焙 LOD0~LODn；Nanite mesh 可设置 Fallback Mesh（Static Mesh Editor > Nanite Settings > Fallback Relative Error / Fallback Triangle Percent）作为回退，移动端会自动走 fallback 路径。
2. **关闭 Nanite on 组件/材质**：针对移动端资产变体关闭 Build Nanite。
3. **材质 shading model**：避免 Clear Coat、Two-Sided Foliage 的高开销路径。
4. **阴影**：VSM 不在移动端启用，走传统 CSM / Stationary 灯光 + lightmap。

**Lumen 移动端**：UE 5.x 起支持 Android Vulkan + Mobile Renderer，但需遵守：

- 仅 **Software Ray Tracing**（SDF），绝不开硬件光追
- `Software Ray Tracing Mode = Global Tracing` 以降低成本
- 降采样 Final Gather 分辨率（通过 scalability group 或 `r.Lumen.*` CVar）
- `Lumen Scene View Distance` 压到 100m 以内
- 关闭 `High Quality Translucency Reflections`、`Screen Traces` 按需
- 场景规模必须小，灯光 mobility 非 Static（Static 灯在 Lumen 下被忽略）
- 无法启用时优雅降级到 **SSGI + SSR + lightmap**（Static Lighting）

建议通过 `DefaultDeviceProfiles.ini` / scalability 分桌面 vs 移动端两套配置。

## 工作流陷阱

- **模块化几何**：Lumen Software RT 要求墙/地/天花板拆分建模；整房打包或整栋多层楼 mesh 的 SDF 表达极差。
- **墙厚 ≥ 10 cm**：更薄会漏光。
- **导入小再放大的 mesh**：SDF 分辨率按导入尺度分配，放大后精度不足 → 用 Build Settings 的 `Distance Field Resolution Scale` 纠正。
- **Surface Cache Cards 默认 12 张**：复杂内饰 mesh 的反射/GI 显粉色缺失，上调 `Max Lumen Mesh Cards` 或拆分 mesh。
- **Foliage / ISM 的 Surface Cache 仅在启用 Nanite 时支持**。
- **Static 灯光 + Lumen 互斥**：启用 Lumen 后 lightmap 被隐藏；`Lumen Reflections` 可单独配合 baked lighting 使用，但要求 HWRT。
- **UE4 升级项目**：Lumen 不会自动开启，需手动切。
- **Nanite 导入耗时**：大项目强烈建议配置共享 DDC。
- **灯光传播延迟**：局部变化即时，全局（如关太阳）可能要数秒——对过场 cinematic 需预热。

## 可视化与诊断

- View Modes：`Lumen Scene` / `Surface Cache`（粉色 = 未覆盖）/ `Reflection View` / `Geometry Normals`
- `r.Lumen.Visualize.CardPlacement 1`：查看 Card 分布
- `r.DistanceFields.LogAtlasStats 1`：输出 SDF 统计
- Nanite Visualization 菜单：clusters / overdraw / triangles

## 组合提示

- **Nanite + Lumen + VSM** 三件套几乎必须一起用：Lumen 的 Surface Cache 依赖 Nanite multi-view rasterization 做快速重建；VSM 依赖 Nanite 的稳定性能。
- **World Partition + HLOD1** 是 Lumen Far Field 的前置。
- **Temporal Super Resolution (TSR)** 是 Lumen Epic 档位（1080p 内部 → 近 4K）的配套上采样方案。
- 移动端用 **Static Lighting + SSR + SSGI + CSM + 传统 LOD**，彻底绕开本技能栈的三大系统。
