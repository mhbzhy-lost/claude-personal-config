---
name: unreal5-audio
description: UE5 Audio Engine 架构、MetaSound / SoundCue / SoundClass 混音层级与 Audio Modulation 使用要点
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [media-processing]
version: "unreal-engine unversioned"
collected_at: 2026-04-19
---

# UE5 Audio（音频系统）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/audio-in-unreal-engine-5
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/metasounds-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/sound-classes-in-unreal-engine

## 用途
UE5 的音频栈基于 **Audio Mixer**（多平台音频渲染器，UE4.24 起取代旧引擎），向上暴露 MetaSound（DSP 图）、SoundCue（遗留参数图）、SoundClass/SoundMix（静态分组+动态调参）、Audio Modulation（参数总线）、Quartz（采样精度调度）与 Audio Analysis 等子系统，用于构建从简单音效到程序化音乐的完整音频体验。

## 何时使用
- 新项目的所有音源首选 **MetaSound** 作为默认音频对象（SoundCue 的替代）。
- 需要采样精度（sample-accurate）的程序化音频、交互式音乐：MetaSound + Quartz。
- 需要按类别批量调音量/音高/LPF 等：SoundClass + SoundMix（或更现代的 Audio Modulation）。
- 需要运行时让任意来源（蓝图、玩法代码、Mix）驱动任意音频参数：Audio Modulation 参数总线。
- 需要用音频数据驱动 Niagara/蓝图/视觉：Audio Analysis。

## 子系统速览

### MetaSound（推荐的默认音源）
- 本质是一张 **DSP 渲染图**，可做任意复杂的程序化音频与采样精度调度。
- 与 SoundCue 功能对齐，另加：**组合**（MetaSound 套 MetaSound）、模板化、静/动态资产实例化、第三方插件可扩展 API、显著的性能提升。
- 相关工作流：MetaSounds Quick Start、Procedural Music、MetaSound Pages（伸缩播放性能）、**MetaSound Builder API**（通过蓝图程序化构造 MetaSound）、WaveTables（波表合成）。

### SoundCue（遗留）
- 音频参数图，调 Volume/Pitch 等；**不支持采样精度**、无法搭建任意 DSP。
- 工作流偏手工，每个音效往往要单独一个 Cue；新项目应优先 MetaSound。

### SoundClass（分组静态参数）
在 Content Browser 右键 → `Audio > Classes > Sound Class` 创建，双击打开 Details。常用字段：

**General**
- `Volume` / `Pitch`：叠加在 SoundWave 自身设置之上的倍率。
- `Low Pass Filter Frequency`：组内 LPF 截止频率，`>= 20000` 视为不生效。
- `Attenuation Distance Scale`：动态缩放组内衰减距离。
- `Always Play`：阻止被低优先级声音挤出 voice pool。

**Child Classes**：可构树，子类 `Loading` 设为 `Inherited` 时，Pitch/Volume/Loading 行为从父类继承——父子批量联动。

**Passive Sound Mix Modifiers**：类内任意声音播放时自动激活挂载的 SoundMix，无需 `Push Sound Mix Modifier`。可设触发音量阈值（上下限），避免极弱声音误触发。

**Routing**（环绕声）：`LFE Bleed`（默认 0.5）、`Voice Center Channel Volume`（不可继承）、`Center Channel Only`、`Apply Ambient Volume`（受 Audio Volume 的 Interior/Exterior 与 LPF 影响）。

**Submix**：`Default Submix`（None 时走 Project Settings 里的 default）、`Send to Master Reverb Send Amount`、`Default 2D Reverb`。

**Modulation**：装了 Audio Modulation 插件后，可挂 Modulation Settings 数组到整个类。

**Loading**（压缩音频加载策略）：
- `Inherited` → 跟父类。
- `Retain on Load` → 首块常驻缓存，直到显式卸载。
- `Prime on Load` → 加载后常驻但可能被挤出。
- `Load on Demand` → 播放或 prime 时才装载。
- `Force Inline` → 仅走非流式解码路径；**要求对应 SoundWave 的 Loading Behavior Override 也设为 Force Inline**。

**Legacy** 标签页（Audio Mixer 之前遗留）：`Output Target`、`Radio Filter Volume`（仅 Windows/Xbox + XAudio2）、`Output to Master EQ Submix`、`Is UISound`、`Is Music`——新项目一般不动。

### SoundMix（动态调参）
在运行时调制一组音频参数，用于按玩法事件/状态联动。可挂多个实例 + 与 SoundClass 组合，但复杂度高时调试困难。

### Audio Modulation（取代 Class+Mix 的现代方案）
- 核心是**参数总线（Parameter Bus）**：任何东西都能当调制源（蓝图类、Modulation Mix、玩法代码），任何参数都能当目的地；目的地可从总线**本地映射**（曲线/区间）到实际值。
- 意图：解决 SoundClass 参数硬编码、SoundMix 叠加难调的痛点，允许设计师自定义自己的"分组"与"调参"方式。

### Quartz
把采样精度的音频事件调度带到蓝图；用于交互/程序化音乐系统，并把精确时间戳回传蓝图驱动玩法/视觉同步。

### Audio Analysis
实时与离线音频分析，接入 Niagara / 蓝图，做 UX、debug 分析器和玩法/画面驱动。

## 迁移与选型提示
- **新项目默认走 MetaSound + Audio Modulation + Quartz**；SoundCue / SoundClass / SoundMix 主要为兼容老项目而保留。
- 从旧项目迁移时，SoundCue/Class/Mix 在 Audio Mixer 中仍然可用，可以渐进替换。
- SoundClass 的**继承不一致**（哪些字段被子类继承、哪些被覆盖）是常见坑点：`Voice Center Channel Volume` 明确**不继承**；`Volume`/`Pitch`/`Loading` 在子类设为 `Inherited` 时继承。
- `Force Inline` 的 Loading 行为要求 SoundClass 与 SoundWave 两端同时设置才生效。
- LPF 截止频率 ≥ 20000 Hz 相当于关闭 LPF，不是"极其高通"。
- Passive Sound Mix Modifier 的音量阈值用于屏蔽远距离衰减到几乎听不见的声音触发 Mix，务必设置以免意外全局调音。

## 组合提示
- MetaSound（音源） + SoundClass/Submix（路由与分组） + Audio Modulation（动态调参） + Quartz（节拍/时序） + Audio Analysis（分析驱动）构成一套完整现代管线。
- 空间化 / 衰减（Attenuation）通过每个音源资产的 Attenuation Settings 与 SoundClass 的 `Attenuation Distance Scale` 协同；环绕声相关通过 SoundClass `Routing` 段控制。
