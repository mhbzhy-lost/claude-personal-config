---
name: godot4-audio
description: Godot 4 音频系统：AudioStreamPlayer 系列节点、音频总线路由与混音、音效链与跨总线 sidechain
tech_stack: [godot4]
language: [gdscript]
capability: [media-processing]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 Audio（音频系统）

> 来源：
> - https://docs.godotengine.org/en/stable/tutorials/audio/audio_streams.html
> - https://docs.godotengine.org/en/stable/tutorials/audio/audio_buses.html
> - https://docs.godotengine.org/en/stable/tutorials/audio/audio_effects.html

## 用途
在 Godot 4 中播放与混音游戏音频：通过 AudioStreamPlayer 系列节点发声，通过 AudioBus 路由/混音/加效果，通过 AudioServer 在运行时动态控制。

## 何时使用
- UI 音效、背景音乐（BGM）→ `AudioStreamPlayer`（非定位）
- 2D 场景中的位置音源（脚步、爆炸）→ `AudioStreamPlayer2D`
- 3D 场景中的空间音源（含衰减、多普勒、reverb）→ `AudioStreamPlayer3D`
- 需要 Music/SFX/Voice 分组音量控制 → 建立独立音频总线
- 需要混响、压缩、EQ、ducking（音乐自动降低让位语音）→ 在总线上加效果

## 基础用法

### 播放音频

```gdscript
# 场景里放 AudioStreamPlayer 节点，Stream 指向 res://sfx/shoot.ogg
@onready var sfx: AudioStreamPlayer = $ShootSFX

func _on_fire() -> void:
    sfx.bus = "SFX"          # 指定输出到 SFX 总线
    sfx.volume_db = -6.0     # -6dB ≈ 半音量
    sfx.play()
```

### 运行时操作 AudioServer

```gdscript
# 获取/设置总线音量
var idx := AudioServer.get_bus_index("Music")
AudioServer.set_bus_volume_db(idx, -12.0)
AudioServer.set_bus_mute(idx, true)

# 动态加载 bus layout
var layout := load("res://custom_bus_layout.tres")
AudioServer.set_bus_layout(layout)
```

### 典型三层总线布局

```
Master  ← 最终输出，所有音频汇入
 ├─ Music  (send → Master)  加 Reverb / Compressor
 ├─ SFX    (send → Master)  加 HardLimiter
 └─ Voice  (send → Master)  作为 SFX Compressor 的 sidechain 实现 ducking
```

## 关键节点与属性

| 节点 / 属性 | 说明 |
|---|---|
| `AudioStreamPlayer` | 非定位播放，用于 BGM / UI |
| `AudioStreamPlayer2D` | 2D 距离衰减；Area2D（带 Audio Bus）可拦截其音频重路由（如洞穴/水下） |
| `AudioStreamPlayer3D` | 3D 衰减 + 角度 + 可选 Reverb Bus + Doppler Tracking |
| `stream` | 指向 AudioStream 资源（OGG/MP3/WAV） |
| `bus` | 目标总线名，默认 `"Master"` |
| `volume_db` | 音量（dB，0 为最大，-6 约半响度） |
| `playback_type` | `Stream`（流式） / `Sample`（内存采样，**不支持 effects**） / `Default` |
| `play()` / `stop()` / `playing` | 基础控制 |
| `finished` 信号 | 播放结束时触发 |

## 音频导入格式

| 格式 | 用途 | 特性 |
|---|---|---|
| OGG Vorbis (`.ogg`) | BGM、长音频 | 压缩、流式，CPU 解码开销较高但体积小 |
| MP3 (`.mp3`) | BGM | 有专利考量，建议优先 OGG |
| WAV (`.wav`) | 短音效 | 无损，可设 Loop、设置循环点；可选 IMA-ADPCM / QOA 压缩 |

短促高频音效优先 WAV + Sample 播放类型（低开销）；长音乐用 OGG + Stream。

## 音频总线（AudioBus）要点

- **Master 必存在**，所有音频最终流向 Master
- 每条非 Master 总线有一个 **Send** 目标（默认 Master），构成 DAG 路由
- 每条总线可设：`volume_db` / `mute` / `solo` / `bypass`（效果旁通）
- 效果按列表从上到下依次处理
- 默认布局保存在 `res://default_bus_layout.tres`
- 总线空闲时可自动禁用以节省 CPU

## 常用音效（Audio Effects）

| 效果 | 用途 |
|---|---|
| `Amplify` | 简单增益 |
| `Compressor` | 动态范围压缩；**支持 sidechain** 输入另一条总线做 ducking |
| `HardLimiter` | 防削顶（替代已弃用的 `Limiter`） |
| `Reverb` | 混响：room_size / damping / spread / wet |
| `Delay` | 回声延迟（多抽头） |
| `EQ6 / EQ10 / EQ21` | 图形均衡器（编辑器里用这几个，`EQ` 是基类） |
| `LowPassFilter` / `HighPassFilter` / `BandPassFilter` / `NotchFilter` | 基础滤波 |
| `LowShelfFilter` / `HighShelfFilter` | 搁架式增益/衰减 |
| `Distortion` | Clip / ATan / SinBend / Overdrive / Tan / Bit crushing 多种模式 |
| `Chorus` / `Phaser` / `PitchShift` / `StereoEnhance` / `Panner` | 调制/空间类 |
| `Capture` | 抓取总线音频供代码读取（语音、分析） |
| `Record` | 录制总线输出为 `AudioStreamWAV` |
| `SpectrumAnalyzer` | 不处理音频，仅供可视化读取频谱 |

### Sidechain Ducking 示例（音乐让位语音）

1. 新建 `Music` 总线，加 `Compressor`
2. Compressor 的 `Sidechain` 设为 `Voice` 总线
3. 当 Voice 有信号时，Music 自动被压低，语音结束后恢复

## 注意事项

- **Sample 播放类型不支持 effects**——需要混响/EQ 的音源必须用 Stream
- `0 dB` 是上限，继续调高会削顶；用 `HardLimiter` 保险
- `-6 dB ≈ 半感知音量`，调音时按 dB 想而不是按线性比例
- **Web 平台限制**：支持的效果数量受浏览器限制；`AudioStreamPlayer3D` 的 Reverb Bus 有特定行为
- **Doppler Tracking** 在某些平台可能异常，必须在目标硬件实测
- `Limiter` 已弃用，一律用 `HardLimiter`
- `AudioStreamPlayer2D` 路径上若存在带 `Audio Bus` 的 `Area2D`，音频会被改道到该 Area 的总线（设计环境音效很好用，但排错时别忘了这条）
- 更改 bus layout 后记得保存为 `.tres`，否则运行时修改不持久化

## 组合提示

- 与 `AnimationPlayer` 搭配：在动画轨道上触发 `play()`，实现脚步/技能音效同步
- 与 `Area2D` / `Area3D`：角色进入区域时切换 BGM 或启用混响总线
- 与 `AudioEffectCapture` + `AudioStreamGenerator`：实现语音聊天、实时音频处理
- 与 `AudioEffectSpectrumAnalyzer` + `Line2D` / Shader：做频谱可视化
