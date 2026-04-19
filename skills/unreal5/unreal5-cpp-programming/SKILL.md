---
name: unreal5-cpp-programming
description: Unreal Engine 5 C++ 编程基础：UObject 反射体系、UCLASS/UPROPERTY/UFUNCTION 宏、容器、智能指针与 Epic 编码规范
tech_stack: [unreal5]
language: [cpp]
capability: [game-rendering, game-physics, game-input]
version: "Unreal Engine 5 (C++20); Epic C++ Coding Standard unversioned"
collected_at: 2026-04-19
---

# Unreal Engine 5 C++ 编程（反射 / 宏 / 规范）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/programming-with-cplusplus-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-cpp-quick-start
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/epic-cplusplus-coding-standard-for-unreal-engine

## 用途
在 UE5 中用 C++ 编写 Gameplay 类、与编辑器/蓝图互通、遵循 Epic 编码规范，避免踩反射系统、GC 和 UnrealHeaderTool（UHT）的坑。

## 何时使用
- 新建 Actor / Component / UObject 派生类并暴露给蓝图与编辑器
- 使用 `UCLASS / USTRUCT / UPROPERTY / UFUNCTION` 等反射宏
- 选择合适容器（TArray/TMap/TSet）与字符串类型（FString/FName/FText）
- 提交代码需符合 Epic 命名/格式规范（CI 会校验）
- 避免 GC 把你的 UObject 回收掉（何时加 UPROPERTY、何时用 TWeakObjectPtr）

## 基础用法：最小 Actor

头文件必须以 `#pragma once` 开头，并在最后 `#include "<Name>.generated.h"`（必须是最后一个 include）。类需要 `GENERATED_BODY()`，`*_API` 宏用于跨模块导出。

```cpp
// FloatingActor.h
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FloatingActor.generated.h"

UCLASS()
class QUICKSTART_API AFloatingActor : public AActor
{
    GENERATED_BODY()
public:
    AFloatingActor();

    // 暴露到编辑器 Details 面板 + 蓝图
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="FloatingActor")
    float FloatSpeed = 20.0f;

    // 组件指针：UPROPERTY 既暴露到编辑器，也让 GC 知道持有
    UPROPERTY(VisibleAnywhere)
    UStaticMeshComponent* VisualMesh;

protected:
    virtual void BeginPlay() override;
public:
    virtual void Tick(float DeltaTime) override;
};
```

```cpp
// FloatingActor.cpp
#include "FloatingActor.h"

AFloatingActor::AFloatingActor()
{
    PrimaryActorTick.bCanEverTick = true;

    VisualMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
    VisualMesh->SetupAttachment(RootComponent);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(
        TEXT("/Game/StarterContent/Shapes/Shape_Cube.Shape_Cube"));
    if (Cube.Succeeded())
    {
        VisualMesh->SetStaticMesh(Cube.Object);
    }
}
```

## 反射宏要点

| 宏 | 作用 | 常用 specifier |
|---|---|---|
| `UCLASS()` | 让类参与反射/蓝图/GC | `Blueprintable`, `BlueprintType`, `Abstract`, `Config=Game` |
| `USTRUCT()` | 值类型反射 | `BlueprintType` |
| `UPROPERTY()` | 字段反射（编辑器可见、序列化、GC 追踪、蓝图访问） | `EditAnywhere` / `VisibleAnywhere` / `EditDefaultsOnly`；`BlueprintReadWrite` / `BlueprintReadOnly`；`Category="..."`；`Replicated`；`Transient` |
| `UFUNCTION()` | 方法反射 | `BlueprintCallable`, `BlueprintPure`, `BlueprintImplementableEvent`, `BlueprintNativeEvent`, `Server/Client/NetMulticast`, `Exec` |
| `UENUM()` | 枚举反射，需 `enum class E... : uint8` 才能给蓝图用 |
| `GENERATED_BODY()` | 在类/结构体第一行展开 UHT 生成代码 |

**关键约束**：
- `UCLASS/USTRUCT` 不能放在命名空间中（UHT 不支持）
- 原生指向 UObject 的裸指针字段必须 `UPROPERTY()`，否则 GC 不认、随时被回收
- 蓝图可见的 enum 必须基于 `uint8`

## 类型前缀（强制，UHT 依赖）

| 前缀 | 含义 | 例 |
|---|---|---|
| `U` | 继承自 `UObject` | `UActorComponent` |
| `A` | 继承自 `AActor` | `ACharacter` |
| `F` | 普通 struct / 大多数类 | `FVector`, `FString` |
| `S` | Slate widget | `SCompoundWidget` |
| `I` | 抽象接口 | `IAnalyticsProvider` |
| `T` | 模板 | `TArray`, `TSharedPtr` |
| `E` | 枚举 | `EMovementMode` |
| `b` | bool 变量 | `bIsVisible` |

模板参数用 `In` 前缀，别名用 `Type` 后缀：`template<typename InElementType> using ElementType = InElementType;`

## 容器与字符串

- `TArray<T>`：动态数组（首选）
- `TMap<K, V>` / `TMultiMap`：哈希映射；遍历 `for (TPair<K,V>& Kvp : Map)`
- `TSet<T>`：哈希集合
- 四者都有 move ctor / move assign，可用 `MoveTemp(x)`（等价 `std::move`）
- **不要用 `std::vector/string/map`**（除互操作代码）
- 字符串：`FString`（可变）、`FName`（不可变、哈希、资源标识）、`FText`（本地化）
- **字符串字面量必须包 `TEXT("...")`**，否则会产生隐式转换

## 智能指针与对象引用

| 类型 | 用途 |
|---|---|
| `TSharedPtr<T>` / `TSharedRef<T>` | 非 UObject 的共享所有权（Ref 永不为空） |
| `TWeakPtr<T>` | 弱引用（配合 TSharedPtr） |
| `TUniquePtr<T>` | 独占所有权 |
| `TObjectPtr<T>` | UE5 取代裸 `U*` 的反射指针（配合 UPROPERTY） |
| `TWeakObjectPtr<T>` | UObject 弱引用，不阻止 GC，访问前 `IsValid()` |
| `TSoftObjectPtr<T>` / `TSoftClassPtr<T>` | 资源软引用，按需加载 |

**UObject 用 TSharedPtr 是错的**——UObject 由 GC 管理，只能用 `UPROPERTY()` 裸指针或 `TWeakObjectPtr`。

## 编码规范核心（必遵守）

- **版权头**：公开发布的每个 `.h/.cpp/.xaml` 第一行：`// Copyright Epic Games, Inc. All Rights Reserved.`（CIS 会校验）
- **命名**：PascalCase；方法是动词；返回 `bool` 的函数写成是非问句（`IsTeaFresh()` 而非 `CheckTea()`）；输出引用参数前缀 `Out`（bool 则 `bOutResult`）
- **大括号独占一行**；单语句块也必须带 `{}`；缩进用 Tab（宽度 4）
- **C++ 版本**：默认 C++20；用 `nullptr`、`static_assert`、`override`/`final`；range-based for 优先
- **`auto` 少用**：仅 lambda 绑定、冗长迭代器、模板代码允许
- **lambda**：避免 `[&]` / `[=]`；延迟执行 lambda 绝不按引用捕获局部变量；捕获 UObject 指针对 GC 不可见——用 `CreateWeakLambda` / `CreateSPLambda`
- **const 正确性**：参数不改就 `const T&`；方法不改成员就 `const`；**不要在返回类型上加 const**（会阻止 move）
- **可移植类型**：`int32/uint32/int64/...`、`bool`（禁用 `BOOL`）、`TCHAR`、`PTRINT`
- **头文件卫生**：`#pragma once`；优先前向声明；公共 API 放在 `Public/`，内部放 `Private/`；不要在头里包 C++ 标准库头
- **API 设计**：多 bool 参数改用 `enum class` flags + `ENUM_CLASS_FLAGS(E)`；UObject 传指针不传引用；接口类（`I`）必须抽象、无成员变量
- **枚举**：优先 `enum class E... : uint8`；命名空间 enum 已过时
- **标准库**：`<atomic>`、`<type_traits>`、`<initializer_list>`、`<cmath>`、`std::numeric_limits` 推荐使用；容器/字符串仍用 UE 自家
- **宏命名**：全大写下划线分隔，必须 `UE_` 前缀；宏不能放命名空间
- **新非 UCLASS API 放 `UE::` 命名空间**；实现细节放 `UE::<Module>::Private::`
- **包容性措辞**：避免 master/slave、blacklist/whitelist 等，用 primary/secondary、allow list/deny list

## 模块与 Build.cs（摘要）

- 每个模块有 `Public/`（对外 header）与 `Private/`（实现与内部 header）
- 模块导出宏形如 `MYMODULE_API`（由 `<ModuleName>.Build.cs` + UBT 生成），跨模块引用类必须带它
- 不要手工配置 PCH，交给 UnrealBuildTool

## 常见陷阱
- 忘记把 `<Class>.generated.h` 放在头文件最后一个 include → UHT 报错
- UObject 字段没加 `UPROPERTY()` → 运行时被 GC 回收出现悬空指针
- 对 UObject 用 `TSharedPtr` → 生命周期错配
- lambda 延迟执行时裸捕 `this` → UObject 被销毁后崩溃；改用 `CreateWeakLambda(this, ...)`
- 字符串字面量漏写 `TEXT()` → 每次构造 FString 都会走字符转换
- 返回值写 `const TArray<T>` → 阻止 move，老编译器还会警告
- 用 `bool` 重载和 `FString` 重载 → `Func(TEXT("X"))` 意外调用 bool 重载

## 组合提示
常与 `unreal5-gameplay-framework`（Actor/Pawn/Controller/GameMode）、`unreal5-delegates`（委托与事件绑定）、`unreal5-reflection-system`（反射 specifier 详解）、`unreal5-replication`（网络复制）搭配使用。
