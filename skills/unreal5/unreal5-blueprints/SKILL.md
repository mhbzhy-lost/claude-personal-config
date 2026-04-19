---
name: unreal5-blueprints
description: Unreal Engine 5 Blueprint 可视化脚本系统核心用法与 C++ 互操作指南
tech_stack: [unreal5]
language: [blueprint, cpp]
capability: [game-rendering, game-input]
version: "unreal-engine 5"
collected_at: 2026-04-19
---

# Unreal Engine 5 Blueprints（蓝图可视化脚本）

> 来源：Epic 官方文档（见文末 URL 列表）

## 用途

Blueprint 是 UE5 内置的节点式可视化脚本系统，可在不写 C++ 的前提下创建 UClass、定义组件、响应事件、实现游戏逻辑。定位是"脚本层 + 快速原型 + 设计师可访问"；C++ 负责底层系统与性能关键路径，二者通过 `UFUNCTION`/`UPROPERTY` 宏互通，是 UE5 工程推荐范式。

## 何时使用

- 原型期、设计师主导的交互逻辑（开关门、AI 触发、UI 行为、关卡事件）
- 扩展 C++ 基类：程序员搭好底座，设计师在 BP 子类里调参/组装
- 关卡特定逻辑（Level Blueprint）、Actor 蓝图类、Construction Script 生成自适应预制体
- **不适合的场景**：上千 Actor 的 Tick 逻辑、大数据集运算、字符串/数学重计算、需要多线程、低层系统接入——这类需求用 C++

## 核心概念

### Blueprint 组成

- **Event Graph**：事件驱动的节点图，入口为 Event 节点，贯穿 Function Call / Flow Control / 变量节点
- **Functions**：带单一入口的可复用节点图，可有返回值；具备 Access Specifier
- **Macros**：折叠的节点网络，允许多执行输入/输出引脚（Function 不行）；编译时展开，无调用开销
- **Variables**：类型强约束、颜色编码；可暴露为 Instance Editable / Expose on Spawn / Expose to Cinematics
- **Event Dispatchers**：一对多事件广播，跨 BP 通信核心机制
- **Construction Script**：等同 C++ 构造函数，Actor 放置/移动/参数修改时执行；适合做程序化生成

### Functions vs Macros（易混）

| 维度 | Function | Macro |
|------|----------|-------|
| 执行引脚 | 单入单出 | 可多入多出 |
| 是否编译为独立调用 | 是 | 否（展开内联） |
| 跨 BP 调用 | 支持（通过引用） | 仅本 BP / Macro Library |
| 可否 Pure | 可（无 exec 引脚） | — |
| 返回值 | 支持 | 只能经 Output tunnel |

### Pure vs Impure Function

- **Pure**：承诺不改状态，连到 Data Pin，按需多次执行（每个连接点执行一次，注意性能）；C++ 用 `UFUNCTION(BlueprintPure)` 或 `const` 标记
- **Impure**：通过 exec 引脚触发，可改状态；C++ 用 `UFUNCTION(BlueprintCallable)`

### Access Specifier

| 级别 | 可调用方 |
|------|----------|
| Public（默认） | 任何对象 |
| Protected | 本 BP 及其子类 |
| Private | 仅本 BP |

### Variable 常用类型（颜色编码）

Boolean（栗色）/ Byte / Integer（海绿）/ Integer64 / Float（黄绿）/ Name / String（品红）/ Text（粉，用于本地化）/ Vector（金，XYZ/RGB）/ Rotator / Transform / Object（蓝，引用类）。每种均可做数组。

### 关键变量属性

- `Instance Editable`（原 eye icon）→ 在 Details 面板可调
- `Expose on Spawn` → `SpawnActor` 时作为输入参数
- `Private` → 禁止被派生 BP 修改
- `Replication` → None / Replicated / RepNotify
- `SaveGame` → 被 SaveGame 系统序列化
- `Config` → 从 ini 读默认值

**快捷键**：MyBlueprint 面板 Ctrl-drag = Get、Alt-drag = Set；数据引脚右键 **Promote to Variable** 快速生成变量。

## Flow Control 节点速查

| 节点 | 作用 |
|------|------|
| Branch | true/false 二分 |
| Sequence | 单输入按顺序触发多个输出（无帧间延迟） |
| ForLoop / ForLoopWithBreak | 索引区间循环；迭代跨帧，大循环有性能代价 |
| WhileLoop | 条件为真持续执行；必须保证条件会收敛，否则死循环导致卡死 |
| DoN / DoOnce | 限次触发，需 Reset 才能再次放行 |
| FlipFlop | A/B 交替输出，带布尔指示当前态 |
| Gate | 以 Open/Close/Toggle 控制 Enter→Exit 的通断，Start Closed 决定初态 |
| MultiGate | 单输入路由到 N 个输出之一，支持顺序/随机/循环 |
| Switch (Int/String/Name/Enum) | 按值分派；Enum Switch 自动生成枚举对应引脚 |

## 常用内置 Event

| Event | 触发时机 | 备注 |
|-------|----------|------|
| Event BeginPlay | 游戏开始 / Actor 被 spawn 后立刻 | Actor 层初始化入口 |
| Event Tick | 每帧 | 输出 Delta Seconds；慎用，优先用 Timer/Delegate |
| Event EndPlay | Actor 离开 World | 输出 EEndPlayReason；替代已弃用的 Destroyed |
| Event ActorBeginOverlap / EndOverlap | 双方允许 Overlap 且 GenerateOverlapEvents = true | 输出 OtherActor |
| Event Hit | 碰撞且 Simulation Generates Hit Events = true（或 Sweep 运动） | 输出 HitResult、HitLocation、HitNormal 等 |
| Event AnyDamage / PointDamage / RadialDamage | **仅 Server（单机即本地 client）** 接收伤害 | 通用/点伤/范围伤 |
| Event LevelReset | Level Blueprint 专用；关卡重载 | |
| Custom Event | 用户自定义，可从任意处触发 | |

单个 Event 一次只能驱动一条执行链，多个响应需串联。

## Blueprint 通信四种方式（决策矩阵）

| 方式 | 关系 | 典型场景 | 何时选 |
|------|------|----------|--------|
| **Direct Reference** | 1-to-1 | 关卡里开关 A 控制灯 B | 两个已知 Actor 有明确耦合 |
| **Cast** | 1-to-1（带类型校验） | 角色 → 特定角色子类访问 Health；死亡 → Cast GameMode 执行 respawn | 需要访问"特定子类"的接口 |
| **Blueprint Interface** | 1-to-many（异构） | "可交互对象"——门/灯/道具都响应 Use；子弹打树/车都走 OnTakeWeaponFire | 多个异构类型共享一组函数签名 |
| **Event Dispatcher** | 1-to-many（监听） | Boss 死亡广播 OnDied，角色庆祝+门打开+HUD 提示；角色→Level Blueprint 通知升级 | 广播事件给若干"不一定存在"的监听者 |

### Cast 范式（C++）

```cpp
void ABPCommunicationCharacter::NotifyActorBeginOverlap(AActor* OtherActor)
{
    if (ARotatingActor* Rotating = Cast<ARotatingActor>(OtherActor))
    {
        Rotating->SetbCanRotate(true);
    }
}
```

BP 侧用 **Cast To \<Class\>** 节点，失败分支走 Cast Failed 引脚。

### Interface 调用三种形态

| 类型 | 行为 |
|------|------|
| Object call | 已知具体类且该类实现接口 → 直接调用 |
| Interface call | 持有 Interface 引用 → 调用 |
| **Message call** | 任意对象都可调；未实现则**静默失败**，速度较慢 |

## Blueprint ↔ C++ 互操作

### 暴露 C++ 给 Blueprint（最常用）

```cpp
UCLASS(Blueprintable)
class MYGAME_API ALightSwitchBoth : public AActor
{
    GENERATED_BODY()
public:
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Switch Components")
    class UPointLightComponent* PointLight1;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Switch Variables")
    float DesiredIntensity;

    UFUNCTION(BlueprintCallable, Category="Switch")
    void ToggleLight();

    // BP 可重写；C++ 默认实现必须写成 _Implementation
    UFUNCTION(BlueprintNativeEvent, Category="Switch")
    void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
                        UPrimitiveComponent* OtherComp, int32 OtherBodyIndex,
                        bool bFromSweep, const FHitResult& SweepResult);
    void OnOverlapBegin_Implementation(/* same args */);
};
```

**关键 Specifier 一览**：

| Specifier | 作用 |
|-----------|------|
| `Blueprintable`（UCLASS） | 允许 BP 继承（AActor 默认已带） |
| `BlueprintReadOnly` / `BlueprintReadWrite` | BP 图可读 / 可读写该属性 |
| `EditAnywhere` / `VisibleAnywhere` | Editor Defaults 与 Instance Details 面板可改/可见 |
| `BlueprintCallable` | BP 可调用的 Impure 函数 |
| `BlueprintPure` 或 `const` | 无 exec 引脚的 Pure 函数 |
| `BlueprintImplementableEvent` | 纯虚——**只能** BP 实现 |
| `BlueprintNativeEvent` | C++ 有默认实现（`_Implementation`），BP 可选重写 |
| `meta=(AdvancedDisplay="2")` | 第 2 个起的参数默认折叠 |
| `meta=(ExpandEnumAsExecs="OutResult")` | 枚举返回值展开为多个 exec 输出引脚 |
| `meta=(Latent, LatentInfo="LatentInfo")` | 异步/跨帧 latent 节点 |
| `meta=(DeprecatedFunction, DeprecationMessage="...")` | 弃用告警 |
| `UPROPERTY(meta=(BindWidget))` | 绑定 BP UMG 中的同名 UserWidget 控件 |

### Blueprint API 设计建议

- 优先用多 **输出参数** 而非返回 struct：`void Foo(int32& OutInt, FVector& OutVec)` 在 BP 里更直观
- 能标 Pure / const 的尽量标，节省 exec 连线
- 通用工具函数放进 `UBlueprintFunctionLibrary` 子类，调用时不需要 target 引用
- **不要删/改旧参数**——deprecate 旧函数 + 新增新函数，避免损坏设计师的现有 BP 资产

### BP → C++ 方向

- `BlueprintImplementableEvent`：C++ 声明、BP 必须实现
- `BlueprintNativeEvent`：C++ `_Implementation` 为默认，BP 可 **Add Call to Parent Function** 后追加
- `meta=(BindWidget)`：C++ UserWidget 子类里自动绑定 BP-UMG 同名控件

## Blueprint vs C++ 选型

**选 BP**：迭代速度快、设计师友好、内存模型安全、API 发现容易、资产引用直观。
**选 C++**：核心低层系统、Tick-heavy 大规模实例、大数据循环、需多线程（BP 不支持）、I/O 密集、文本 diff/合并协作、大型可维护代码库。

**推荐范式**：C++ 打地基（系统、性能关键），BP 做脚本（行为、组装、数值调参）。定位瓶颈先用 **Unreal Insights** 剖析，真成为热点再迁 C++；勿凭直觉提前优化。

## 注意事项（常见坑）

1. **Event Tick 过度使用** 是 BP 性能头号问题。改用 `SetTimerByFunctionName` / Event Dispatcher / Overlap 事件。
2. **Pure Function 会重复执行**：每连一次数据引脚执行一次，昂贵计算必须改 Impure + 缓存。
3. **ForLoop / ForLoopWithBreak 跨帧假象**：官方强调"iterations take place between frames"——大循环会阻塞帧，需分片或迁 C++。
4. **WhileLoop 死循环会卡崩**：务必确保终止条件在体内被更新。
5. **Damage 事件只在服务端触发**（单机下本地 client 就是服务端，所以看起来"能用"；联网务必放 Authority 侧）。
6. **Event Destroyed 已弃用**，统一迁到 `Event EndPlay`（通过 EEndPlayReason 区分）。
7. **Interface Message call 静默失败**：慢且不报错，排错痛苦；能用 Interface call 就别用 Message call。
8. **BlueprintNativeEvent 的 C++ 默认实现必须写成 `FunctionName_Implementation`**，否则链接失败。
9. **修改 Function 输入/输出参数后必须 Compile**，所有调用方才会刷新；否则报 "Unable to find function"。
10. **不要在 Blueprint Class 里硬引用关卡实例**——会隐式耦合；关卡特定逻辑放 Level Blueprint 或用 Event Dispatcher 解耦。
11. **Expose on Spawn 变量** 必须同时开 Instance Editable，否则 `SpawnActor` 节点上不会出引脚。
12. **ini 配置变量** 需 C++ 侧加 `Config` 关键字配合 `UCLASS(Config=Game)` 才完整生效。

## 来源 URL

- https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprints-visual-scripting-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/basic-scripting-with-blueprints-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/technical-guide-for-blueprints-visual-scripting-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/event-graph-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/functions-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-variables-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/macros-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/events-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/casting-quick-start-guide-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/event-dispatchers-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/implementing-blueprint-interfaces-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communication-usage-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/exposing-cplusplus-to-blueprints-visual-scripting-in-unreal-engine
- https://dev.epicgames.com/documentation/en-us/unreal-engine/cpp-and-blueprints-example
- https://dev.epicgames.com/documentation/en-us/unreal-engine/coding-in-unreal-engine-blueprint-vs-cplusplus
