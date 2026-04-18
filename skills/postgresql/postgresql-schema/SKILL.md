---
name: postgresql-schema
description: "PostgreSQL 表设计、约束体系、索引类型（B-tree/GIN/GiST/BRIN）、声明式分区表、表空间管理。"
tech_stack: [postgresql, backend]
capability: [relational-db]
---

# PostgreSQL Schema（表设计与索引）

> 来源：https://www.postgresql.org/docs/current/ddl.html
> 版本基准：PostgreSQL 16/17

## 用途

掌握 PostgreSQL 表设计的最佳实践，包括约束体系、索引选型、分区策略，构建高效且可维护的数据库 schema。

## 何时使用

- 新建数据库表结构或重构现有 schema
- 需要选择合适的索引类型以优化查询
- 大表需要分区以提升性能和可维护性
- 评估约束策略以保证数据完整性

## 表设计基础

```sql
-- 推荐的建表模板
CREATE TABLE users (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       text NOT NULL,
    username    varchar(50) NOT NULL,
    profile     jsonb NOT NULL DEFAULT '{}',
    status      varchar(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'banned')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_username_unique UNIQUE (username)
);

-- 添加注释（对运维非常有用）
COMMENT ON TABLE users IS '用户主表';
COMMENT ON COLUMN users.profile IS 'JSONB 格式的用户扩展信息';
```

## 约束体系

### 主键约束

```sql
-- 单列主键（推荐 IDENTITY）
CREATE TABLE orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

-- 复合主键
CREATE TABLE order_items (
    order_id    bigint REFERENCES orders(id),
    product_id  bigint REFERENCES products(id),
    quantity    integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, product_id)
);

-- UUID 主键（分布式场景）
CREATE TABLE events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
```

### 外键约束

```sql
CREATE TABLE orders (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint NOT NULL,
    -- ON DELETE CASCADE: 删除用户时自动删除其订单
    -- ON DELETE RESTRICT: 有订单的用户不能删除（默认）
    -- ON DELETE SET NULL: 删除用户时订单的 user_id 设为 NULL
    CONSTRAINT fk_orders_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- 外键列务必创建索引（PostgreSQL 不自动创建）
CREATE INDEX idx_orders_user_id ON orders (user_id);
```

### UNIQUE 约束

```sql
-- 单列唯一
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- 复合唯一
ALTER TABLE subscriptions ADD CONSTRAINT sub_unique
    UNIQUE (user_id, plan_id);

-- 部分唯一索引（条件唯一，比约束更灵活）
-- 例：同一用户只能有一个 active 的订阅
CREATE UNIQUE INDEX idx_active_subscription
    ON subscriptions (user_id)
    WHERE status = 'active';
```

### CHECK 约束

```sql
CREATE TABLE products (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL CHECK (length(name) >= 1),
    price       numeric(10,2) NOT NULL CHECK (price >= 0),
    discount    numeric(10,2) CHECK (discount >= 0 AND discount <= price),
    start_date  date,
    end_date    date,
    -- 跨列检查
    CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date > start_date)
);
```

### 排他约束（Exclusion Constraint）

```sql
-- 需要 btree_gist 扩展
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 确保同一会议室在同一时间段不会被重复预订
CREATE TABLE room_bookings (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id     integer NOT NULL,
    during      tstzrange NOT NULL,
    CONSTRAINT no_overlap EXCLUDE USING GIST (
        room_id WITH =,
        during WITH &&
    )
);

INSERT INTO room_bookings (room_id, during)
VALUES (1, '[2024-01-15 09:00, 2024-01-15 10:00)');

-- 重叠时间段会被拒绝
INSERT INTO room_bookings (room_id, during)
VALUES (1, '[2024-01-15 09:30, 2024-01-15 10:30)');
-- ERROR: conflicting key value violates exclusion constraint
```

## 索引类型

### B-tree（默认）

适用于等值查询和范围查询，是最通用的索引类型。

```sql
-- 创建 B-tree 索引（默认类型，可省略 USING btree）
CREATE INDEX idx_orders_created ON orders (created_at);

-- 复合索引（列顺序很重要：高选择性列在前）
CREATE INDEX idx_orders_user_status ON orders (user_id, status);

-- 覆盖索引（INCLUDE，避免回表）
CREATE INDEX idx_orders_covering ON orders (user_id)
    INCLUDE (status, total_amount);

-- 部分索引（只索引满足条件的行，大幅减小索引体积）
CREATE INDEX idx_orders_pending ON orders (created_at)
    WHERE status = 'pending';

-- 降序索引（配合 ORDER BY ... DESC 查询）
CREATE INDEX idx_orders_recent ON orders (created_at DESC);

-- 查看索引是否被使用
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE relname = 'orders';
```

**B-tree 支持的操作符**：`<`、`<=`、`=`、`>=`、`>`、`BETWEEN`、`IN`、`IS NULL`、`LIKE 'prefix%'`

### GIN（Generalized Inverted Index）

适用于包含多个组件值的数据：数组、JSONB、全文搜索。

```sql
-- 数组索引
CREATE INDEX idx_articles_tags ON articles USING GIN (tags);
-- 支持：@>（包含）、&&（交集）、<@（被包含）

-- JSONB 索引（默认 jsonb_ops）
CREATE INDEX idx_data_gin ON documents USING GIN (data);
-- 支持：@>、?、?|、?&、@?、@@

-- JSONB 索引（jsonb_path_ops，更小更快，但仅支持 @>/@?/@@）
CREATE INDEX idx_data_path ON documents USING GIN (data jsonb_path_ops);

-- 全文搜索索引
CREATE INDEX idx_fts ON articles USING GIN (to_tsvector('english', content));
```

### GiST（Generalized Search Tree）

适用于几何数据、范围类型、全文搜索（配合 `tsvector`）。

```sql
-- 范围类型索引（支持重叠查询）
CREATE INDEX idx_bookings_during ON room_bookings USING GiST (during);

-- 几何类型索引
CREATE INDEX idx_locations ON places USING GiST (location);

-- 最近邻查询
SELECT name, location <-> point '(40.7128, -74.0060)' AS distance
FROM places
ORDER BY location <-> point '(40.7128, -74.0060)'
LIMIT 10;
```

### BRIN（Block Range Index）

适用于数据物理顺序与列值高度相关的大表（如按时间追加的日志表），索引体积极小。

```sql
-- 适合时序数据的 BRIN 索引
CREATE INDEX idx_logs_created_brin ON logs USING BRIN (created_at);

-- pages_per_range 控制精度（默认 128）
CREATE INDEX idx_logs_brin ON logs USING BRIN (created_at)
    WITH (pages_per_range = 32);
```

**BRIN 适用条件**：表按索引列的自然顺序插入（如 append-only 的日志表）。如果数据随机分布，BRIN 效果很差。

### 索引选型速查

| 场景 | 推荐索引 |
|------|---------|
| 等值/范围查询（通用） | B-tree |
| 数组包含/交集查询 | GIN |
| JSONB 文档查询 | GIN |
| 全文搜索 | GIN（性能优先）或 GiST（更新频繁） |
| 范围重叠（时间区间等） | GiST |
| 最近邻/空间查询 | GiST（+ PostGIS） |
| 大表时序数据（append-only） | BRIN |
| 只需要等值查询 | Hash（极少场景） |

## 分区表（Declarative Partitioning）

### RANGE 分区（最常用）

```sql
-- 按月分区的日志表
CREATE TABLE logs (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    created_at  timestamptz NOT NULL,
    level       varchar(10) NOT NULL,
    message     text,
    metadata    jsonb
) PARTITION BY RANGE (created_at);

-- 创建各月分区
CREATE TABLE logs_2024_01 PARTITION OF logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE logs_2024_02 PARTITION OF logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE logs_2024_03 PARTITION OF logs
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- 创建默认分区（兜底，避免插入失败）
CREATE TABLE logs_default PARTITION OF logs DEFAULT;

-- 在分区表上创建索引（自动传播到所有分区）
CREATE INDEX idx_logs_created ON logs (created_at);
CREATE INDEX idx_logs_level ON logs (level);
```

### LIST 分区

```sql
-- 按地区分区
CREATE TABLE sales (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    region      varchar(20) NOT NULL,
    amount      numeric(12,2) NOT NULL,
    sold_at     timestamptz NOT NULL DEFAULT now()
) PARTITION BY LIST (region);

CREATE TABLE sales_cn PARTITION OF sales FOR VALUES IN ('cn', 'hk', 'tw');
CREATE TABLE sales_us PARTITION OF sales FOR VALUES IN ('us', 'ca');
CREATE TABLE sales_eu PARTITION OF sales FOR VALUES IN ('uk', 'de', 'fr');
CREATE TABLE sales_other PARTITION OF sales DEFAULT;
```

### HASH 分区

```sql
-- 均匀分布（适合无明确范围/分类的场景）
CREATE TABLE sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     bigint NOT NULL,
    data        jsonb
) PARTITION BY HASH (id);

CREATE TABLE sessions_0 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE sessions_1 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE sessions_2 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE sessions_3 PARTITION OF sessions FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

### 分区维护

```sql
-- 添加新分区（在线操作）
CREATE TABLE logs_2024_04 PARTITION OF logs
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

-- 分离分区（保留数据但不再属于分区表）
ALTER TABLE logs DETACH PARTITION logs_2024_01;

-- 并发分离（减少锁影响，PostgreSQL 14+）
ALTER TABLE logs DETACH PARTITION logs_2024_01 CONCURRENTLY;

-- 快速删除旧数据（比 DELETE 快几个数量级）
DROP TABLE logs_2024_01;

-- 附加已有表为分区（先添加约束避免全表扫描）
ALTER TABLE logs_archive ADD CONSTRAINT chk_date
    CHECK (created_at >= '2023-01-01' AND created_at < '2023-02-01');
ALTER TABLE logs ATTACH PARTITION logs_archive
    FOR VALUES FROM ('2023-01-01') TO ('2023-02-01');
```

### 多级分区

```sql
-- 先按年分区，再按地区子分区
CREATE TABLE sales_2024 PARTITION OF sales
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')
    PARTITION BY LIST (region);

CREATE TABLE sales_2024_cn PARTITION OF sales_2024
    FOR VALUES IN ('cn', 'hk', 'tw');
```

## 表空间

```sql
-- 创建表空间（指向快速存储）
CREATE TABLESPACE fast_ssd LOCATION '/mnt/ssd/pg_data';

-- 将热表放到 SSD 表空间
CREATE TABLE hot_data (...) TABLESPACE fast_ssd;

-- 将冷分区移到慢速存储
ALTER TABLE logs_2023_01 SET TABLESPACE slow_hdd;

-- 将索引放到独立表空间
CREATE INDEX idx_hot ON hot_data (key) TABLESPACE fast_ssd;
```

## Schema 管理

```sql
-- 创建业务 schema（避免所有表都在 public 下）
CREATE SCHEMA app;

-- 设置搜索路径
ALTER DATABASE myapp SET search_path TO app, public;

-- 在指定 schema 下创建表
CREATE TABLE app.users (...);
```

## 常见陷阱

- **外键列不会自动创建索引**：PostgreSQL 不像 MySQL 那样自动为外键列创建索引。缺少索引会导致 DELETE 父表记录时对子表全表扫描，以及 JOIN 性能低下
- **分区表的 UNIQUE/PRIMARY KEY 必须包含分区键**：例如按 `created_at` 分区的表，主键必须包含 `created_at`，如 `PRIMARY KEY (id, created_at)`
- **GIN 索引更新成本高**：GIN 索引写入开销大（因为要维护倒排结构）。在高写入场景下，可设 `fastupdate = on`（默认开启）来批量延迟更新，但会使查询略慢
- **BRIN 在随机写入场景下无用**：BRIN 依赖数据的物理排序。如果表经历了大量 UPDATE（行被移动到新位置）或随机 INSERT，BRIN 效果极差
- **部分索引的 WHERE 条件必须在查询中出现**：查询条件必须蕴含（imply）部分索引的 WHERE 子句，优化器才能使用该索引
- **复合索引的列顺序**：`(a, b)` 的索引可以加速 `WHERE a = ?`、`WHERE a = ? AND b = ?`，但无法加速单独的 `WHERE b = ?`。最左前缀规则与其他数据库一致
- **分区数量控制**：通常几百个分区是安全的。上千个分区会显著增加查询规划时间和内存消耗
- **避免过度索引**：每个索引都是写入的额外成本。定期用 `pg_stat_user_indexes` 检查未使用的索引并清理

## 组合提示

配合 `postgresql-core`（数据类型选择）建表。查询优化参考 `postgresql-queries`（CTE/窗口函数）和 `postgresql-performance`（EXPLAIN 分析与调优）。JSONB 列的索引策略详见 `postgresql-json`。大表分区结合 `postgresql-ha`（备份与恢复）管理数据生命周期。
