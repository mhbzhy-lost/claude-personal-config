---
name: compose-persistence
description: 在 Jetpack Compose 应用中用 Room 做结构化存储、DataStore 做键值/类型化偏好，并通过 Flow + StateFlow 驱动 UI
tech_stack: [compose, android, room, datastore]
language: [kotlin]
capability: [local-storage, relational-db]
version: "datastore 1.2.1; lifecycle-compose 2.7.0+; room (project-pinned)"
collected_at: 2026-04-18
---

# Compose 持久化（Room + DataStore）

> 来源：developer.android.com codelabs persisting-data-room / update-data-room · architecture/datastore · architecture/compose (Lifecycle Compose)

## 用途
Compose 应用本地存储双栈：
- **Room**：SQLite 之上的类型安全 ORM，用于结构化/关联数据，编译期校验 SQL。
- **DataStore**：协程 + Flow 的键值（Preferences）或类型化（Proto/JSON）存储，替代 `SharedPreferences`。

## 何时使用
- 需要事务、关系、复杂查询、部分更新 → Room
- 只存小量偏好/设置/标志位 → DataStore
- UI 需随数据变化自动刷新（LazyColumn 展示列表） → DAO 返回 `Flow`，ViewModel `stateIn` 暴露 `StateFlow`
- 需要 Lifecycle 事件钩子驱动 Compose → `LifecycleEventEffect` / `LifecycleStartEffect` / `LifecycleResumeEffect`

## 基础用法

### Room：Entity / DAO / Database
```kotlin
@Entity(tableName = "items")
data class Item(@PrimaryKey(autoGenerate = true) val id: Int = 0,
                val name: String, val price: Double, val quantity: Int)

@Dao
interface ItemDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(item: Item)
    @Update suspend fun update(item: Item)
    @Delete suspend fun delete(item: Item)
    @Query("SELECT * FROM items WHERE id = :id") fun getItem(id: Int): Flow<Item>
    @Query("SELECT * FROM items ORDER BY name ASC") fun getAllItems(): Flow<List<Item>>
}

@Database(entities = [Item::class], version = 1, exportSchema = false)
abstract class InventoryDatabase : RoomDatabase() {
    abstract fun itemDao(): ItemDao
    companion object {
        @Volatile private var Instance: InventoryDatabase? = null
        fun getDatabase(context: Context) = Instance ?: synchronized(this) {
            Room.databaseBuilder(context, InventoryDatabase::class.java, "item_database")
                .fallbackToDestructiveMigration().build().also { Instance = it }
        }
    }
}
```

### ViewModel 暴露 StateFlow
```kotlin
val homeUiState: StateFlow<HomeUiState> =
    itemsRepository.getAllItemsStream().map { HomeUiState(it) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(TIMEOUT_MILLIS),
            initialValue = HomeUiState()
        )
```
Composable：`val state by viewModel.homeUiState.collectAsState()`。

### DataStore — Preferences
```kotlin
val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")
val EXAMPLE_COUNTER = intPreferencesKey("example_counter")

fun counterFlow() = context.dataStore.data.map { it[EXAMPLE_COUNTER] ?: 0 }

suspend fun increment() = context.dataStore.updateData {
    it.toMutablePreferences().also { p -> p[EXAMPLE_COUNTER] = (p[EXAMPLE_COUNTER] ?: 0) + 1 }
}
```

### DataStore — 类型化（JSON 示例）
```kotlin
@Serializable data class Settings(val exampleCounter: Int)
object SettingsSerializer : Serializer<Settings> {
    override val defaultValue = Settings(0)
    override suspend fun readFrom(input: InputStream) =
        try { Json.decodeFromString<Settings>(input.readBytes().decodeToString()) }
        catch (e: SerializationException) { throw CorruptionException("Unable to read Settings", e) }
    override suspend fun writeTo(t: Settings, output: OutputStream) {
        output.write(Json.encodeToString(t).encodeToByteArray())
    }
}
val Context.dataStore by dataStore(fileName = "settings.json", serializer = SettingsSerializer)
```

## 关键 API
- Room：`@Entity`、`@Dao`、`@Insert/@Update/@Delete/@Query`、`@Database`、`Room.databaseBuilder`、`Room.inMemoryDatabaseBuilder`
- Room 配置：`.fallbackToDestructiveMigration()`、`.allowMainThreadQueries()`（仅测试）
- DataStore：`preferencesDataStore(name)`、`dataStore(fileName, serializer)`、`DataStore.data: Flow<T>`、`updateData { transform }`
- 多进程：`MultiProcessDataStoreFactory.create(serializer, produceFile, corruptionHandler)`
- 容错：`ReplaceFileCorruptionHandler { defaultValue }`
- Flow → State：`Flow.stateIn(scope, SharingStarted.WhileSubscribed(5_000), initial)`、`StateFlow.collectAsState()`
- Lifecycle Compose：`LifecycleEventEffect(Event.ON_START) { }`、`LifecycleStartEffect { onStopOrDispose { } }`、`LifecycleResumeEffect { onPauseOrDispose { } }`、`lifecycle.currentStateAsState()`

## 注意事项
- **DataStore 单例强约束**：同一文件同一进程只允许一个 `DataStore` 实例，否则读写时抛 `IllegalStateException`。用顶层委托 `by preferencesDataStore(...)` 以保持唯一。
- **DataStore 泛型必须不可变**：直接改 `updateData` 返回对象之外的副本会破坏一致性，推荐 Proto 或 `@Serializable data class`。
- 不要混用 `SingleProcessDataStore` 与 `MultiProcessDataStore`，跨进程必须用后者。
- **禁止在 UI 线程阻塞读 DataStore**，会 ANR；`runBlocking { dataStore.data.first() }` 只用于必要的同步冷启动，并应配合 `lifecycleScope` 预热。
- `updateData` 是原子事务，block 内代码作为一次读-改-写执行。
- **`LifecycleEventEffect` 不能监听 `ON_DESTROY`**——composition 在此之前已结束。
- `LifecycleStartEffect` 的 `onStopOrDispose` 必填，不需要清理时改用 `LifecycleEventEffect(ON_START)`。
- Room DAO 返回 `Flow` 时只需调用一次，Room 会在底层数据变化时自动重发。
- 测试用 `Room.inMemoryDatabaseBuilder` + `allowMainThreadQueries()`，真机跑 `AndroidJUnit4`。
- 迁移旧 `SharedPreferences` 代码优先考虑 Preferences DataStore。

## 组合提示
常与 `compose-networking`（远端数据 → Room 缓存 → UI）、`viewModel()` + `AppViewModelProvider.Factory`、Navigation Compose 组合；列表展示用 `LazyColumn + collectAsState`。
