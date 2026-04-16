---
name: harmony-data-persistence
description: "HarmonyOS 数据持久化：Preferences(KV)、RelationalStore(关系型)、文件管理、DataShare。"
tech_stack: [harmonyos]
language: [arkts]
---

# HarmonyOS 数据持久化

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/app-file-access
> 版本基准：HarmonyOS 5 / API 12+

## 用途

提供四种数据持久化方案：KV 键值存储（Preferences）、关系型数据库（RelationalStore）、文件读写（@ohos.file.fs）、跨应用数据共享（DataShareExtensionAbility），覆盖从轻量配置到结构化数据到二进制文件的全场景需求。

## 何时使用

- 保存用户设置、登录态、主题偏好等轻量配置 -> Preferences
- 需要复杂查询、关联关系、事务保障的业务数据 -> RelationalStore
- 读写图片、日志、缓存等二进制/大文本文件 -> @ohos.file.fs
- 向其他应用暴露结构化数据（类似 Android ContentProvider） -> DataShareExtensionAbility

## 存储方案选型指南

| 维度 | Preferences | RelationalStore | 文件 fs |
|---|---|---|---|
| 数据模型 | Key-Value | SQL 表 | 字节流 |
| 典型数据量 | < 1 万条，总量 < 50 MB | 无硬上限（单条 < 2 MB） | 无限制 |
| 查询能力 | 仅按 key 读取 | SQL + RdbPredicates | 无（自行解析） |
| 事务 | 无 | 支持 ACID | 无 |
| 多进程安全 | 不支持 | 支持 | 需自行加锁 |
| 性能特征 | 全量加载到内存，读快写需 flush | 基于 SQLite，读写均走磁盘 IO | 取决于文件大小 |
| 适用场景 | 设置项、Token、开关 | 订单、联系人、聊天记录 | 图片、日志、缓存文件 |

**选型口诀**：配置用 Preferences，结构化用 RDB，二进制用文件。

## Preferences（轻量 KV 存储）

### 核心概念

Preferences 将数据全量加载到内存，读操作直接命中内存；写操作先改内存缓存，必须调用 `flush()` 才会持久化到磁盘文件。

### 完整 CRUD 示例

```typescript
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';

// ---------- 初始化 ----------
const context = getContext(this) as common.UIAbilityContext;
const options: preferences.Options = { name: 'app_settings' };
const store = preferences.getPreferencesSync(context, options);

// ---------- 写入（Create / Update） ----------
store.putSync('theme', 'dark');
store.putSync('fontSize', 16);
store.putSync('isFirstLaunch', false);
await store.flush();  // 必须 flush，否则进程被杀时数据丢失

// ---------- 读取（Read） ----------
const theme = store.getSync('theme', 'light');          // 第二参数为默认值
const fontSize = store.getSync('fontSize', 14);
const hasKey = store.hasSync('theme');                   // 判断 key 是否存在

// ---------- 删除（Delete） ----------
store.deleteSync('isFirstLaunch');
await store.flush();

// ---------- 销毁整个文件 ----------
preferences.deletePreferences(context, options);
```

### 关键约束

| 约束项 | 限制值 |
|---|---|
| Key 长度 | 非空字符串，最大 1024 字节 |
| Value（string） | UTF-8 编码，最大 16 MB |
| 推荐条目数 | <= 10000 条 |
| 推荐总数据量 | <= 50 MB（超出后同步接口会卡主线程） |
| 多进程 | 不支持，存在文件损坏风险 |

## RelationalStore（关系型数据库）

### 核心概念

基于 SQLite 封装，通过 `getRdbStore` 获取数据库实例，使用 SQL 或 `RdbPredicates` 进行 CRUD。支持事务、索引、多表关联。

### 完整 CRUD 示例

```typescript
import { relationalStore } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { ValuesBucket } from '@kit.ArkData';

const context = getContext(this) as common.UIAbilityContext;

// ---------- 建库建表 ----------
const STORE_CONFIG: relationalStore.StoreConfig = {
  name: 'contacts.db',
  securityLevel: relationalStore.SecurityLevel.S1
};
const SQL_CREATE = `CREATE TABLE IF NOT EXISTS contact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  created_at INTEGER
)`;

const db = await relationalStore.getRdbStore(context, STORE_CONFIG);
db.executeSql(SQL_CREATE);

// ---------- 插入（Create） ----------
const row: ValuesBucket = {
  name: '张三',
  phone: '13800138000',
  created_at: Date.now()
};
const rowId = await db.insert('contact', row);

// ---------- 查询（Read） ----------
const predicates = new relationalStore.RdbPredicates('contact');
predicates.equalTo('name', '张三');
// predicates.like('phone', '%138%');
// predicates.orderByDesc('created_at').limitAs(20);

const resultSet = await db.query(predicates, ['id', 'name', 'phone']);
while (resultSet.goToNextRow()) {
  const id = resultSet.getLong(resultSet.getColumnIndex('id'));
  const name = resultSet.getString(resultSet.getColumnIndex('name'));
  const phone = resultSet.getString(resultSet.getColumnIndex('phone'));
}
resultSet.close();  // 必须关闭，否则内存泄漏

// ---------- 更新（Update） ----------
const updateValues: ValuesBucket = { phone: '13900139000' };
const updatePredicates = new relationalStore.RdbPredicates('contact');
updatePredicates.equalTo('id', rowId);
await db.update(updateValues, updatePredicates);

// ---------- 删除（Delete） ----------
const deletePredicates = new relationalStore.RdbPredicates('contact');
deletePredicates.equalTo('id', rowId);
await db.delete(deletePredicates);

// ---------- 事务 ----------
try {
  db.beginTransaction();
  await db.insert('contact', { name: 'A', phone: '111', created_at: Date.now() });
  await db.insert('contact', { name: 'B', phone: '222', created_at: Date.now() });
  db.commit();
} catch (e) {
  db.rollBack();
}
```

### SecurityLevel 安全等级

| 等级 | 说明 | 示例 |
|---|---|---|
| S1 | 低 -- 一般数据 | 壁纸、系统设置 |
| S2 | 中 -- 用户生成数据 | 录音、通话记录 |
| S3 | 高 -- 敏感数据 | 运动健康、位置轨迹 |
| S4 | 关键 -- 认证/财务数据 | 密钥、支付信息 |

### 关键约束

- 单条数据建议 < 2 MB（超过可插入但读取会失败）
- 单次查询建议 < 5000 条（大数据量请分批）
- ResultSet 用完必须 `close()`

## 文件管理（@ohos.file.fs）

### 基础读写

```typescript
import { fileIo as fs } from '@kit.CoreFileKit';
import { common } from '@kit.AbilityKit';

const context = getContext(this) as common.UIAbilityContext;
const filePath = context.filesDir + '/data.txt';

// 写文件
const file = fs.openSync(filePath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
fs.writeSync(file.fd, 'Hello HarmonyOS');
fs.closeSync(file);

// 读文件
const readFile = fs.openSync(filePath, fs.OpenMode.READ_ONLY);
const buf = new ArrayBuffer(4096);
const bytesRead = fs.readSync(readFile.fd, buf);
fs.closeSync(readFile);
const content = String.fromCharCode(...new Uint8Array(buf.slice(0, bytesRead)));

// 文件信息
const stat = fs.statSync(filePath);  // size, mtime 等
const exists = fs.accessSync(filePath);

// 删除
fs.unlinkSync(filePath);
```

### 沙箱目录

| 路径属性 | 用途 | 卸载清除 |
|---|---|---|
| `context.filesDir` | 应用私有文件 | 是 |
| `context.cacheDir` | 缓存，系统可能自动清理 | 是 |
| `context.tempDir` | 临时文件 | 是 |

**性能提示**：大文件读写使用异步 API（`fs.open()`、`fs.read()`）避免阻塞主线程。

## DataShareExtensionAbility（跨应用数据共享）

### 架构

```
数据提供方（Provider）            数据访问方（Accessor）
DataShareExtensionAbility   <-->  DataShareHelper
  实现 insert/delete/             通过 createDataShareHelper()
  update/query                    调用 Provider 暴露的接口
```

通过 IPC 通信，Provider 选择性实现 CRUD 和文件打开接口。

### 数据访问方用法

```typescript
import { dataShare } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';

const context = getContext(this) as common.UIAbilityContext;
const uri = 'datashare:///com.example.provider/contacts';
const helper = await dataShare.createDataShareHelper(context, uri);

// 查询
const predicates = new dataShare.DataSharePredicates();
predicates.equalTo('name', '张三');
const resultSet = await helper.query(uri, predicates, ['id', 'name']);
```

### 注意事项

- Provider 必须在 module.json5 中声明 `extensionAbilities`（type 为 dataShare）
- 需要在配置中声明读写权限（readPermission / writePermission）
- 仅适用于需要跨应用暴露数据的场景，应用内数据共享直接用 RelationalStore

## 常见陷阱

1. **Preferences 不调 flush 数据丢失** -- `put` 只写内存缓存，必须 `await flush()` 才持久化。进程被杀前未 flush 的数据全部丢失
2. **Preferences 不支持多进程** -- 多进程并发操作同一文件会导致文件损坏和数据丢失，如需多进程共享数据请用 RelationalStore
3. **Preferences 大数据卡主线程** -- 数据量超过 50 MB 时，同步接口（getPreferencesSync）会阻塞 UI，导致 app freeze
4. **ResultSet 忘记 close** -- RelationalStore 的 ResultSet 持有底层游标资源，不关闭会内存泄漏
5. **RDB 单条数据超 2 MB** -- 可以插入成功但读取会失败，大二进制数据应存文件系统，数据库只存路径
6. **Preferences 非 UTF-8 字符串损坏文件** -- string 类型 Value 必须是 UTF-8 编码，含非 UTF-8 字符时请改用 Uint8Array 类型存储
7. **文件操作不关闭 fd** -- `openSync` 打开的文件描述符必须手动 `closeSync`，否则 fd 泄漏
8. **deletePreferences 与其他操作并发** -- 不允许 deletePreferences 与其他 Preferences 接口多线程并发调用，会导致不可预期行为
