---
name: postgresql-json
description: "PostgreSQL JSONB 数据类型、操作符、索引策略、JSONPath 查询、聚合函数、关系表 vs JSONB 选型。"
tech_stack: [postgresql]
---

# PostgreSQL JSON（JSONB 完全指南）

> 来源：https://www.postgresql.org/docs/current/datatype-json.html
> 版本基准：PostgreSQL 16/17

## 用途

掌握 PostgreSQL JSONB 的存储、查询、索引和性能优化，在关系型模型中灵活处理半结构化数据。

## 何时使用

- 存储结构不固定或变化频繁的数据（用户配置、API 响应、事件 payload）
- 需要在关系表中嵌入嵌套结构而无需 JOIN
- 全文档查询、路径匹配、包含检测场景
- 原型开发阶段，schema 尚未稳定

## json vs jsonb

| 维度 | `json` | `jsonb` |
|------|--------|---------|
| 存储格式 | 原始文本 | 二进制分解 |
| 读取性能 | 每次需重新解析 | 直接读取，更快 |
| 写入性能 | 稍快（无解析开销） | 稍慢（需解析后存储） |
| 空白/顺序 | 保留 | 不保留 |
| 重复键 | 全部保留 | 只保留最后一个 |
| 索引支持 | 不支持 GIN | 完整支持 |
| 等值比较 | 不支持 | 支持 |

**结论**：除非必须保留键顺序或空白格式，一律使用 `jsonb`。

## 操作符全览

### 基础访问操作符

```sql
-- -> 返回 jsonb 类型（用于链式访问）
SELECT '{"user": {"name": "Alice", "age": 30}}'::jsonb -> 'user';
-- 结果：{"name": "Alice", "age": 30}

-- ->> 返回 text 类型（用于最终取值）
SELECT '{"user": {"name": "Alice"}}'::jsonb -> 'user' ->> 'name';
-- 结果：Alice（text 类型）

-- -> 用数字索引访问数组
SELECT '["a", "b", "c"]'::jsonb -> 1;
-- 结果："b"

-- ->> 负数索引从末尾访问
SELECT '["a", "b", "c"]'::jsonb ->> -1;
-- 结果：c
```

### 路径操作符

```sql
-- #> 路径访问，返回 jsonb
SELECT '{"a": {"b": {"c": 42}}}'::jsonb #> '{a,b,c}';
-- 结果：42

-- #>> 路径访问，返回 text
SELECT '{"a": {"b": {"c": 42}}}'::jsonb #>> '{a,b,c}';
-- 结果：42（text 类型）

-- 数组路径访问
SELECT '{"items": [{"id": 1}, {"id": 2}]}'::jsonb #> '{items,0,id}';
-- 结果：1
```

### 包含与存在操作符

```sql
-- @> 包含（左侧包含右侧的结构）—— 可被 GIN 索引加速
SELECT '{"name": "Alice", "roles": ["admin", "user"]}'::jsonb
    @> '{"roles": ["admin"]}'::jsonb;
-- 结果：true

-- <@ 被包含
SELECT '{"a": 1}'::jsonb <@ '{"a": 1, "b": 2}'::jsonb;
-- 结果：true

-- ? 键/元素是否存在于顶层
SELECT '{"a": 1, "b": 2}'::jsonb ? 'a';
-- 结果：true

-- ?| 任一键存在
SELECT '{"a": 1, "b": 2}'::jsonb ?| array['a', 'c'];
-- 结果：true

-- ?& 所有键都存在
SELECT '{"a": 1, "b": 2}'::jsonb ?& array['a', 'b'];
-- 结果：true
```

### JSONPath 操作符（PostgreSQL 12+）

```sql
-- @? 是否存在匹配路径的值
SELECT '{"items": [1, 2, 3]}'::jsonb @? '$.items[*] ? (@ > 2)';
-- 结果：true

-- @@ JSONPath 谓词求值
SELECT '{"price": 99}'::jsonb @@ '$.price > 50';
-- 结果：true
```

### 修改操作符

```sql
-- || 合并（浅合并，同名键以右侧为准）
SELECT '{"a": 1}'::jsonb || '{"b": 2, "a": 99}'::jsonb;
-- 结果：{"a": 99, "b": 2}

-- - 删除键
SELECT '{"a": 1, "b": 2, "c": 3}'::jsonb - 'b';
-- 结果：{"a": 1, "c": 3}

-- - 删除数组元素（按索引）
SELECT '["a", "b", "c"]'::jsonb - 1;
-- 结果：["a", "c"]

-- #- 删除指定路径的元素
SELECT '{"a": {"b": {"c": 1, "d": 2}}}'::jsonb #- '{a,b,c}';
-- 结果：{"a": {"b": {"d": 2}}}
```

## 核心函数

### 构建函数

```sql
-- jsonb_build_object：从键值对构建对象
SELECT jsonb_build_object(
    'name', u.name,
    'email', u.email,
    'order_count', count(o.id)
)
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name, u.email;

-- jsonb_build_array：构建数组
SELECT jsonb_build_array(1, 'two', true, null);
-- 结果：[1, "two", true, null]

-- to_jsonb：将任意 SQL 值转为 jsonb
SELECT to_jsonb(row(1, 'hello', true));
-- 结果：{"f1": 1, "f2": "hello", "f3": true}
```

### 修改函数

```sql
-- jsonb_set：设置指定路径的值
-- jsonb_set(target, path, new_value, create_if_missing)
UPDATE users SET profile = jsonb_set(
    profile,
    '{address, city}',
    '"Shanghai"'::jsonb,
    true  -- 路径不存在时创建
) WHERE id = 1;

-- jsonb_insert / jsonb_strip_nulls
SELECT jsonb_insert('{"items": [1, 2, 3]}'::jsonb, '{items, 1}', '99'::jsonb);
-- 结果：{"items": [1, 99, 2, 3]}
SELECT jsonb_strip_nulls('{"a": 1, "b": null}'::jsonb);  -- {"a": 1}
```

### 下标访问（PostgreSQL 14+）

```sql
-- 读取
SELECT profile['address']['city'] FROM users WHERE id = 1;

-- 更新（比 jsonb_set 更简洁）
UPDATE users SET profile['theme'] = '"dark"' WHERE id = 1;

-- 嵌套更新
UPDATE users SET profile['address']['zip'] = '"200000"' WHERE id = 1;

-- 注意：值必须是合法的 JSON 字面量（字符串要带引号）
UPDATE users SET profile['name'] = '"Alice"';   -- 正确
-- UPDATE users SET profile['name'] = 'Alice';  -- 错误！
```

### 分解函数

```sql
SELECT key, value FROM jsonb_each('{"name": "Alice", "age": 30}'::jsonb);
SELECT value FROM jsonb_array_elements('[1, 2, 3]'::jsonb);
SELECT jsonb_object_keys('{"a": 1, "b": 2}'::jsonb);
-- jsonb_to_recordset：JSONB 数组 -> SQL 行
SELECT * FROM jsonb_to_recordset(
    '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]'::jsonb
) AS t(name text, age int);
```

### 聚合函数

```sql
-- jsonb_agg：将多行聚合为 JSONB 数组
SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name))
FROM users
WHERE department = 'engineering';
-- 结果：[{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]

-- jsonb_object_agg：将多行聚合为 JSONB 对象
SELECT jsonb_object_agg(key, value)
FROM settings
WHERE scope = 'global';
-- 结果：{"theme": "dark", "lang": "zh", "tz": "Asia/Shanghai"}

-- 嵌套聚合：构建复杂 JSON 响应
SELECT jsonb_build_object(
    'department', d.name,
    'employee_count', count(e.id),
    'employees', jsonb_agg(
        jsonb_build_object('name', e.name, 'title', e.title)
        ORDER BY e.name
    )
)
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
GROUP BY d.id, d.name;
```

### jsonb_path_query 系列

```sql
-- jsonb_path_query：返回所有匹配路径的值（集合返回函数）
SELECT jsonb_path_query(
    '{"store": {"books": [
        {"title": "PostgreSQL", "price": 45},
        {"title": "SQL Basics", "price": 25},
        {"title": "Advanced DB", "price": 65}
    ]}}'::jsonb,
    '$.store.books[*] ? (@.price > 30)'
);
-- 结果：两行
-- {"title": "PostgreSQL", "price": 45}
-- {"title": "Advanced DB", "price": 65}

-- jsonb_path_exists：路径是否存在匹配
SELECT jsonb_path_exists(data, '$.users[*] ? (@.role == "admin")')
FROM documents;

-- jsonb_path_query_first：只返回第一个匹配
SELECT jsonb_path_query_first(data, '$.items[*].price')
FROM products;

-- 带变量的 JSONPath
SELECT jsonb_path_query(
    '{"items": [{"price": 10}, {"price": 20}, {"price": 30}]}'::jsonb,
    '$.items[*] ? (@.price > $min_price)',
    '{"min_price": 15}'::jsonb  -- 变量
);
```

## JSONB 索引策略

### GIN jsonb_ops（默认，最通用）

```sql
CREATE INDEX idx_data_gin ON documents USING GIN (data);

-- 可加速的查询：
SELECT * FROM documents WHERE data @> '{"type": "invoice"}';          -- @> 包含
SELECT * FROM documents WHERE data ? 'important_field';                -- ? 键存在
SELECT * FROM documents WHERE data ?| array['field_a', 'field_b'];    -- ?| 任一键
SELECT * FROM documents WHERE data @? '$.items[*] ? (@.qty > 10)';   -- @? JSONPath
```

### GIN jsonb_path_ops（更小更快，仅限包含/路径查询）

```sql
CREATE INDEX idx_data_path ON documents USING GIN (data jsonb_path_ops);

-- 可加速的查询（比 jsonb_ops 更快）：
SELECT * FROM documents WHERE data @> '{"status": "active"}';         -- @> 包含
SELECT * FROM documents WHERE data @? '$.tags[*] ? (@ == "urgent")';  -- @? JSONPath
SELECT * FROM documents WHERE data @@ '$.price > 100';                -- @@ JSONPath 谓词

-- 不支持的查询：
-- data ? 'key'       （键存在）
-- data ?| array[...] （任一键存在）
-- data ?& array[...] （所有键存在）
```

### 表达式索引（针对固定路径）

```sql
-- 如果查询总是访问固定字段，B-tree 表达式索引更高效
CREATE INDEX idx_data_status ON documents ((data ->> 'status'));
CREATE INDEX idx_data_email ON documents ((data ->> 'email'));

-- 可加速：
SELECT * FROM documents WHERE data ->> 'status' = 'active';
SELECT * FROM documents WHERE data ->> 'email' LIKE 'admin%';

-- 组合索引
CREATE INDEX idx_data_type_status ON documents (
    (data ->> 'type'),
    (data ->> 'status')
);
```

### 索引选型决策

| 查询模式 | 推荐索引 |
|---------|---------|
| 任意键的包含/存在查询 | GIN + jsonb_ops |
| 仅 @>、@?、@@ 查询 | GIN + jsonb_path_ops（更小更快） |
| 固定 1-3 个字段的等值/范围查询 | B-tree 表达式索引 |
| 全文搜索 JSONB 中的文本 | GIN + to_tsvector 表达式索引 |

## 何时用 JSONB vs 关系表

### 适合 JSONB 的场景

```sql
-- 1. 用户偏好/配置（字段不固定）
CREATE TABLE users (
    id       bigint PRIMARY KEY,
    name     text NOT NULL,
    settings jsonb NOT NULL DEFAULT '{}'  -- {"theme": "dark", "lang": "zh", ...}
);

-- 2. 事件 payload（来自外部系统，结构多变）
CREATE TABLE events (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type varchar(50) NOT NULL,
    payload    jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. 多态属性（EAV 模式的替代方案）
CREATE TABLE products (
    id         bigint PRIMARY KEY,
    name       text NOT NULL,
    category   varchar(50) NOT NULL,
    attributes jsonb NOT NULL DEFAULT '{}'
    -- 手机：{"screen_size": 6.1, "battery": 4000}
    -- 笔记本：{"cpu": "M3", "ram": 16, "storage": 512}
);
```

### 应该用关系表的场景

- 字段固定且有明确的数据类型约束
- 需要外键引用
- 需要在字段上做频繁的聚合（SUM/AVG/GROUP BY）
- 需要参与 JOIN 的字段
- 数据量大且查询模式固定

### 混合模式（推荐）

```sql
-- 核心字段用列，灵活字段用 JSONB
CREATE TABLE orders (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES users(id),
    total       numeric(12,2) NOT NULL,          -- 核心字段：独立列
    status      varchar(20) NOT NULL,             -- 核心字段：独立列
    metadata    jsonb NOT NULL DEFAULT '{}',      -- 扩展字段：JSONB
    created_at  timestamptz NOT NULL DEFAULT now()
);
```

## 常见陷阱

- **->> 返回 text 而非原始类型**：`data ->> 'price'` 返回 text，做数值比较需要显式转换 `(data ->> 'price')::numeric > 100`。直接字符串比较 `'9' > '100'` 结果为 true
- **GIN 索引不加速 ->> 查询**：`WHERE data ->> 'status' = 'active'` 不会使用 GIN 索引。需要改写为 `WHERE data @> '{"status": "active"}'` 或创建 B-tree 表达式索引
- **JSONB 更新是全量替换**：PostgreSQL 不支持 JSONB 内部的部分更新（in-place update）。`jsonb_set` 实际上是读取完整 JSONB -> 修改 -> 写回整行。大 JSONB 文档的频繁局部更新性能差
- **NULL 语义差异**：SQL NULL 和 JSON null 是不同的。`'{"a": null}'::jsonb -> 'a'` 返回 JSON null（`jsonb` 类型），而 `'{"b": 1}'::jsonb -> 'a'` 返回 SQL NULL
- **下标写入的值必须是 JSON 字面量**：`profile['name'] = '"Alice"'` 而非 `profile['name'] = 'Alice'`。后者是无效 JSON
- **jsonb_path_ops 不支持键存在查询**：如果需要 `?` 操作符，不能用 jsonb_path_ops
- **避免超大 JSONB 文档**：单个 JSONB 值过大（>数 KB）会影响 TOAST 性能和锁争用。考虑拆分到子表

## 组合提示

配合 `postgresql-schema`（GIN 索引创建与管理）优化 JSONB 查询性能。复杂 JSONB 查询可结合 `postgresql-queries`（CTE/LATERAL JOIN）分步处理。查看执行计划确认索引命中使用 `postgresql-performance`（EXPLAIN ANALYZE）。
