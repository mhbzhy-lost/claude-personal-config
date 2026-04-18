---
name: postgresql-core
description: "PostgreSQL 安装配置、核心数据类型、psql 命令行工具、认证与连接配置、关键服务器参数。"
tech_stack: [postgresql, backend]
capability: [relational-db]
---

# PostgreSQL Core（安装配置与数据类型）

> 来源：https://www.postgresql.org/docs/current/datatype.html
> 版本基准：PostgreSQL 16/17

## 用途

掌握 PostgreSQL 的安装部署、核心数据类型选择、psql 命令行操作、认证配置和关键服务器参数，建立正确的基础心智模型。

## 何时使用

- 新建 PostgreSQL 实例或迁移到 PostgreSQL
- 需要选择正确的列数据类型
- 配置客户端认证（pg_hba.conf）或服务器参数（postgresql.conf）
- 日常使用 psql 进行数据库管理和调试

## 安装

```bash
# macOS (Homebrew)
brew install postgresql@17
brew services start postgresql@17

# Ubuntu/Debian
sudo apt install postgresql-17 postgresql-client-17
sudo systemctl enable --now postgresql

# Docker（推荐用于开发环境）
docker run -d --name pg \
  -e POSTGRES_PASSWORD=mysecret \
  -p 5432:5432 \
  postgres:17-alpine

# 初始化数据目录（手动安装时）
initdb -D /var/lib/postgresql/17/main --encoding=UTF8 --locale=en_US.UTF-8
```

## psql 命令行工具

### 连接

```bash
# 本地连接
psql -U postgres -d mydb

# 远程连接
psql -h 192.168.1.100 -p 5432 -U appuser -d mydb

# 使用连接字符串
psql "postgresql://appuser:pass@host:5432/mydb?sslmode=require"

# 环境变量
export PGHOST=localhost PGPORT=5432 PGUSER=appuser PGDATABASE=mydb
psql
```

### 高频元命令

```
\l              -- 列出所有数据库
\c dbname       -- 切换数据库
\dt             -- 列出当前 schema 的表
\dt+            -- 列出表（含大小、描述）
\d tablename    -- 查看表结构
\di             -- 列出索引
\df             -- 列出函数
\du             -- 列出角色/用户
\dn             -- 列出 schema
\x              -- 切换扩展显示（竖排输出）
\timing         -- 开启/关闭查询计时
\e              -- 用编辑器编辑查询
\i file.sql     -- 执行 SQL 文件
\copy           -- 客户端侧 COPY（不需要服务端文件权限）
\watch 5        -- 每 5 秒重复执行上一条查询
\q              -- 退出
```

### 实用查询

```sql
-- 查看数据库大小
SELECT pg_size_pretty(pg_database_size(current_database()));

-- 查看表大小（含索引）
SELECT pg_size_pretty(pg_total_relation_size('my_table'));

-- 查看当前活跃连接
SELECT pid, usename, application_name, state, query
FROM pg_stat_activity WHERE state = 'active';

-- 查看正在运行的慢查询
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds';

-- 终止指定连接
SELECT pg_terminate_backend(pid);
```

## 核心数据类型

### 数值类型

```sql
-- 整数：优先 integer，大表主键用 bigint
CREATE TABLE orders (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 推荐替代 serial
    quantity    integer NOT NULL DEFAULT 0,
    small_flag  smallint                                          -- 节省空间（-32768 ~ 32767）
);

-- 精确小数：金额必须用 numeric，避免浮点误差
CREATE TABLE products (
    price       numeric(10, 2) NOT NULL,     -- 10 位总长，2 位小数
    weight_kg   double precision              -- 科学计算可用浮点
);
```

| 类型 | 大小 | 范围 | 用途 |
|------|------|------|------|
| `smallint` | 2 bytes | -32768 ~ 32767 | 状态码、小枚举值 |
| `integer` | 4 bytes | -2^31 ~ 2^31-1 | 通用整数 |
| `bigint` | 8 bytes | -2^63 ~ 2^63-1 | 主键、大数据量计数 |
| `numeric(p,s)` | 可变 | 最多 131072 位 | 金额、精确计算 |
| `real` | 4 bytes | 6 位十进制精度 | 科学计算 |
| `double precision` | 8 bytes | 15 位十进制精度 | 科学计算 |

### 文本类型

```sql
-- text 是 PostgreSQL 推荐的通用字符串类型
CREATE TABLE users (
    username    varchar(50) NOT NULL,     -- 有业务长度约束时用 varchar(n)
    email       text NOT NULL,            -- 无长度约束时用 text
    bio         text
);
-- PostgreSQL 中 varchar（无长度）、text 性能完全一致
-- char(n) 会右填充空格，几乎不建议使用
```

### 日期/时间类型

```sql
CREATE TABLE events (
    -- 推荐：timestamptz 存储 UTC，展示时按客户端时区转换
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    event_date    date,                          -- 只需要日期
    duration      interval                       -- 时间段：'2 hours 30 minutes'
);

-- 时区示例
SET timezone = 'Asia/Shanghai';
SELECT now();                                    -- 当前时间（带时区）
SELECT now() AT TIME ZONE 'UTC';                 -- 转换为 UTC
SELECT '2024-01-15'::date + interval '30 days';  -- 日期计算
```

**核心原则**：业务时间一律用 `timestamptz`（timestamp with time zone），避免用 `timestamp`（without time zone）。

### UUID 类型

```sql
-- PostgreSQL 16+ 内置 gen_random_uuid()，无需扩展
CREATE TABLE sessions (
    id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id bigint NOT NULL
);

-- 老版本需要启用扩展
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- DEFAULT uuid_generate_v4()
```

### 数组类型

```sql
CREATE TABLE articles (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tags    text[] NOT NULL DEFAULT '{}'
);

-- 插入
INSERT INTO articles (tags) VALUES (ARRAY['postgresql', 'database']);
INSERT INTO articles (tags) VALUES ('{"sql", "tutorial"}');

-- 查询：包含某个元素
SELECT * FROM articles WHERE 'postgresql' = ANY(tags);

-- 查询：包含所有指定元素
SELECT * FROM articles WHERE tags @> ARRAY['postgresql', 'database'];

-- 查询：与指定数组有交集
SELECT * FROM articles WHERE tags && ARRAY['postgresql', 'mysql'];

-- 展开数组为行
SELECT id, unnest(tags) AS tag FROM articles;

-- 追加元素
UPDATE articles SET tags = array_append(tags, 'new-tag') WHERE id = 1;

-- 删除元素
UPDATE articles SET tags = array_remove(tags, 'old-tag') WHERE id = 1;

-- 数组索引（GIN）
CREATE INDEX idx_articles_tags ON articles USING GIN (tags);
```

### 枚举类型

```sql
-- 创建枚举
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status  order_status NOT NULL DEFAULT 'pending'
);

-- 枚举比较按照定义顺序
SELECT * FROM orders WHERE status > 'processing';  -- shipped, delivered, cancelled

-- 添加新值（PostgreSQL 不支持删除枚举值）
ALTER TYPE order_status ADD VALUE 'returned' AFTER 'delivered';

-- 查看枚举值列表
SELECT enum_range(NULL::order_status);
```

## pg_hba.conf（客户端认证）

```conf
# TYPE    DATABASE    USER        ADDRESS         METHOD

# 本地 Unix socket 连接
local     all         postgres                    peer
local     all         all                         scram-sha-256

# IPv4 本地连接
host      all         all         127.0.0.1/32    scram-sha-256

# IPv4 内网连接
host      mydb        appuser     10.0.0.0/8      scram-sha-256

# IPv6
host      all         all         ::1/128         scram-sha-256

# 拒绝所有其他连接
host      all         all         0.0.0.0/0       reject
```

认证方法说明：
- `scram-sha-256`：推荐的密码认证方式（PostgreSQL 10+）
- `peer`：本地连接，使用操作系统用户名匹配数据库用户
- `md5`：旧式密码认证，安全性低于 scram-sha-256
- `reject`：显式拒绝
- `trust`：无需密码（仅限开发环境）

修改后需要重载配置：`SELECT pg_reload_conf();` 或 `pg_ctl reload`。

## postgresql.conf 关键参数

```ini
# === 连接 ===
listen_addresses = '*'            # 生产环境建议绑定具体 IP
port = 5432
max_connections = 200             # 配合连接池使用，通常不超过 500

# === 内存 ===
shared_buffers = '4GB'            # 系统内存的 25%，起步值
effective_cache_size = '12GB'     # 系统内存的 75%（告知优化器可用缓存总量）
work_mem = '16MB'                 # 每个排序/哈希操作的内存，谨慎调大
maintenance_work_mem = '512MB'    # VACUUM、CREATE INDEX 的内存

# === WAL ===
wal_level = 'replica'             # 支持流复制和 PITR
wal_buffers = '64MB'              # WAL 缓冲区（默认 -1 自动计算）
checkpoint_completion_target = 0.9

# === 查询优化 ===
random_page_cost = 1.1            # SSD 推荐值（默认 4.0 是 HDD）
effective_io_concurrency = 200    # SSD 推荐值（默认 1）

# === 日志 ===
log_min_duration_statement = 1000 # 记录超过 1 秒的慢查询（ms）
log_statement = 'ddl'             # 记录 DDL 语句
log_line_prefix = '%t [%p] %u@%d '

# === 自动清理 ===
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = '1min'
```

## 角色与权限

```sql
-- 创建角色
CREATE ROLE appuser WITH LOGIN PASSWORD 'strong_password';

-- 创建数据库
CREATE DATABASE myapp OWNER appuser;

-- 权限授予
GRANT CONNECT ON DATABASE myapp TO appuser;
GRANT USAGE ON SCHEMA public TO appuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appuser;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appuser;

-- 设置默认权限（对未来创建的对象生效）
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appuser;

-- 只读角色
CREATE ROLE readonly WITH LOGIN PASSWORD 'read_pass';
GRANT CONNECT ON DATABASE myapp TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
```

## 常见陷阱

- **IDENTITY vs SERIAL**：新项目用 `GENERATED ALWAYS AS IDENTITY` 替代 `serial`/`bigserial`，后者实际上是创建 sequence + 设默认值的语法糖，在权限管理和 pg_dump 上有隐含问题
- **timestamp vs timestamptz**：几乎所有场景都应该用 `timestamptz`。`timestamp`（without time zone）不存储时区信息，在多时区环境下会导致混乱
- **varchar vs text**：PostgreSQL 中 `text` 和 `varchar`（无长度限制）性能完全一致。`varchar(n)` 仅在有明确业务约束时使用，不要为了"安全"随意加长度限制
- **枚举不可删值**：`ALTER TYPE ... ADD VALUE` 可以添加新值，但无法删除已有值。变更频繁的状态建议用 varchar + CHECK 约束或独立的状态表
- **pg_hba.conf 顺序**：规则按从上到下匹配，第一个匹配的规则生效。把更具体的规则放在前面
- **max_connections 不要盲目调大**：每个连接消耗约 5-10MB 内存，过多连接会导致上下文切换开销。配合 PgBouncer 连接池使用，后端 max_connections 通常 100-300 足够
- **random_page_cost 默认值**：默认 4.0 是针对机械硬盘的，SSD 环境应调为 1.1-1.5，否则优化器会过度偏好 Seq Scan

## 组合提示

配合 `postgresql-schema`（表设计与索引）和 `postgresql-queries`（高级查询）形成基础知识闭环。生产部署需配合 `postgresql-performance`（性能调优）和 `postgresql-ha`（高可用）。JSONB 场景参考 `postgresql-json`。
