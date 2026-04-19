---
name: unreal5-enhanced-input
description: UE5 Enhanced Input 插件使用指南 —— InputAction / InputMappingContext / Modifier / Trigger 与 C++ 绑定实践
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [game-input]
version: "unreal-engine 5.x (enhanced-input plugin); unversioned"
collected_at: 2026-04-19
---

# Enhanced Input（UE5 增强输入系统）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/enhanced-input-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/input-overview-in-unreal-engine

## 用途

Enhanced Input 是 UE5 默认启用、官方推荐的输入系统，替代 UE4 的 ActionMapping/AxisMapping。支持资源化（DataAsset）管理、运行时动态上下文切换、径向死区、组合键（Chorded）、修饰器（Modifier）与触发器（Trigger）管线，以及跨平台映射重定向。

## 何时使用

- 需要运行时动态切换输入方案（走/跑/匍匐/载具/游泳 等状态机）
- 需要玩家自定义按键重映射（Player Mappable Config）
- 需要复杂输入模式（长按、双击、和弦、死区、灵敏度曲线）
- 多本地玩家、分屏、不同优先级的输入上下文共存
- 需要跨平台差异化输入（主机手柄 vs 键鼠 vs 移动触屏）
- 旧项目从 UE4 Legacy Input（PlayerInput + InputComponent 的 `BindAxis/BindAction`）升级

## 基础用法

### 1. 启用与默认类配置

插件在 UE5 默认启用。`Project Settings > Engine > Input > Default Classes`：
- **Default Player Input Class** = `EnhancedPlayerInput`
- **Default Input Component Class** = `EnhancedInputComponent`

### 2. 创建资源

Content Browser 右键 → Input：
- **Input Action**（IA_xxx）：定义一个动作，`Value Type` 选 `Digital(bool) / Axis1D(float) / Axis2D(Vector2D) / Axis3D(Vector)`
- **Input Mapping Context**（IMC_xxx）：把 IA 映射到具体按键，并挂 Modifier / Trigger

### 3. 在 PlayerController / Pawn 中注册 Context

```cpp
// AMyCharacter.h
UPROPERTY(EditAnywhere, Category="Input")
TSoftObjectPtr<UInputMappingContext> InputMapping;

UPROPERTY(EditAnywhere, Category="Input")
int32 MappingPriority = 0;
```

```cpp
// AMyCharacter.cpp —— 常用于 BeginPlay 或 PawnClientRestart
void AMyCharacter::PawnClientRestart()
{
    Super::PawnClientRestart();

    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
                ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
        {
            Subsystem->ClearAllMappings();                       // 防止重复叠加
            if (!InputMapping.IsNull())
            {
                Subsystem->AddMappingContext(InputMapping.LoadSynchronous(), MappingPriority);
            }
        }
    }
}
```

### 4. 绑定 Action 回调

```cpp
void AMyCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
    {
        EIC->BindAction(IA_Move,   ETriggerEvent::Triggered, this, &AMyCharacter::OnMove);
        EIC->BindAction(IA_Jump,   ETriggerEvent::Started,   this, &AMyCharacter::OnJumpPressed);
        EIC->BindAction(IA_Jump,   ETriggerEvent::Completed, this, &AMyCharacter::OnJumpReleased);
    }
}

void AMyCharacter::OnMove(const FInputActionValue& Value)
{
    const FVector2D Axis = Value.Get<FVector2D>();
    AddMovementInput(GetActorForwardVector(), Axis.Y);
    AddMovementInput(GetActorRightVector(),   Axis.X);
}
```

## 关键 API（摘要）

| API / 类型 | 说明 |
|---|---|
| `UInputAction` | 动作资源，`ValueType` ∈ {Bool, Axis1D, Axis2D, Axis3D} |
| `UInputMappingContext` | Key → IA 的集合，含 Modifier/Trigger |
| `UEnhancedInputComponent::BindAction(IA, ETriggerEvent, Obj, Func)` | C++ 绑定回调；签名可为 `()` / `(FInputActionValue&)` / `(FInputActionInstance&)` |
| `UEnhancedInputLocalPlayerSubsystem::AddMappingContext(IMC, Priority)` | 运行时添加上下文，数值越大优先级越高 |
| `…::RemoveMappingContext(IMC)` / `ClearAllMappings()` | 切换状态时移除 |
| `UEnhancedPlayerInput::InjectInputForAction(IA, FInputActionValue)` | 代码注入输入（AI/回放/UI 模拟） |
| `ETriggerEvent` | `Started / Ongoing / Triggered / Completed / Canceled` |
| `FInputActionValue::Get<T>()` | `T` ∈ `bool / float / FVector2D / FVector` |
| `UInputModifier::ModifyRaw_Implementation` | 自定义 Modifier 入口 |
| `UInputTrigger::UpdateState_Implementation` | 自定义 Trigger 入口，返回 `ETriggerState` |

### Trigger 事件含义

- **Started**：首次满足触发条件（按下首帧）。一次性响应首选。
- **Ongoing**：处理中但未完成（如 Hold 计时中）。
- **Triggered**：完全满足条件。按住持续响应用这个。
- **Completed**：本次 Trigger 结束（Hold 达到阈值后释放 / Press&Release 的释放）。
- **Canceled**：中途未满足条件（Hold 未到时间就松开）。

### Trigger 组合规则

- **Explicit**（显式）：任一满足即触发
- **Implicit**（隐式）：全部满足才触发
- **Blocker**：任一触发则强制失败
- 无任何 Trigger 时：值非 0 即触发

## 注意事项

- **迁移提醒**：启用 Enhanced Input 后不要再用 `InputComponent->BindAxis/BindAction`（legacy）。二者能共存但容易输入吞噬冲突。
- **PawnClientRestart 可多次调用**：添加 Context 前必须 `ClearAllMappings()` 或 `RemoveMappingContext`，否则每次重生会叠加。
- **TSoftObjectPtr vs 硬引用**：IMC 建议 `TSoftObjectPtr` + `LoadSynchronous()`，避免 Pawn 蓝图被 IMC 链反向打包膨胀。
- **WASD → Vector2D**：用 **单个 Axis2D IA + 四个 Key 各配不同 Modifier** 实现，不要做成四个 bool IA：
  - W：`Swizzle Input Axis Values (YXZ)`
  - A：`Negate`
  - S：`Swizzle (YXZ)` + `Negate`
  - D：无
- **优先级数值**：`AddMappingContext(IMC, Priority)` 值越大越优先，用于解决多个 Context 抢同一键的冲突。
- **值类型必须对齐**：IA 声明 `Axis2D` 就用 `Value.Get<FVector2D>()`，类型不匹配时 `Get` 会返回零值而非报错，debug 隐蔽。
- **Modifier 仅跑在 IMC 层**：想写可复用逻辑（如 Lyra 的 AimInversion）继承 `UInputModifier` 覆写 `ModifyRaw_Implementation`，可从 `PlayerInput->GetOuterAPlayerController()` 拿到玩家上下文。
- **调试命令**：
  - `showdebug enhancedinput`：查看当前生效的 IMC / IA
  - `showdebug devices`：查看输入设备
  - `Input.+key Gamepad_Left2D X=0.7 Y=0.5` / `Input.-key ...`：控制台注入输入
- **移动端触屏**：`Project Settings > Engine > Input > Default Touch Interface` 指向 `DefaultVirtualJoysticks`（双摇杆）或 `LeftVirtualJoystickOnly`；清空则无虚拟摇杆。PIE 用 `-faketouches` 或勾选 `Always Show Touch Interface` 强制触屏界面。虚拟摇杆输出仍通过 legacy Axis 通道（`Joystick*`），需要在 IMC 中把对应 Key 映射到 IA，或用 Touch1/Touch2 组合手势。
- **平台差异化映射**：`Project Settings > Enhanced Input > Platform Settings > Input Data` 挂 `EnhancedInputPlatformData` 蓝图，做 IMC → IMC 的平台级重定向（如 Switch 交换确认/取消键）。写入各平台 `DefaultInput.ini`，支持热修。
- **Player Mappable Config (PMI)**：封装一组 IMC + 优先级为预设（Default/Southpaw），便于 UI 键位设置页一键切换与持久化。

## 组合提示

- **CommonUI / EnhancedInput**：UI 打开时动态 push 一个 "UI" 优先级更高的 IMC，消费导航键避免角色误操作
- **GameplayAbilitySystem (GAS)**：Ability 激活按键用 IA + `AbilitySystemComponent::AbilityLocalInputPressed(InputID)`，或配合 `UAbilitySystemGlobals` 直接把 IA 绑到 Ability
- **Lyra Sample**：是 Enhanced Input + GAS + CommonUI 的官方最佳实践参考；看 `ULyraHeroComponent::InitializePlayerInput` 与 `ULyraInputConfig`
- **Legacy Input 对照**：老项目如仍要用 `FInputActionKeyMapping / FInputAxisKeyMapping`（`Project Settings > Engine > Input > Action/Axis Mappings`）绑定在 `SetupPlayerInputComponent` 的 `BindAxis("MoveForward", this, &AMyChar::MoveForward)`，应整体迁移到 Enhanced Input，不要混用

## 输入处理优先级（Legacy，仍适用于 Actor 层）

从高到低：启用了 `Accepts Input` 的 Actor（按最近启用顺序）→ Controller → Level Script → Pawn。某一层消费输入后下层收不到。
