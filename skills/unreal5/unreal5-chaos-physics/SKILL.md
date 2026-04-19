---
name: unreal5-chaos-physics
description: UE5 默认物理引擎 Chaos 的刚体模拟、碰撞查询、物理材质、破坏系统（几何体集合/聚类/锚点）与物理力场核心用法
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [game-physics]
version: "unreal-engine 5"
collected_at: 2026-04-19
---

# Chaos Physics（UE5 物理系统）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/physics-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-destruction-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-fields-user-guide-in-unreal-engine

## 用途
Chaos 是 UE5 内置的高性能物理与破坏模拟系统，替代旧版 PhysX，统一处理刚体、碰撞、布料、载具、破坏、力场、流体、毛发、软体等物理模拟。

## 何时使用
- 场景中的刚体动力学、碰撞响应、物理约束（门、绳、箱体堆叠等）
- 需要通过 LineTrace / Sweep / Overlap 做射线/胶囊/几何体查询（武器检测、AI 感知、拾取）
- 需要实时破坏效果（墙体/建筑坍塌、易碎物）
- 需要对局部空间施加力、速度、锚定、睡眠等物理行为（爆炸冲击、引力井、悬浮锚点）
- 角色 Ragdoll、物理动画、Cloth、Vehicles 等子系统均基于 Chaos

## 基础用法

### 1. 刚体模拟（Primitive Component）

Blueprint / Details 面板：选中 StaticMeshComponent → Physics 面板 → 勾选 **Simulate Physics**；配合 **Mass in Kg**、**Linear/Angular Damping**、**Enable Gravity**。

C++：
```cpp
UStaticMeshComponent* Mesh = GetStaticMeshComponent();
Mesh->SetSimulatePhysics(true);
Mesh->SetMassOverrideInKg(NAME_None, 50.f);
Mesh->SetLinearDamping(0.1f);
Mesh->AddImpulse(FVector(0, 0, 50000.f));          // 瞬时冲量
Mesh->AddForce(FVector(0, 0, 9800.f));             // 每帧施力（需持续调用）
Mesh->AddRadialImpulse(Loc, 500.f, 2000.f, RIF_Linear, true); // 爆炸
```

### 2. 碰撞查询（LineTrace / Sweep / Overlap）

```cpp
FHitResult Hit;
FCollisionQueryParams Params(SCENE_QUERY_STAT(Weapon), /*bTraceComplex*/ false, this);
Params.AddIgnoredActor(GetOwner());

// 射线检测
bool bHit = GetWorld()->LineTraceSingleByChannel(
    Hit, Start, End, ECC_Visibility, Params);

// 胶囊 Sweep
FCollisionShape Shape = FCollisionShape::MakeCapsule(34.f, 88.f);
GetWorld()->SweepSingleByChannel(Hit, Start, End, FQuat::Identity,
    ECC_Pawn, Shape, Params);

// 区域 Overlap
TArray<FOverlapResult> Overlaps;
GetWorld()->OverlapMultiByChannel(Overlaps, Center, FQuat::Identity,
    ECC_WorldDynamic, FCollisionShape::MakeSphere(300.f), Params);
```

Blueprint 对应节点：`LineTraceByChannel` / `SphereTraceByChannel` / `MultiSphereTraceByChannel` / `BoxOverlapActors`。

`HitResult` 关键字段：`ImpactPoint`、`ImpactNormal`、`Component`、`BoneName`、`PhysMaterial`。

### 3. Physical Material（物理材质）

作用于受模拟 primitive 上，配置物理属性与表面类型：

- `Friction`（摩擦）、`Restitution`（弹性 0–1）、`Density`（影响自动质量计算）
- `Surface Type`：用于表面响应分类（弹孔、脚步声、粒子），在 `Project Settings → Physics → Surface Types` 定义
- 通过 `Hit.PhysMaterial->SurfaceType` 在命中时读取

绑定：Static Mesh 的 Collision 设置里直接指派；也可从 Material 的 Physical Material 字段继承。

### 4. Chaos Destruction（破坏）

核心资产：**Geometry Collection**，由一个或多个 StaticMesh 构建，可被分裂（Fracture）并在运行时破碎。

工作流程：
1. 关卡中选中 StaticMesh Actor → Mode 下拉选 **Fracture** 进入 Fracture Mode
2. Generate 面板点 **New** 创建 Geometry Collection 资产
3. 使用 Fracture 工具（Uniform / Cluster / Planar / Voronoi 等）分裂，可做多级分裂与选择性分裂
4. **Cluster** 将碎片分组，形成父子层级；**Connection Graph** 描述结构完整性
5. 在 Geometry Collection 资产里配置：
   - **Damage Threshold**（每层 cluster 触发断裂所需伤害）
   - **Mass**（必须在 Geometry Collection 资产里设，而非 component 的 Physics 页）
6. 可启用 **World Support** 把指定部分设为 Kinematic，省去 Anchor Field

运行时交互：
- Niagara 可监听 Break Event / Collision Event 生成粒子
- Cache System：记录 per-frame transform 与事件，支持预录回放，回放中仍可被打断激活
- 通过 Physics Field 在空间区域内施加破坏/速度

### 5. Chaos Fields（物理力场）

三种主力场类型：

| 类型 | 行为 |
|------|------|
| **Anchor Field** | 把落在体积内的 Geometry Collection bone 设为 Static（锚定不动），支持 Box/Sphere/Plane falloff |
| **Sleep / Disable Field** | 速度低于 Threshold 时让刚体休眠（可被碰撞唤醒）或禁用（不可唤醒），另有 **Kill** 选项忽略阈值立即移除 |
| **Strain / Force Field** | 施加外部 strain 断开 cluster 连接，或施加线速度/角速度/径向速度 |

引擎内置预制：`Engine/Content/EditorResources/FieldNodes/`（需开启 **Show Engine Content**），最常用 `FS_AnchorField_Generic`、`FS_MasterField`。

绑定 Anchor Field：把 Blueprint 拖入关卡 → 选中 Geometry Collection → Details → **Chaos Physics → Initialization Fields** 数组 Index[0] 指向该 Field。

FS_MasterField 关键能力：
- Activation Type：`Delay` / `OnTick` / `OnTickWithDelay` / `Trigger`（由 BP 手动触发）
- **External Strain**：`Strain Magnitude` 需大于 Damage Threshold 才会断裂；falloff 有 Linear/Inverse/Square/Logarithmic；`Num Strain Hits` 控制施加次数
- **Internal Strain (Decay)**：逐渐降低 Damage Threshold，形成"慢慢被削弱"效果
- **Velocity**：`Radial Position Offset` 改源点；`Use Directional Vector` 指定方向；`Use Torque` 施加角速度
- **Force vs Velocity**：Velocity 直接设定速度忽略质量；Force 按质量计算更真实——注意 Geometry Collection 质量只读取资产内 Collision 节的 Mass
- **Noise**：对速度/力叠加 Perlin 噪声（`Use Noise` + `Noise Scale Multiplier`）

## 关键 API（摘要）

- `UPrimitiveComponent::SetSimulatePhysics(bool)` — 开关物理
- `UPrimitiveComponent::AddImpulse / AddForce / AddRadialImpulse / AddTorqueInRadians`
- `UPrimitiveComponent::SetPhysicsLinearVelocity / SetPhysicsAngularVelocityInRadians`
- `UWorld::LineTraceSingleByChannel / SweepSingleByChannel / OverlapMultiByChannel`
- `FCollisionQueryParams` — `bTraceComplex`、`AddIgnoredActor`
- `UGeometryCollectionComponent` — 破坏运行时组件（事件 `OnChaosBreakEvent`、`OnChaosCollisionEvent`、`OnChaosRemovalEvent`）
- `UFieldSystemComponent` — 运行时挂载 Field 节点图，选择 World Field / Chaos Field 作用域

## 注意事项

- **UE5 默认即 Chaos**，不再可切回 PhysX；旧项目迁移需重建 Apex Destructible 为 Geometry Collection
- Geometry Collection 的 **Mass 必须在资产内 Collision 面板设置**，component 的 Physics → Mass 对 Field 无效
- Field 的 **External Strain 启用 falloff 性能代价高**，官方建议尽量避免
- LineTrace 时 `bTraceComplex=false` 命中简单碰撞体（性能好），`true` 命中三角面（精确）；武器打击通常用 `true`，AI 感知用 `false`
- Physics Replication 三种模式：`Default`（遗留）、`Predictive Interpolation`（服务器权威、客户端预测插值）、`Resimulation`（物理 Pawn 多人预测，必要时客户端重模拟）；物理 Pawn 推荐 Resimulation
- 网络复制物理 Actor 时，根组件必须 Simulate Physics 且 Replicate Movement
- 破坏模拟开启 **Cache** 可大幅降低运行时开销，适合线性关卡脚本式破坏
- Anchor Field 之外，勾选 Geometry Collection 的 **World Support** 使接触静态世界的部分 Kinematic，是更便宜的锚定方案
- Async Physics 模式会使物理 tick 与游戏 tick 解耦，注意读取物理状态要用 `OnAsyncPhysicsStepSimulation` 等回调

## 组合提示

- **Chaos Destruction + Niagara**：Break Event / Collision Event 触发碎屑、尘土粒子
- **Chaos Field + Geometry Collection**：爆炸效果 = Radial Velocity + External Strain 同一 FieldSystem
- **Physical Material + Surface Type + Niagara/Gameplay**：命中反馈（弹孔 decal、足迹声音）
- **Physics Asset + Skeletal Mesh**：Ragdoll、Physical Animation、Vehicle Wheels
- **Async Physics + Networked Physics（Resimulation）**：多人物理 Pawn
- **Dataflow Graph**：程序化驱动 Geometry Collection fracture / Cloth / Flesh
