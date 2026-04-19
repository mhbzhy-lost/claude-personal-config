---
name: unreal5-asset-management
description: Unreal Engine 5 资产管理系统——Asset Manager、Primary Asset、异步加载、软/硬引用与 Asset Bundle 的使用规范
tech_stack: [unreal5]
language: [cpp, blueprint]
capability: [local-storage, state-management]
version: "unreal-engine unversioned"
collected_at: 2026-04-19
---

# Unreal Engine 5 资产管理（Asset Management）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/asset-management-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/content-browser-in-unreal-engine

## 用途
在 UE5 的自动加载机制之外，提供对资产「何时发现、何时加载、何时卸载、如何分块打包（Chunk/Cook）」的精确控制，用于大型项目的内存/磁盘审计与按需流式加载。

## 何时使用
- 需要按 ID 精准加载/卸载资产（角色、关卡、装备、剧情配置等运行时动态内容）。
- 项目要做 Cook 分块（Chunking）以减小初始包体或实现分发下载。
- 需要审计资产依赖、内存占用与引用链。
- 希望用软引用 `TSoftObjectPtr` 避免硬引用把整条资产图拉进内存。
- 需要按"场景/模式"（Asset Bundle）分批加载同一 Primary Asset 下的不同子资源（如 Menu 版 vs. Gameplay 版）。

## 核心概念

### Primary vs Secondary Asset
- **Primary Asset**：Asset Manager 可直接用 `FPrimaryAssetId` 操作。默认只有 `UWorld`（关卡）是 Primary；其他类想成为 Primary 必须在其 UClass 重写 `GetPrimaryAssetId()` 返回有效的 `FPrimaryAssetId`。
- **Secondary Asset**：由 Primary Asset 引用而被引擎自动拉起的普通资产（材质、贴图、网格等），不被 Asset Manager 直接管理。
- **FPrimaryAssetId** = `PrimaryAssetType`（组名） + `PrimaryAssetName`（默认为 Content Browser 中的资产短名），例如 `MyGameZoneTheme:Forest`。

### 两种 Primary Asset 形式
| 形式 | 基类 | 适用 | 访问 API |
|------|------|------|----------|
| Blueprint Class Primary | `UPrimaryDataAsset` 的 BP 子类或重写 `GetPrimaryAssetId` 的 Actor 子类 | 需要实例化、或要 BP 子类继承 | `GetPrimaryAssetObjectClass`，BP 函数名带 `Class` |
| Non-Blueprint Primary (Data Asset) | `UPrimaryDataAsset` 的 C++ 子类，资产是类的**实例** | 纯数据、无需继承、内存更省 | `GetPrimaryAssetObject`，BP 函数名不带 `Class` |

纯数据且不实例化时，用 **Data-Only Blueprint** 继承 `UPrimaryDataAsset`。

### Asset Manager 与 Streamable Manager
- `UAssetManager`：全局单例，负责 Primary Asset 的扫描、注册、加载调度。可派生自定义类。
- `FStreamableManager`：实际执行异步加载，并通过 `FStreamableHandle` 持有引用直到不再需要；引擎中存在多个 Streamable Manager 实例。

### 软引用 vs 硬引用
- **硬引用**（`UStaticMesh*`、`TSubclassOf<T>`）：持有者被加载时目标被强制同步拉入内存，引发级联加载。
- **软引用**（`TSoftObjectPtr<T>`、`TSoftClassPtr<T>`、`FSoftObjectPath`）：只存路径，不触发加载；由 Asset Manager / Streamable Manager 按需异步加载。**大资产、可选资产、按 Bundle 分组的资产必须用软引用。**

### Asset Bundle
以 `meta = (AssetBundles = "BundleName")` 标记 `TSoftObjectPtr` 成员，把一个 Primary Asset 的不同软引用分组。加载 Primary Asset 时可指定要加载哪些 Bundle，实现"菜单态只加图标，战斗态再加网格/动画"的分阶段加载。

## 基础用法

### 1. 定义 Primary Data Asset
```cpp
UCLASS(Blueprintable)
class MYGAME_API UMyGameZoneTheme : public UPrimaryDataAsset
{
    GENERATED_BODY()
public:
    UPROPERTY(EditDefaultsOnly, Category=Zone)
    FText ZoneName;

    /** 菜单态要展示的缩略图——放进 Menu bundle */
    UPROPERTY(EditDefaultsOnly, meta = (AssetBundles = "Menu"))
    TSoftObjectPtr<UTexture2D> Thumbnail;

    /** 真正进入关卡才需要的网格——放进 Gameplay bundle */
    UPROPERTY(EditDefaultsOnly, meta = (AssetBundles = "Gameplay"))
    TSoftObjectPtr<UStaticMesh> Mesh;
};
```
保存为 `Forest.uasset` 后，PrimaryAssetId 自动为 `MyGameZoneTheme:Forest`。

### 2. 注册自定义 Asset Manager
`Config/DefaultEngine.ini`：
```ini
[/Script/Engine.Engine]
AssetManagerClassName=/Script/MyGame.MyGameAssetManager
```

### 3. 让 Asset Manager 扫描 Primary Asset
两种方式二选一：
- **Project Settings → Game → Asset Manager → Primary Asset Types to Scan**：配置类型名、基类、扫描目录、是否为 BP 类、Cook 规则。
- **代码注册**：在自定义 `UAssetManager::StartInitialLoading()` 中调用 `ScanPathsForPrimaryAssets(...)`。

### 4. 异步加载与卸载
```cpp
UAssetManager& Manager = UAssetManager::Get();
FPrimaryAssetId Id(TEXT("MyGameZoneTheme"), TEXT("Forest"));

TArray<FName> Bundles = { TEXT("Gameplay") };
TSharedPtr<FStreamableHandle> Handle = Manager.LoadPrimaryAsset(
    Id, Bundles,
    FStreamableDelegate::CreateLambda([Id]()
    {
        UObject* Obj = UAssetManager::Get().GetPrimaryAssetObject(Id);
        // 或 GetPrimaryAssetObjectClass<AMyActor>(Id) 取 BP 类
    }));

// 用完卸载
Manager.UnloadPrimaryAsset(Id);
```

### 5. 直接加载任意软引用（不走 Primary Asset）
```cpp
FStreamableManager& Streamable = UAssetManager::GetStreamableManager();
Streamable.RequestAsyncLoad(MeshPtr.ToSoftObjectPath(),
    FStreamableDelegate::CreateLambda([this]()
    {
        UStaticMesh* Loaded = MeshPtr.Get();
    }));
```

## 关键 API 摘要

### Asset Manager（`UAssetManager::Get()`）
- `ScanPathsForPrimaryAssets(Type, Paths, BaseClass, bHasBlueprintClasses, ...)` — 在启动时注册待扫描路径。
- `LoadPrimaryAsset(Id, Bundles, Delegate)` / `LoadPrimaryAssets(Ids, ...)` / `LoadPrimaryAssetsWithType(Type, ...)` — 异步加载并保持常驻。
- `UnloadPrimaryAsset(Id)` / `UnloadPrimaryAssets(Ids)` / `UnloadPrimaryAssetsWithType(Type)` — 释放引用。
- `GetPrimaryAssetObject(Id)` / `GetPrimaryAssetObjectClass<T>(Id)` — 加载完成后取对象/类。
- `GetPrimaryAssetIdList(Type, OutList)` / `GetPrimaryAssetPath(Id)` — 查询注册信息。
- `AddDynamicAsset(Id, AssetPath, BundleData)` — 运行时注册动态 Primary Asset。
- `ExtractSoftObjectPaths(Struct, Value, OutRefs, SkipProps)` — 从结构体抽取全部软引用路径。
- `RecursivelyExpandBundleData(BundleData)` — 递归展开 Bundle 依赖并触发加载。

### 可重写钩子（自定义 `UAssetManager` 子类）
- `StartInitialLoading()` — 启动扫描入口。
- `UpdateAssetBundleData(PrimaryAssetId, BundleData)` — 注入运行时 Bundle。
- `ModifyCook(...)` / `ModifyDLCCook(...)` — 定制 Cook/Chunk。

### Content Browser（编辑器）
- `Ctrl/Cmd + Space`：打开 Content Drawer（临时面板，失焦自动收起；点 Dock in Layout 钉住）。
- 至多同时打开 4 个 Content Browser 实例。
- 功能：文本+高级过滤、Collections（私有/本地/共享）、Migrate 跨项目迁移、问题资产识别。

## 注意事项
- **永远用软引用存放可选/大体量资产**。在 `UPROPERTY` 里写 `UStaticMesh*` 会让整条依赖链在 owner 被引用时同步加载，导致卡顿与内存膨胀。
- `TSoftObjectPtr::Get()` 在资产未加载时返回 `nullptr`；必须先 `RequestAsyncLoad` 或走 Asset Manager。`LoadSynchronous()` 可用但会阻塞主线程，慎用。
- `FStreamableHandle` **决定资产常驻内存**。丢弃 Handle 后资产可能被 GC；需要保持加载就持有 Handle 或使用 `LoadPrimaryAsset`（由 Asset Manager 替你持有）。
- `UPrimaryDataAsset` 自带 `GetPrimaryAssetId` 实现（用短名+原生类）；自行从 `UDataAsset` 派生时必须手动重写，否则 Asset Manager 看不到它。
- Asset Bundles 元标签 `meta = (AssetBundles = "X")` 只对 `TSoftObjectPtr` / `FSoftObjectPath` 生效，对硬引用无效。
- "Only Cook Production Assets" 勾选后，标记为 `DevelopmentCook` 的资产若被引用会在 Cook 时报错——用于防止测试资产混入发布包。
- `PrimaryAssetId/Type/Name Redirects` 用于资产改名/搬迁后保持旧存档/旧引用兼容，重命名资产类型或目录后记得补上 Redirect。
- 自定义 Asset Manager 类必须在 `DefaultEngine.ini` 的 `[/Script/Engine.Engine]` 下配置 `AssetManagerClassName=/Script/Module.UClassName`，否则引擎仍使用默认类。
- Chunking 基于 Primary Asset Rules 的 `ChunkId` 设置；同一 Secondary Asset 若被多个不同 Chunk 的 Primary 引用，会被拷贝到多个 Chunk（或按规则共享基础 Chunk）。

## 组合提示
- 常与 **Gameplay Ability System / DataTable / UDeveloperSettings** 配合：用 `UPrimaryDataAsset` 承载装备、技能、关卡配置。
- 与 **Level Streaming / World Partition** 配合：关卡本身是 Primary Asset，可通过 Asset Manager 预加载/卸载。
- 与 **PakFile / IoStore Chunk** 分发链路配合：Asset Manager 的 Chunk 配置直接决定打包产物分组，用于按需下载 / DLC。
- 调试：`MemReport -full`、`Obj List`、`AssetManager.DumpLoadedAssets`、`AssetManager.DumpBundlesForAsset` 控制台命令可审计加载状态。
