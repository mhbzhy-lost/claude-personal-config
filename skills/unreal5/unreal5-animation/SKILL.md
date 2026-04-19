---
name: unreal5-animation
description: Unreal Engine 5 动画系统蒸馏：Animation Blueprint、状态机、Blend Space、Montage、IK/Control Rig、AnimSequence、Notifies、Sequencer 过场
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [game-rendering]
version: "unreal-engine unversioned"
collected_at: 2026-04-19
---

# Unreal 5 动画系统（Animation）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-blueprints-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-sequences-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/how-to-animate-with-sequencer

## 用途
驱动 Skeletal Mesh 的运行时姿态与过场动画：每帧通过 AnimGraph 计算最终 pose，通过 Sequencer 制作影视化过场，通过 Control Rig / IK 做程序化姿态修正。

## 何时使用
- 角色/生物需要播放骨骼动画，并随游戏状态在多个动作间混合切换（走/跑/跳）
- 需要根据速度、方向、瞄准角度做 2D 混合（Blend Space）
- 技能/攻击动作需要与游戏逻辑（音效、伤害判定、粒子）同步（Montage + Notify）
- 脚部贴地、手部抓取等需要运行时反解（Control Rig / FABRIK / Two-Bone IK）
- 过场、电影镜头、场景演出（Sequencer + Level Sequence）

## Animation Blueprint 基础

**创建与绑定**：
1. Content Browser → Add → Animation → Animation Blueprint，选择 Skeleton
2. 打开 Skeletal Mesh Component，设 `Animation Mode = Use Animation Blueprint`、`Anim Class = <你的 ABP>`

**双图结构**：
- **EventGraph**：每帧从 Pawn/Character 拉取数据（速度、方向、是否在地面、瞄准 Yaw 等），写入 ABP 的成员变量。常用入口 `Event Blueprint Update Animation`，配合 `Try Get Pawn Owner` + `Cast To <Character>`。
- **AnimGraph**：基于上面变量计算姿态，输出到 `Output Pose`。核心节点：State Machine、Blend Space Player、Slot、Layered Blend Per Bone、Two-Bone IK、Control Rig。

**最小骨架（伪代码）**：
```
EventGraph:
  Update Animation -> Set Speed = Pawn->Velocity.Size()
                      Set bIsInAir = CharacterMovement->IsFalling()

AnimGraph:
  State Machine (Locomotion) -> Output Pose
```

## 状态机（State Machine）
- 每个 State 内嵌一个子 AnimGraph（通常放 Blend Space 或 Sequence Player）
- **Transition Rule**：两个 State 间的箭头，内部是布尔节点；返回 true 才切换
- 常用 State：Idle/Walk-Run（Blend Space）、Jump Start、Jump Loop、Jump End
- `Time Remaining (ratio)`、`Current State Time` 常用于"动画快播完时自动转移"

## Blend Space
- **1D**：单一输入轴（常用速度）在多个动画间插值；Idle(0) → Walk(150) → Run(600)
- **2D**：两轴（例如 Direction + Speed）做方向性移动
- AnimGraph 里用 `Blend Space Player`，Time/Rate 可由 Sync Group 统一同步，避免脚步错位

## Animation Montage（蒙太奇）
- 把一段 AnimSequence 切成多个 Section（Combo 连招、可分叉段落）
- 通过 Slot 插入 AnimGraph：AnimGraph 中放 `Slot 'DefaultSlot'`，从当前 pose 上层覆盖
- C++/BP 触发：`UAnimInstance::Montage_Play(Montage)`、`Montage_JumpToSection(Name)`、`Montage_Stop(BlendOut)`
- 典型用途：技能攻击、受击、交互动作——播放期间 gameplay 仍能保持下肢移动（通过 Layered Blend Per Bone 只覆盖上半身）

## Notifies（通知）
在 AnimSequence/Montage 时间轴放置事件点：
- **AnimNotify**：一次性事件，如 `PlaySound`、`SpawnEmitter`、自定义 `UAnimNotify` 子类（重写 `Notify()`），在 ABP 中响应 `AnimNotify_<Name>`
- **AnimNotifyState**：有起止范围（Begin/Tick/End），用于"攻击判定窗口"、"无敌帧"

## Curves（曲线）
- 在 AnimSequence 内沿时间轴定义浮点曲线（如 `DisableGravity`、`FootIKWeight`）
- ABP 里用 `Get Curve Value` 读取，驱动 IK 权重、材质参数或游戏逻辑
- 导入时可将 FBX 的自定义属性作为 Curve 导入（见下方 Import Custom Attribute）

## IK / Control Rig
- **Two-Bone IK / FABRIK**：AnimGraph 节点，传入 Effector 世界/组件空间位置，做脚 IK、手 IK
- **Control Rig**：更强的程序化 rig，可在 AnimGraph 通过 `Control Rig` 节点嵌入，做脚贴地、过肩瞄准偏移、弯腰拾取
- **IK Rig + IK Retargeter**：跨骨架动画重定向（不同比例/不同骨骼结构）

## AnimSequence 导入
Content Browser → Import → 选择 FBX，关键选项：

| 选项 | 建议 |
|------|------|
| Import Animation | 导动画时必开 |
| Skeleton | 指定已有 Skeleton 共享动画；留空会新建 |
| Animation Length | `Exported Time` / `Set Range`（配合 Frame Import Range） |
| Default Sample Rate | 关闭以保留原采样率；开启会强制 30fps |
| Custom Sample Rate | 0 = 自动选最佳采样率 |
| Import Custom Attribute | FBX 属性导成 Curve / Animation Attribute |
| Import Bone Tracks | 只要曲线（如面部 morph）时可关 |
| Preserve Local Transform | 保留局部变换 |

**坑**：FBX 结束帧若非整帧会导入失败——在 DCC 里把 End Frame 调成整数，或把 `Animation Length` 改为 `Set Range` 指定整数区间。

**跨骨架共享**：
- 结构相同：在 Skeleton 资产里设 `Compatible Skeletons`
- 同骨架不同比例：Animation Retargeting
- 结构不同：IK Rig Retargeting（IK Retargeter 资产）

## Animation Compression
两类压缩设置资产（Bone / Curve）。

**Bone Compression Settings**：
- `Codecs`：按顺序尝试的编解码器列表（Bitwise Compress Only、Least Destructive、Per Track Compression、Removes Every Second Key、Revolve Linear Keys、Removes Trivial Keys）
- `Error Threshold`：默认 0.1；启用后选误差低于该阈值的最优 codec
- `Force Below Threshold`：强制使用低于阈值的 codec

**Curve Compression Settings**：
- `Codec`：Compressed Rich Curves / Uniform Indexable / Uniformly Sampled
- `Max Curve Error`：Rich Curves 压缩最大误差
- `Use Anim Sequence Sample Rate` + `Error sample rate`（默认 60）

建议：角色主动画用 `Per Track Compression`，次要/远景动画可用更激进 codec 省内存。

## Sequencer 过场动画
**创建 Level Sequence**：主工具栏 Cinematics → Add Level Sequence，保存后自动打开 Sequencer。

**Control Rig 道具/角色动画工作流**：
1. 拖入带 Control Rig 的资产（如示例 `CR_Cardbox`）→ 自动切 Animation Mode，自动加入 Sequence
2. Animation Mode 新增三个面板：Animation Panel、Anim Outliner、Anim Details
3. 选择 Control（Global/Body/Squash-Stretch/Proxy），E 切旋转、W 切位移，`Ctrl + ~` 切 World/Local Space
4. 在 Sequencer 里点 Add Keyframe 打关键帧；移动 Playhead → 改姿态 → 再 Key

**Proxy Controls**：不直接打关键帧，而是动态驱动其他 Control 的值（例如自动切换枢轴到被选中的边/角），避免手工挪枢轴。

**Bake to AnimSequence**：在 Sequencer 中右键 Skeletal Mesh Actor 轨道 → `Bake Animation Sequence`，可把过场动画转存为可复用的 AnimSequence。

**精修关键帧**：
- **Curve Editor**：编辑 Tangent、新增 Key、细调曲线（Sequencer 工具栏图标打开）
- **Tween Tools**（位于 Animation Panel 或 Curve Editor 工具栏）：
  - `Blend Neighbor`：向前/后邻键混合
  - `Push / Pull`：推拉到前后键插值
  - `Blend Ease`：带缓动的混合
  - `Move Relative`：相对前/后键移动
  - `Time Offset`：水平偏移曲线
  - `Smooth / Rough`：平滑/打散相邻键（mocap 去噪常用）
  - `Tween`：在前后键之间插值

## 注意事项
- ABP 的 `Update Animation` 在动画线程上运行（默认并行），**访问游戏线程数据用 `Thread Safe Update Animation` 或 Property Access**，直接 `Cast To Character` 获取复杂逻辑会触发 game-thread 同步
- Blend Space 里所有动画必须共享同一 Skeleton；运动节奏差异大时用 Sync Group + Sync Marker 保证脚步对齐
- Montage 占用的 Slot 必须在 AnimGraph 显式放置 `Slot` 节点，否则不会生效
- AnimNotify 的 `Notify()` 不要依赖 Actor/Pawn 指针——在角色销毁或重启动画时可能为空；优先用 `Notify(USkeletalMeshComponent*, UAnimSequenceBase*)` 新签名
- Sequencer 中导出 AnimSequence 前，确认 Skeletal Mesh Actor 的骨架与目标 AnimSequence 兼容
- Animation Retargeting 跨比例角色时，根骨骼缩放/平移选 Animation Scaled 或 Animation，避免滑步
- FBX 动画导入若未勾 `Import Animation`，只会导入骨骼不导动画

## 组合提示
- Gameplay 层：`UCharacterMovementComponent` 提供速度/方向 → ABP EventGraph 读取 → 驱动 Blend Space/State Machine
- 技能系统（GAS）：Ability 触发 Montage，Montage Notify 触发伤害判定 / GameplayEvent
- 脚步音效：AnimNotify `PlaySound` + 物理材质
- 过场演出：Level Sequence + Sequencer 事件轨道（触发 BP 函数）+ Control Rig + Bake to AnimSequence
- 重定向管线：IK Rig（源/目标）→ IK Retargeter → 批量导出新 AnimSequence
