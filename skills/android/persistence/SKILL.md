---
name: android-persistence
description: Android 本地持久化：Room（SQLite ORM）与 DataStore（键值 / 类型化对象）
tech_stack: [android]
language: [kotlin, java]
capability: [local-storage, relational-db]
version: "Room 2.8.4; DataStore 1.2.1"
collected_at: 2026-04-18
---

# Android 持久化（Room + DataStore）

> 来源：https://developer.android.com/training/data-storage/room , https://developer.android.com/topic/libraries/architecture/datastore

## 用途
Room 在 SQLite 上提供 ORM 抽象层：编译期 SQL 校验、注解式 DAO、迁移工具。DataStore 用 Kotlin 协程 + Flow 异步事务化地持久化键值对或类型化对象（Proto / JSON），替代 `SharedPreferences`。

## 何时使用
- 结构化数据、离线缓存、复杂查询、表连接、分页 → **Room**
- 轻量 key-value、用户设置、少量类型化对象 → **DataStore**
- 需要部分更新、引用完整性 → **Room**（DataStore 不支持）
- 迁移遗留 `SharedPreferences` → Preferences DataStore

## 基础用法

**Room 完整示例**
```kotlin
@Entity(tableName = "users")
data class User(
    @PrimaryKey val uid: Int,
    @ColumnInfo(name = "first_name") val firstName: String?,
    @ColumnInfo(name = "last_name") val lastName: String?
)

@Dao
interface UserDao {
    @Query("SELECT * FROM users") fun getAll(): List<User>
    @Query("SELECT * FROM users WHERE uid IN (:ids)") fun loadByIds(ids: IntArray): List<User>
    @Insert(onConflict = OnConflictStrategy.REPLACE) fun insertAll(vararg users: User)
    @Delete fun delete(user: User)
}

@Database(entities = [User::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
}

val db = Room.databaseBuilder(appContext, AppDatabase::class.java, "app.db").build()
```

Gradle（KSP 二选一，不要与 annotationProcessor 并用）：
```kotlin
implementation("androidx.room:room-runtime:2.8.4")
implementation("androidx.room:room-ktx:2.8.4")
ksp("androidx.room:room-compiler:2.8.4")
```

**Preferences DataStore**
```kotlin
val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")
val EXAMPLE_COUNTER = intPreferencesKey("example_counter")

fun counterFlow(): Flow<Int> = context.dataStore.data.map { it[EXAMPLE_COUNTER] ?: 0 }

suspend fun increment() {
    context.dataStore.updateData { prefs ->
        prefs.toMutablePreferences().apply {
            set(EXAMPLE_COUNTER, (this[EXAMPLE_COUNTER] ?: 0) + 1)
        }
    }
}
```

**Typed DataStore (JSON / Proto)**
```kotlin
val Context.dataStore: DataStore<Settings> by dataStore(
    fileName = "settings.json",
    serializer = SettingsSerializer,
)
```

## 关键 API

**Room 实体**
- `@Entity(tableName=..., indices=[Index(...)], primaryKeys=[...])`
- `@PrimaryKey(autoGenerate = true)` / 复合主键用 `@Entity(primaryKeys=[...])`
- `@ColumnInfo(name=...)`、`@Ignore`、`@Fts4`（全文检索，主键必须 `INTEGER rowid`）

**Room DAO**
- `@Insert(onConflict = OnConflictStrategy.REPLACE)` 返回 `Long` 或 `List<Long>`（新 rowId）
- `@Update` / `@Delete`（按主键匹配）
- `@Query("SELECT ... WHERE x = :arg")`，参数支持 `:arg`、`IN (:list)`
- 返回类型：`List<T>`、`Flow<T>`、`LiveData<T>`、`PagingSource<Int, T>`、`Map<K, List<V>>`（Room 2.4+）、`Cursor`（不推荐）

**DataStore 接口**
- `val data: Flow<T>` 读
- `suspend fun updateData(transform: suspend (T) -> T): T` 原子写
- `MultiProcessDataStoreFactory.create(...)` 跨进程
- `ReplaceFileCorruptionHandler { defaultValue }` 处理损坏

## 注意事项
- Room 在单进程应保持 `AppDatabase` 单例，实例昂贵；多进程开启 `enableMultiInstanceInvalidation()`
- KSP 与 annotationProcessor **不能同时**使用
- 不推荐 Room 返回 `Cursor`，无法保证行存在
- DataStore：**同一文件同一进程仅能创建一个 `DataStore` 实例**；不得混用 `SingleProcessDataStore` 与 `MultiProcessDataStore`
- `DataStore<T>` 的 T 必须不可变
- 主线程同步 IO 会 ANR；用协程预加载 `dataStore.data.first()`
- `@AutoValue` 实体（Java）在 Room 2.1+ 上使用时，注解必须加 `@CopyAnnotations`

## 组合提示
- Room + Paging 3：DAO 返回 `PagingSource<Int, T>`
- Room + Flow / LiveData：表变更自动推送
- DataStore + Hilt：作为 `@Singleton` 注入
