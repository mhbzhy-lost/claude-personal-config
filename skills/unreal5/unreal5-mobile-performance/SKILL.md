---
name: unreal5-mobile-performance
description: Unreal Engine 5 移动端性能优化与 Scalability 分级实战指南
tech_stack: [unreal5]
language: [cpp, blueprint, hlsl]
capability: [observability, native-device]
version: "unreal-engine 5 unversioned"
collected_at: 2026-04-19
---

# Unreal Engine 5 移动端性能优化（Mobile Performance）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/optimization-and-development-best-practices-for-mobile-projects-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/performance-guidelines-for-mobile-devices-in-unreal-engine

## 用途
系统化控制 UE5 移动端渲染开销：Scalability 分级、Mobile HDR 开关、纹理/Shader/DrawCall 预算、Android/iOS RHI 差异，使项目在中低端手机稳定跑 30 FPS。

## 何时使用
- 立项选 Lighting Tier（LDR / Basic / Full HDR / Full HDR + Sun Per-pixel）
- 目标设备分档（Galaxy Tab S6 / iPad Air / 低端 Android）需不同 Material Quality
- 帧率或内存不达标，需定位 CPU/GPU/DrawCall/Overdraw 瓶颈
- 决策是否启用 Nanite/Lumen（移动端需显式降级）
- 包体与启动时长优化

## 性能预算（硬指标）
适用于 iPad Air / iPad4 级别设备 @ 30 FPS：

| 指标 | 预算 | 控制台命令 |
|------|------|-----------|
| DrawCall / 单视角 | ≤ 700（中端）/ ≤ 500（低端）/ HMI ≤ 100 | `Stat RHI`, `Stat OpenGLRHI`, `Stat D3D11RHI` |
| 三角形 / 单视角 | ≤ 500k | 同上 |
| Texture Sampler / Material | ≤ 5 | Material Editor Stats |
| 帧 GPU 时间 | 33.3 ms（30 FPS） | `Stat GPU`（部分 Vulkan 设备）/ `Stat Unit` |

设备端控制台：**四指同时点屏幕**（仅 Development 构建可用，Shipping/Test 无）。

## Lighting Tier 选型

| Tier | Mobile HDR | 关键约束 | 适用 |
|------|-----------|---------|------|
| **LDR** | 关 | 颜色 clamp [0,1]，无后处理，Translucent 在 gamma 空间混合；推荐 Shading Model=Unlit | 最低端机、UI、HMI |
| **Basic Lighting** | 开 | Material 必须 Fully Rough；只用 Static Light；可关 Lightmap Directionality 省 | 中端广覆盖 |
| **Full HDR** | 开 | Static Light + Lightmap；可开 Bloom、Normal Curvature to Roughness 抗 spec 锯齿 | 中高端 |
| **Full HDR + Sun Per-pixel** | 开 | 仅 1 盏 Directional Light 设为 Stationary，其他保持 Static | 旗舰机 |

Mobile HDR 开关：`Project Settings > Rendering > Mobile HDR`。

## Scalability 与 Material Quality

**全局 quality 级别**（控制台 `r.MaterialQualityLevel`）：
| 值 | 级别 |
|---|------|
| 0 | Low |
| 1 | High（注意 1≠Medium） |
| 2 | Medium |
| 3 | Epic |

**按设备配置**（Device Profiles）：`Windows > Developer Tools > Device Profiles`，为 `Android_Low` 等 profile 的 Console Variables > Rendering 添加 `r.MaterialQualityLevel=0`。

**Material 内分支**：`Quality Switch` 节点在同一材质内给不同 quality level 写不同实现（低端走廉价路径）。

**编辑器预览**：`Settings > Preview Rendering Level` / `Settings > Material Quality Level` / `Alt+8` 切 Shader Complexity 视图（绿=良好，红=昂贵，白/粉=极贵）。

## 分辨率缩放（Mobile Content Scale Factor）

在 `Config/DefaultDeviceProfiles.ini` 写 `r.MobileContentScaleFactor=<value>`：

**iOS**（关联 Apple scale 系统，按屏幕比自动校正到原生分辨率）：
- `0.0` 原生分辨率
- `1.0` Retina 设备上的非 Retina 分辨率
- `2.0` iPhone 5S / iPad Air 全原生
- `3.0` iPhone 6+ 全原生

**Android**（基于 1280×720 基准，0 表示原生）：
- `0.0` 原生
- `1.0` 1280×720 / 720×1280
- `2.0` 2560×1440 / 1440×2560

## 关键 Rendering Project Settings

修改后必须**重启编辑器**才生效。关闭不用的 permutation 直接省 shader 体积与采样器：

| 设置 | 作用 |
|------|------|
| Mobile HDR | 关=LDR 路径，中低端大幅提速 |
| Disable Vertex Fogging in mobile shaders | 无雾项目必关 |
| Maximum number of CSM cascades | 动态方向光阴影级联数 |
| Mobile Anti-Aliasing Method | MSAA（无则回退默认 AA） |
| Allow Static Lighting | 纯动态光/Unlit 项目关掉省开销 |
| Support Combined Static and CSM Shadowing | 关=释放一个 sampler 并减 permutation |
| Support Movable Directional Light / Spotlights | 无需动态光就全关 |
| Max Movable Point Lights | 0 可省大量 shader permutation |
| Support Pre-baked Distance Field Shadow Maps | 静态 DF 阴影专用 |

## Material Mobile 属性（Main Node > Details > Mobile）

| 属性 | 说明 |
|------|------|
| Float Precision Mode | 默认 mediump；highp 更慢但能解精度错；`Full-Precision for MaterialExpressions Only` 保留 .ush/.usf 中 half 的 mediump |
| Use Lightmap Directionality | 关掉 lightmap 变平但更便宜 |
| Mobile High Quality BRDF | 高质量 BRDF，GPU 成本↑ |
| Use Alpha to Coverage | 需同时开 MSAA |

## DrawCall 削减

1. **合并 mesh**：DCC（Maya/Max/Blender）中合并，减少 unique mesh 数
2. **削 Material ID**：单 mesh 尽量 1 material；Substance Painter 把多 material 合到一张贴图
3. **顶点色遮罩**：用 vertex color 代替多 material 分区（比纹理遮罩更锐利、不依赖分辨率）
4. **ISM / HLOD**（常见实践）：重复物体用 Instanced Static Mesh，远景用 HLOD 合批
5. PIE 与设备 DrawCall 数不同，**必须真机测**

## 纹理与 Shader 规则

- **优先 high-poly + 无 normal map**，而非 8-bit normal（低端机带宽更宽松，normal 有 banding）
- 必须用 normal 时，16-bit normal 未压缩、占 8 倍体积，按需用
- Static Mesh LOD 开 **Use Full Precision UVs** + **Use High Precision Tangent Basis** 减伪影
- 贴图尺寸用 **2 的幂、正方形**（256/512/1024）
- **Independent Texture Fetch**：像素 shader 中 UV 不可运算（缩放等），缩放放 Vertex Shader 的 **CustomizedUVs**，像素端用 `Texture Coordinate` 节点采样
- Translucent / Masked 极贵（Overdraw 能直接翻倍帧时），iOS opaque 每像素只着色一次
- 法线烘焙推荐 xNormal：8K TIFF 4xAA → PS 降 1K → Gaussian 0.35px → 16→8bit → 24-bit TGA

## Precomputed Visibility（强烈推荐）
- 在 **Persistent Level**（非 Sublevel）放 `Precomputed Visibility Volume` 覆盖玩家可达区域并 Build Lighting
- 验证：`Stat Initviews` 的 `Statically Occluded Primitives > 0`
- 可视化：`r.ShowPrecomputedVisibilityCells 1`

## Nanite / Lumen 在移动端
UE5 官方指南对移动端的主推路径仍是 **Static Lighting + Lightmap + Precomputed Visibility**；Nanite/Lumen 的移动端支持受限，主流做法：
- Nanite mesh 为目标平台烘出传统 LOD 链，移动端回退到 LOD
- Lumen 在移动端禁用，改走 Static GI + Reflection Capture
- Post Processing 默认只保留基础 Tone Mapping，Bloom/DOF 等视预算选开；`showflag.PostProcessing 0` 快速估算后处理成本

## Android RHI 选择（Vulkan vs OpenGL ES）
- Vulkan 在部分设备支持 `Stat GPU`，OpenGL ES 普遍不支持
- Adreno 与 Mali 的 precision / tile 行为不同，Mali 对 mediump 更敏感，遇精度问题切 `Float Precision Mode=highp`
- 用 **Bundled PSO Cache** 避免首帧卡顿（Android 专项指南）

## 包体与启动优化

**`DefaultEngine.ini` 推荐**：
```ini
[/Script/Engine.StreamingSettings]
s.PriorityAsyncLoadingExtraTime=275.0
s.LevelStreamingActorsUpdateTimeLimit=250.0
s.PriorityLevelStreamingActorsUpdateExtraTime=250.0

[/Script/UnrealEd.ProjectPackagingSettings]
bCompressed=False
BuildConfiguration=PPBC_Development
bShareMaterialShaderCode=True
bSharedMaterialNativeLibraries=True
bSkipEditorContent=True
```
- ZLib 关闭：包体变大，但启动 pak 加载明显快；开则反之，自行权衡
- 分析工具：**Size Map**（需 AssetManagerEditor 插件，右键 Content 文件夹）、**Window > Statistics**、设备上 `Memreport -full`（产物在 `Game/<App>/<App>/Saved/Profiling/Memreports/`，搜 `Listing all textures`）

## 诊断命令速查

| 命令 | 用途 |
|------|------|
| `Stat Unit` | CPU / 渲染线程 / GPU 各自时长 |
| `Stat UnitGraph` | 时序图找 spike |
| `Stat GPU` | GPU 各阶段耗时（Vulkan 部分支持） |
| `Stat RHI` / `Stat OpenGLRHI` | DrawCall、三角形、RHI 资源 |
| `Stat TextureGroup` | 各纹理池内存 |
| `Stat Initviews` | 可见性剔除效果 |
| `ListTextures` | 纹理内存分布（Previewer 中） |
| `Memreport -full` | 真机完整内存快照 |
| `showflag.PostProcessing 0` | 关后处理估算成本 |

Unreal Insights 远程抓取真机 profile 数据，是启动时长与帧分析的官方首选。

## 组合提示
- 与 `unreal5-rendering`（渲染管线基础）、`unreal5-packaging-android`（PSO Cache / 包体瘦身）搭配
- Material 层优化参见 `unreal5-material`；Lightmap / Static Lighting 参见 `unreal5-lighting`
- 真机调试流程参见 `unreal5-unreal-insights`
