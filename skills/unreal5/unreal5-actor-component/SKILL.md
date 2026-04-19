---
name: unreal5-actor-component
description: UE5 Actor 与 Component 体系——组件分类、层级、生命周期、Spawn、Ticking 全流程
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [game-rendering, state-management]
version: "unreal-engine 5.x (unversioned docs snapshot)"
collected_at: 2026-04-19
---

# UE5 Actor 与 Component 体系

> 来源：https://dev.epicgames.com/documentation/en-us/unreal-engine/ （actors / components / actor-lifecycle / spawning-actors / actor-ticking / basic-components / components-window）

## 用途

描述 UE5 中 Actor（可放入 Level 的游戏对象）与 Component（挂接到 Actor 的功能模块）的关系、分类、生命周期、生成方式与 Tick 调度，是 Gameplay 编程最核心的基础模型。

## 何时使用

- 自定义 C++ Actor / Component 类，决定继承 `UActorComponent` / `USceneComponent` / `UPrimitiveComponent` 中哪一个
- 运行时动态 Spawn Actor（子弹、敌人、特效、拾取物）
- 排查 Tick 顺序相关的 1 帧差 bug，或需要与物理模拟按特定顺序交互
- 在 Blueprint Editor 的 Components 窗口组装 Actor（相机、碰撞盒、静态网格等）
- 处理 Actor 销毁、GC、EndPlay 相关资源清理

## 组件三大基类

| 基类 | 父类 | 有 Transform | 有渲染/碰撞 | 用途 |
|------|------|:-:|:-:|------|
| `UActorComponent` | `UObject` | 否 | 否 | 抽象行为（AI、输入解释、库存、属性） |
| `USceneComponent` | `UActorComponent` | 是 | 否 | 有位置的非几何对象（SpringArm、Camera、Audio、Constraint） |
| `UPrimitiveComponent` | `USceneComponent` | 是 | 是 | 有几何体（StaticMesh、SkeletalMesh、Box/Capsule/Sphere 碰撞体、粒子） |

**关键规则**：
- Actor 本身没有 Transform，位置取自其 `RootComponent`（必须是 `USceneComponent`）
- 只有 `USceneComponent` 及其子类能互相附着形成树；一个子只能有一个父，不允许循环
- 构造器内用 `SetupAttachment`，运行时用 `AttachToComponent`
- Component 作为 Actor 的 sub-object 默认是 instanced，每个 Actor 实例拥有独立副本

## 基础用法

### 定义一个带组件的 Actor（C++）

```cpp
// MyPickup.h
UCLASS()
class AMyPickup : public AActor {
    GENERATED_BODY()
public:
    AMyPickup();
    UPROPERTY(VisibleAnywhere) USceneComponent*      Root;
    UPROPERTY(VisibleAnywhere) UStaticMeshComponent* Mesh;
    UPROPERTY(VisibleAnywhere) UBoxComponent*        Trigger;
};

// MyPickup.cpp
AMyPickup::AMyPickup() {
    PrimaryActorTick.bCanEverTick = true;

    Root    = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    RootComponent = Root;
    Mesh    = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
    Trigger = CreateDefaultSubobject<UBoxComponent>(TEXT("Trigger"));
    Mesh->SetupAttachment(Root);
    Trigger->SetupAttachment(Root);
}
```

### Spawn 一个 Actor

```cpp
// 简单 Spawn（使用模板版本，最常用）
AEnemy* Enemy = GetWorld()->SpawnActor<AEnemy>(EnemyClass, Location, Rotation);

// 需要先设置 exposed 属性再触发 BeginPlay → 使用 Deferred Spawn
FTransform T(Rotation, Location);
AEnemy* E = GetWorld()->SpawnActorDeferred<AEnemy>(EnemyClass, T, /*Owner*/ this);
E->HP = 100;
E->TeamId = 2;
E->FinishSpawning(T);  // 触发 ExecuteConstruction + BeginPlay
```

## Actor 生命周期

**Spawn 路径**（运行时通过 `SpawnActor` 创建，最常遇到）：
1. `UWorld::SpawnActor`
2. `PostSpawnInitialize`
3. `PostActorCreated`（与 `PostLoad` 互斥，构造逻辑放这）
4. `ExecuteConstruction` → `OnConstruction`（Blueprint 组件与变量在此初始化）
5. `PostActorConstruction`：
   - `PreInitializeComponents`
   - 每个组件的 `InitializeComponent`
   - `PostInitializeComponents`
6. `UWorld::OnActorSpawned` 广播
7. `BeginPlay`

**Load-from-Disk / PIE 路径**（关卡已放置的 Actor）：
`PostLoad` (或 `PostDuplicate`) → `RouteActorInitialize` → `PreInitializeComponents` → 各组件 `InitializeComponent` → `PostInitializeComponents` → `BeginPlay`

**Deferred Spawn**：`SpawnActorDeferred` 后，在 `PostActorCreated` 之后暂停，调用方设置属性，再调用 `FinishSpawning` 接回 `ExecuteConstruction` 流程。用于带 "Expose on Spawn" 属性的 Actor。

**销毁路径**：
- `Destroy()` → Actor 标记 pending kill，从 Level 数组移除
- `EndPlay`（在 Destroy、PIE 结束、关卡切换、流关卡卸载、应用退出时调用——清理逻辑应放这，而不是旧的 `OnDestroyed`）
- GC 阶段：`BeginDestroy` → `IsReadyForFinishDestroy` → `FinishDestroy`
- 注意：EndPlay 被调用不代表 Actor 一定销毁（流关卡快速重载时可能 "复活"，局部变量不会重置）
- 持有 Actor 指针用 `FWeakObjectPtr<AActor>` 而非手动检查 pending kill

## Actor Ticking

**Tick Groups**（按帧内顺序）：

| Tick Group | 场景 |
|------------|------|
| `TG_PrePhysics` | Actor 移动与物理对象交互；物理数据还是上一帧的 |
| `TG_DuringPhysics` | 与物理并行；物理数据可能新可能旧——仅用于容忍 1 帧延迟的逻辑（UI、小地图） |
| `TG_PostPhysics` | 物理结果已定；用于武器 trace、激光瞄准等需要当帧最终位置 |
| `TG_PostUpdateWork` | 相机已更新之后；用于依赖相机的粒子/特效，或需要最后运行的游戏逻辑 |

**启用 Tick**：
```cpp
// Actor 构造器
PrimaryActorTick.bCanEverTick = true;
PrimaryActorTick.bTickEvenWhenPaused = false;
PrimaryActorTick.TickGroup = TG_PrePhysics;

// Component 构造器（注意结构体名不同）
PrimaryComponentTick.bCanEverTick = true;
PrimaryComponentTick.TickGroup = TG_PrePhysics;
```

- Actor 用 `Tick(DeltaTime)`；Component 用 `TickComponent(DeltaTime, ...)`
- 运行时开关：`SetActorTickEnabled` / `SetComponentTickEnabled`，组件另可 `PrimaryComponentTick.SetTickFunctionEnable(true/false)`
- 降频：设置 `TickInterval`（秒）
- 跨 Actor 依赖：`AddTickPrerequisiteActor` / `AddTickPrerequisiteComponent`（比整组搬家更细粒度，保留并行度）
- 多 tick 函数：继承 `FTickFunction`，override `ExecuteTick` / `DiagnosticMessage`，在 `RegisterActorTickFunctions` 中 `SetTickFunctionEnable` + `RegisterTickFunction`

## 组件注册与状态

- Sub-object 组件在 Actor spawn 时自动注册；运行时 `NewObject` 创建的组件需手动 `RegisterComponent()`（注意性能开销）
- 注册事件：`OnRegister` / `CreateRenderState` / `OnCreatePhysicsState`
- 反注册：`UnregisterComponent()` → `OnUnregister` / `DestroyRenderState` / `OnDestroyPhysicsState`
- Render State：SceneComponent 及其子类默认创建；修改渲染数据后调 `MarkRenderStateDirty()`
- Physics State：仅 PrimitiveComponent 默认创建；自定义时 override `ShouldCreatePhysicsState`（不要无脑 return true——销毁过程中应返回 false）

## 常用内置 Component

| 组件 | 类型 | 用途 |
|------|------|------|
| `UStaticMeshComponent` | Primitive | 静态网格渲染 + 碰撞 |
| `USkeletalMeshComponent` | Primitive | 骨骼动画网格，Tick 时更新动画与骨骼控制器 |
| `UCameraComponent` | Scene | 相机视角 |
| `UBoxComponent` / `UCapsuleComponent` / `USphereComponent` | Primitive | 不可见碰撞体 / 触发器 |
| `UParticleSystemComponent` | Primitive | 粒子系统，Tick 时更新发射器 |
| `UAudioComponent` | Scene | 3D 音频发射 |
| `UMovementComponent` 系列 | ActorComponent | 移动逻辑（CharacterMovement、FloatingPawnMovement） |
| `USpringArmComponent` | Scene | 第三人称相机臂，处理相机碰撞回弹 |

## Visualization Component（仅编辑器）

用于给无可视外观的 Actor（相机、触发器）加编辑器内可视辅助体：

```cpp
#if WITH_EDITORONLY_DATA
    UDrawFrustumComponent* DrawFrustum;
#endif

void UMyComponent::OnRegister() {
#if WITH_EDITORONLY_DATA
    if (AActor* Owner = GetOwner()) {
        DrawFrustum = NewObject<UDrawFrustumComponent>(
            Owner, NAME_None, RF_Transactional | RF_TextExportTransient);
        DrawFrustum->SetupAttachment(this);
        DrawFrustum->SetIsVisualizationComponent(true);
    }
#endif
    Super::OnRegister();
}
```

打包构建中不会存在，所有引用必须包在 `WITH_EDITORONLY_DATA` / `WITH_EDITOR` 宏内。

## Blueprint Components 窗口（UI 操作）

在 Blueprint Editor 的 Components 面板：
- **添加**：点 "+ Add" 下拉选类型（如 CameraComponent），输入名字；或从 Content Browser 拖拽 StaticMesh/SkeletalMesh/SoundCue/ParticleSystem 直接落入窗口
- **删除**：右键 → Delete，或选中按 Delete
- **变换**：Details 面板或 Viewport 操作；按 Shift 启用网格吸附（需 Level Editor 开启 snapping）；父变换会传递到子
- **绑定资产**：选中组件 → Details 面板找对应资产下拉（如 Static Mesh）→ 选资产；或在 Content Browser 选中后点 assign 按钮；clear / browse 按钮用于清除或跳转到资产
- **重命名实例变量**：选中后按 F2，或在 Details 的 Variable Name 字段改名
- **添加事件**：Details 面板 Add Event 按钮；或右键组件 → Add Event；或从 My Blueprint → Components 拖入 Event Graph（注意：PointLightComponent 等组件只有函数没有事件）

## 注意事项

- **Tick group 选择**：与物理交互的移动放 `TG_PrePhysics`；需要当帧物理结果的 trace 放 `TG_PostPhysics`；不要默认所有逻辑都放 PrePhysics
- **Actor 没有 Transform**：所有位置 API 实际作用在 RootComponent 上，替换 RootComponent 会改变 Actor 的位置基准
- **SetupAttachment vs AttachToComponent**：前者用于构造器（组件尚未注册），后者用于运行时。混用会导致 attach 失败或穿帮
- **`PostActorCreated` 与 `PostLoad` 互斥**：不要把初始化逻辑两边都写；构造行为用前者，磁盘加载修复用后者
- **清理逻辑放 `EndPlay`**：`OnDestroyed` 是 legacy，不覆盖流关卡卸载等场景
- **Deferred Spawn 必须 FinishSpawning**：忘调会导致 Actor 不 BeginPlay、处于半初始化状态
- **运行时 RegisterComponent 有开销**：批量动态创建组件时尽量在 spawn 时一次完成
- **Physics State 创建要判销毁**：override `ShouldCreatePhysicsState` 时一定参考 `UPrimitiveComponent` 原版，销毁过程必须返回 false
- **组件实例化默认开启**：不需要在 UPROPERTY 上加 `Instanced` 说明符；只有非组件的 UObject sub-object 才需要
- **PrimaryComponentTick.bCanEverTick 默认 false**：确定组件永远不需 Tick 就保持默认，能省性能

## 组合提示

- 角色实现：`ACharacter` + `UCharacterMovementComponent` + `USkeletalMeshComponent` + `USpringArmComponent` + `UCameraComponent`
- 拾取物：`AActor` + Root Scene + `UStaticMeshComponent` + `USphereComponent`（Overlap 触发）
- AI：`APawn` + `UPawnMovementComponent` + AIController + 行为树
- 自定义可复用行为：继承 `UActorComponent`（如 `UHealthComponent`、`UInventoryComponent`），附到任意 Actor
- 与 `unreal5-blueprint-basics` / `unreal5-input-system` / `unreal5-collision-overlap` 等 skill 搭配使用
