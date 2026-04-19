---
name: godot4-csharp
description: Godot 4 中使用 C#/.NET 编写脚本的环境配置、API 规范、信号与属性导出、跨语言互操作要点
tech_stack: [godot4]
language: [csharp]
capability: [game-rendering, game-physics, game-input]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 C#/.NET 脚本

> 来源：
> - https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html
> - https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html
> - https://docs.godotengine.org/en/stable/tutorials/scripting/cross_language_scripting.html

## 用途
在 Godot 4 中以 C# 代替/混合 GDScript 编写节点脚本，获得静态类型、泛型与 .NET 生态（NuGet）支持。

## 何时使用
- 团队熟悉 C#/.NET，希望用强类型语言替代 GDScript
- 需要复用 .NET 生态（NuGet 包、现有业务库）
- 对关键路径需要 JIT/AOT 性能表现
- 混合项目：部分节点 GDScript、部分节点 C# 互操作
- **不适用**：需要导出到 Web 平台（Godot 4 C# 不支持 Web；Android/iOS 为实验性）

## 环境前提
1. 下载 Godot 的 **.NET 版本**编辑器（标准版不含 C# 支持）
2. 安装 **.NET SDK 8+**（Godot 4.5/4.6 要求；导出 Android 需 .NET 9+），64 位版本需与 Godot 位数一致
3. 外部编辑器推荐：**Rider**（2024.2+ 内置 Godot 支持）、**VS Code**（装 C# 扩展）、**Visual Studio 2022**
4. Godot → Editor Settings → Dotnet → Editor → External Editor 选择对应 IDE

## 基础用法

创建脚本时 Godot 自动生成 `.sln` 与 `.csproj`（`.godot/mono` 之外均需提交 VCS）。**类名必须与 `.cs` 文件名一致**，否则报 `Cannot find class XXX for script`。

```csharp
using Godot;

public partial class YourCustomClass : Node
{
    private int _a = 2;

    public override void _Ready()
    {
        GD.Print("Hello from C# to Godot :)");
    }

    public override void _Process(double delta)
    {
        // 每帧调用
    }
}
```

## 关键 API（摘要）

| 项 | 说明 |
|----|------|
| `public partial class X : Node` | 所有 Godot 脚本类必须是 `partial`，且继承自 `GodotObject` 派生类型 |
| `GD.Print / GD.PrintErr / GD.Randf / GD.Load<T>` | GDScript 全局函数在 `Godot.GD` 静态类下 |
| `[Export] public int Speed { get; set; }` | 暴露属性到 Inspector（需重新 Build 才可见） |
| `[Signal] public delegate void MySignalEventHandler(...)` | 声明信号，委托名必须以 `EventHandler` 结尾 |
| `EmitSignal(SignalName.MySignal, args)` | 触发信号，优先用 `SignalName.*` 生成常量避免字符串分配 |
| `node.MySignal += Handler;` | C# 端连接自定义信号（类型安全） |
| `node.Connect("sig_name", Callable.From(Handler))` | 连接 GDScript 信号或动态名信号 |
| `await ToSignal(timer, Timer.SignalName.Timeout)` | 异步等待信号 |
| `obj.Call("snake_case_name", args)` / `obj.Get("name")` / `obj.Set("name", v)` | 调用引擎 API 或 GDScript 成员时需用原始 snake_case 名 |
| `PropertyName.X / MethodName.Y / SignalName.Z` | 内置 `StringName` 常量，避免重复分配 |
| PascalCase API | C# 侧所有 Godot API 字段/方法为 PascalCase（GDScript 为 snake_case） |

## 导出属性与信号示例

```csharp
public partial class Player : CharacterBody2D
{
    [Export] public float Speed { get; set; } = 300f;
    [Export] public NodePath TargetPath { get; set; }

    [Signal] public delegate void HealthChangedEventHandler(int newHp);

    public override void _Ready()
    {
        HealthChanged += hp => GD.Print($"HP={hp}");
        EmitSignal(SignalName.HealthChanged, 100);
    }
}
```

## 跨语言互操作

**C# 调 GDScript**（反射式，无静态类型）：
```csharp
var gdScript = GD.Load<GDScript>("res://foo.gd");
var node = (GodotObject)gdScript.New();
node.Call("print_n_times", "hi", 2);
node.Get("my_property");
node.Set("my_property", "v");
node.Connect("my_signal", Callable.From(MyHandler));
```

**GDScript 调 C#**（直接，marshaller 自动转型）：
```gdscript
var Cs = load("res://MyCSharpNode.cs")
var n = Cs.new()
n.PrintNTimes("hi", 2)
n.MySignal.connect(my_handler)
```

**继承限制**：GDScript 与 C# 之间**不能**互相继承。

## 注意事项

- **Struct 属性陷阱**：`Position.X = 100` 报 CS1612。结构体是值类型，属性 getter 返回副本。改用：
  ```csharp
  Position = Position with { X = 100f };   // C# 10+
  // 或
  var p = Position; p.X = 100f; Position = p;
  ```
- **Build 才可见**：新增 `[Export]` / `[Signal]` 或 tool 脚本改动后，必须点击编辑器右上 **Build** 才能在 Inspector 看到。
- **原生互操作开销**：`GodotObject` 派生类型的属性读写都会跨越 C++ 边界。循环中多次读写请先缓存到局部变量：
  ```csharp
  var p = Position;
  for (int i=0;i<10;i++) { p += new Vector3(i,i,0); }
  Position = p;
  ```
- **snake_case API 名**：`Call`/`CallDeferred`/`Connect`/`Get`/`Set` 直接传字符串时，引擎 API 必须用原生 `snake_case`（如 `CallDeferred("add_child")`，而非 `"AddChild"`）。自定义成员不受此限制。
- **StringName 分配**：高频路径用 `PropertyName.Position`、`SignalName.Timeout` 等预生成常量替代字符串字面量。
- **热重载**：非 `[Export]` 字段状态不会在热重载中保留。
- **平台**：桌面三平台全支持；Android / iOS (4.2+) 实验性；**Web 平台不支持**。
- **VCS**：提交 `.sln` / `.csproj` / 工程源；忽略整个 `.godot/` 目录（含 `.godot/mono`，故障时可删除让其重建）。
- **NuGet 错误** `Unable to find package Godot.NET.Sdk`：删掉 `%AppData%\NuGet\NuGet.Config` 让其重建默认配置。

## 组合提示

- 与 GDScript 混编：公共接口暴露在 C# 侧（静态类型），业务原型可在 GDScript 侧快速迭代
- NuGet：在 `.csproj` 中直接 `<PackageReference>`，Godot 会在下次 Build 时还原
- VS Code 调试：配合 `launch.json`（`type: coreclr`, `program: ${env:GODOT4}`） + `tasks.json`（`dotnet build`）
