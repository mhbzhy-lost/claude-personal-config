---
name: unreal5-umg-ui
description: Unreal Engine 5 中 UMG (UUserWidget) 与底层 Slate (SWidget) 的 UI 构建、布局、样式与视口挂载要点
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [ui-layout, ui-display]
version: "unreal-engine 5 unversioned"
collected_at: 2026-04-19
---

# UMG / Slate UI（虚幻 UI 框架）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/slate-overview-for-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/using-slate-in-game-in-unreal-engine

## 用途

Unreal 的 UI 由两层构成：**Slate**（底层 C++ 声明式框架，`SWidget`/`SCompoundWidget`）负责编辑器和所有原生控件；**UMG**（Unreal Motion Graphics，`UUserWidget` + WidgetBlueprint）是对 Slate 的 UObject/蓝图封装，游戏 UI（HUD、菜单、暂停面板、计分板等）几乎都应优先使用 UMG，需要性能或编辑器扩展时才下沉到纯 Slate。

## 何时使用

- 游戏内 HUD、主菜单、暂停菜单、设置面板、对话/库存界面 → **UMG (WidgetBlueprint)**
- 编辑器工具、细节面板扩展、独立 Slate Application → **纯 Slate (SNew/SAssignNew)**
- 大量动态刷新或极高频重绘的元素 → 下沉到 Slate 自定义 `SWidget` 避免 UObject 开销
- 需要 UI 与蓝图交互、设计师可视化编辑 → UMG

## 分层关系

```
UUserWidget (蓝图/UObject 层)
  └─ UWidget (UButton / UTextBlock / UImage / UCanvasPanel / UOverlay / UScrollBox / UVerticalBox ...)
        └─ TakeWidget() → TSharedRef<SWidget>
                └─ SWidget (SButton / STextBlock / SImage / SCanvasPanel / SOverlay ...)
```

每个 `UWidget` 内部会在需要时通过 `RebuildWidget()` 创建其对应的 Slate `SWidget`。直接编辑 UMG 树等同于编辑底层 Slate 树。

## 项目启用 Slate（仅纯 C++/Slate 场景）

在 `[ProjectName].Build.cs` 中：

```csharp
PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });
PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });
```

UMG 还需额外 `"UMG"`（Public）依赖。

## 基础用法

### UMG：创建并添加到视口（推荐）

```cpp
// PlayerController 或 GameMode 中
if (WidgetClass)  // TSubclassOf<UUserWidget> WidgetClass;
{
    UUserWidget* Widget = CreateWidget<UUserWidget>(GetWorld(), WidgetClass);
    Widget->AddToViewport(/*ZOrder=*/0);   // 加入视口
    // ...
    Widget->RemoveFromParent();            // 从视口移除
}
```

蓝图等价节点：`Create Widget` → `Add to Viewport` / `Remove from Parent`。

### Slate 声明式语法（纯 C++）

```cpp
SLATE_BEGIN_ARGS(SSubMenuButton)
    : _ShouldAppearHovered(false) {}
    SLATE_ATTRIBUTE(FString, Label)
    SLATE_EVENT(FOnClicked, OnClicked)
    SLATE_NAMED_SLOT(FArguments, FSimpleSlot, Content)
    SLATE_ATTRIBUTE(bool, ShouldAppearHovered)
SLATE_END_ARGS()
```

组合示例：

```cpp
ChildSlot
[
    SNew(SVerticalBox)
    + SVerticalBox::Slot().Padding(3.f, 1.f)
    [
        SNew(SHorizontalBox)
        + SHorizontalBox::Slot().Padding(2.f)
        [
            SNew(SButton).OnClicked(this, &SMyPanel::OnClick)
            [ SNew(STextBlock).Text(LOCTEXT("Label", "OK")) ]
        ]
    ]
];
```

### 纯 Slate 挂到游戏视口

```cpp
GEngine->GameViewport->AddViewportWidgetContent(
    SAssignNew(MyWidgetPtr, SWeakWidget).PossiblyNullContent(MyInnerWidget),
    /*ZOrder=*/10);

// 移除
GEngine->GameViewport->RemoveViewportWidgetContent(MyWidgetPtr.ToSharedRef());
GEngine->GameViewport->RemoveAllViewportWidgets();
```

**陷阱**：`GEngine` 与 `GEngine->GameViewport` 均可能为 NULL，必须判空。

## 常用 Widget 速查

| 用途 | UMG (UWidget) | Slate (SWidget) |
|------|---------------|-----------------|
| 按钮 | `UButton` | `SButton` |
| 文本 | `UTextBlock` | `STextBlock` |
| 图片 | `UImage` | `SImage` |
| 自由定位 | `UCanvasPanel` | `SCanvas` |
| 叠放 | `UOverlay` | `SOverlay` |
| 垂直布局 | `UVerticalBox` | `SVerticalBox` |
| 水平布局 | `UHorizontalBox` | `SHorizontalBox` |
| 滚动 | `UScrollBox` | `SScrollBox` |
| 进度条 | `UProgressBar` | `SProgressBar` |
| 输入框 | `UEditableText(Box)` | `SEditableText(Box)` |

布局规则：`CanvasPanel` 用绝对锚点（HUD 定位），`VerticalBox/HorizontalBox` 自动排列，`Overlay` 按 Z 叠放。**优先用 Box/Overlay 做自适应布局，只在必要时使用 Canvas。**

## 属性绑定（UMG Bindings）

两种方式，优先第二种：

1. **蓝图 Bind**（编辑器里 Property Binding 下拉选函数）：便利但每帧调用，规模化后开销明显。
2. **Event-driven 刷新**：在数据变化的事件里主动 `TextBlock->SetText(...)` / `ProgressBar->SetPercent(...)`。生产代码首选。

C++ 侧访问子控件：用 `meta=(BindWidget)`，命名须与 WidgetBlueprint 中完全一致：

```cpp
UPROPERTY(meta = (BindWidget)) UTextBlock* HealthText;
UPROPERTY(meta = (BindWidget)) UButton*    StartButton;

virtual void NativeConstruct() override
{
    Super::NativeConstruct();
    StartButton->OnClicked.AddDynamic(this, &UMyHUD::HandleStart);
}
```

## 样式与 SlateBrush / StyleSet

- `FSlateBrush`：描述一段绘制资源（图片/纯色/Box/Border），UMG 中多数控件有 `Style`/`Background Brush` 属性。
- `FSlateBoxBrush`：九宫格拉伸，按钮背景首选。
- `FSlateNoResource()`：显式透明，常用于覆盖默认背景。
- **Style Set**：在 C++ 中集中注册样式键，按 `"ToolBar.Background"`、`"ToolBarButton.Hovered"` 等字符串取用，便于换肤与复用：

```cpp
Set("ToolBar.Background",       FSlateBoxBrush(TEXT("Common/GroupBorder"), FMargin(4.f/16.f)));
Set("ToolBarButton.Hovered",    FSlateBoxBrush(TEXT("Old/MenuItemButton_Hovered"), 4.f/32.f));
Set("ToolBarButton.LabelFont",  FSlateFontInfo(TEXT("Roboto-Regular"), 8));
```

游戏内 UMG 更常走 DataAsset + `UCommonUI`（UE5 新推）管理样式；简单项目直接在 WidgetBlueprint 中配置 `FSlateBrush` 即可。

## 输入与焦点

- 添加到视口后，要让 UI 接收键鼠，需在 PlayerController 里切输入模式：
  - `SetInputModeUIOnly()` / `SetInputModeGameAndUI()` / `SetInputModeGameOnly()`
  - `bShowMouseCursor = true;`
- 键盘焦点：`Widget->SetKeyboardFocus()` 或 `FSlateApplication::Get().SetUserFocus(...)`；手柄导航走 `SetUserFocus` + `Navigation` 属性。
- UMG 控件重写 `NativeOnKeyDown` / `NativeOnFocusReceived` 拦截输入。
- Slate 通过 `OnKeyDown` / `OnMouseButtonDown` 等虚函数处理，返回 `FReply::Handled()` 阻止冒泡。

## 注意事项

- **UObject GC**：C++ 持有 `UUserWidget*` 必须 `UPROPERTY()`，否则会被 GC 释放导致崩溃。
- **Slate 资源所有权**：Slate 使用 `TSharedPtr/TSharedRef`，永远用 `SNew` / `SAssignNew` 创建，不要 `new SButton()`。
- **`meta=(BindWidget)` 命名必须一致**，否则编译期蓝图校验报错；可用 `BindWidgetOptional` 兼容可选控件。
- **Z-Order**：`AddToViewport(ZOrder)` / `AddViewportWidgetContent(widget, ZOrder)`，ZOrder 越大越靠上。
- **每帧 Tick**：UMG 的 `NativeTick` 默认开启，但大量 widget 开 Tick 会掉性能；优先事件驱动刷新。
- **Property Binding 性能**：每个 bind 每帧都会执行蓝图函数，界面元素多时用 C++/事件驱动替代。
- **移除**：`RemoveFromParent()`（UMG）/ `RemoveViewportWidgetContent()`（Slate），移除不等于销毁，Widget 对象仍在直到无引用。
- **调试**：用 Slate Widget Reflector（编辑器 Window → Developer Tools → Widget Reflector）定位布局与命中测试问题。

## 组合提示

- 与 `PlayerController` 配合：UI 通常由 PC 在 `BeginPlay` 里 `CreateWidget` + `AddToViewport`。
- 与 `GameMode` / `GameState`：数据源通过委托（`DECLARE_DYNAMIC_MULTICAST_DELEGATE`）推送给 UMG 事件刷新。
- 与 **Enhanced Input**：菜单打开时切 UI 输入模式并暂停游戏 Input Mapping Context。
- 与 **CommonUI (UE5)**：推荐用于多输入设备（手柄/触屏/键鼠）、栈式菜单管理、样式集中化。
- 与 **Slate Widget Reflector**：定位 widget 层级、命中测试、样式来源。
