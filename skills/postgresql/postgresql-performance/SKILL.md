---
name: postgresql-performance
description: "PostgreSQL 性能调优：EXPLAIN ANALYZE 解读、索引策略、连接池、VACUUM/ANALYZE、内存参数、慢查询排查。"
tech_stack: [postgresql, backend]
capability: [relational-db, observability]
---

# PostgreSQL Performance（性能调优）

> 来源：https://www.postgresql.org/docs/current/using-explain.html
> 版本基准：PostgreSQL 16/17

## 用途

系统性掌握 PostgreSQL 性能调优方法论：从执行计划分析到服务器参数调优，从索引策略到连接池配置，建立完整的性能排查工具链。

## 何时使用

- 查询响应时间不满足业务要求
- 数据库 CPU/IO 持续高负载
- 表膨胀导致存储和查询性能退化
- 需要配置生产环境的服务器参数
- 评估和配置连接池（PgBouncer）

## EXPLAIN ANALYZE 完全解读

### 基础用法

```sql
-- EXPLAIN：只显示计划，不执行查询
EXPLAIN SELECT * FROM orders WHERE user_id = 123;

-- EXPLAIN ANALYZE：执行查询并显示实际统计
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;

-- 推荐：加上 BUFFERS 和 FORMAT 选项
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE user_id = 123 AND status = 'pending';

-- 对修改语句安全地使用 EXPLAIN ANALYZE（回滚事务）
BEGIN;
EXPLAIN ANALYZE DELETE FROM logs WHERE created_at < '2023-01-01';
ROLLBACK;

-- JSON 格式（便于程序化分析）
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM orders WHERE user_id = 123;
```

### 读懂执行计划

```
Nested Loop  (cost=4.65..118.50 rows=10 width=488)
             (actual time=0.017..0.051 rows=10 loops=1)
  Buffers: shared hit=36 read=6
  ->  Bitmap Heap Scan on orders  (cost=4.36..39.38 rows=10 width=244)
                                  (actual time=0.009..0.017 rows=10 loops=1)
        Recheck Cond: (user_id = 123)
        Heap Blocks: exact=10
        Buffers: shared hit=3 read=5
        ->  Bitmap Index Scan on idx_orders_user  (cost=0.00..4.36 rows=10 width=0)
                                                  (actual time=0.004..0.004 rows=10 loops=1)
              Index Cond: (user_id = 123)
              Buffers: shared hit=2
  ->  Index Scan using products_pkey on products  (cost=0.29..7.90 rows=1 width=244)
                                                  (actual time=0.003..0.003 rows=1 loops=10)
        Index Cond: (id = orders.product_id)
        Buffers: shared hit=24 read=6
Planning Time: 0.485 ms
Execution Time: 0.073 ms
```

**关键指标解读**：

| 字段 | 含义 |
|------|------|
| `cost=4.65..118.50` | 启动成本..总成本（任意单位，仅用于比较） |
| `rows=10` | 预估返回行数 |
| `actual time=0.017..0.051` | 实际启动时间..完成时间（毫秒） |
| `rows=10` (actual) | 实际返回行数 |
| `loops=1` | 该节点执行次数（嵌套循环中内层会 >1） |
| `shared hit=36` | 缓存命中页数（在 shared_buffers 中） |
| `shared read=6` | 从磁盘读取的页数 |
| `Planning Time` | 查询优化耗时 |
| `Execution Time` | 查询执行耗时 |

### 节点类型速查

**扫描**：Seq Scan（全表）、Index Scan（索引+回表）、Index Only Scan（纯索引，看 Heap Fetches）、Bitmap Heap Scan（中等选择性）
**JOIN**：Nested Loop（小结果集+索引）、Hash Join（大结果集等值）、Merge Join（两侧已排序）

### 性能红旗

```sql
-- 红旗 1：预估行数与实际相差巨大 → 需要 ANALYZE
rows=1 (actual rows=50000)  -- 估计 1 行，实际 5 万行

-- 红旗 2：大量 Rows Removed by Filter → 缺少索引
Seq Scan on orders
  Filter: (status = 'pending')
  Rows Removed by Filter: 999000  -- 扫描 100 万行只要 1000 行

-- 红旗 3：Heap Fetches 很高 → 需要 VACUUM
Index Only Scan ...
  Heap Fetches: 45000  -- 应该是 0 或很小

-- 红旗 4：Sort 使用磁盘 → work_mem 不足
Sort Method: external merge  Disk: 102400kB

-- 红旗 5：HashAgg 的 Batches > 1 → hash_mem_multiplier 或 work_mem 不足
HashAggregate  Batches: 4  Memory Usage: 8193kB  Disk Usage: 32768kB
```

## pg_stat_statements（慢查询排查利器）

### 启用

```ini
# postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 10000
pg_stat_statements.track = 'top'  -- top | all | none
```

```sql
-- 需要重启后创建扩展
CREATE EXTENSION pg_stat_statements;
```

### 核心查询

```sql
-- Top 10 耗时最长的查询
SELECT
    round(total_exec_time::numeric, 2) AS total_ms,
    calls,
    round(mean_exec_time::numeric, 2) AS avg_ms,
    round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct,
    left(query, 100) AS query_preview
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Top 10 调用次数最多的查询
SELECT
    calls,
    round(mean_exec_time::numeric, 2) AS avg_ms,
    round(total_exec_time::numeric, 2) AS total_ms,
    rows,
    left(query, 100) AS query_preview
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;

-- 高 IO 查询（缓存命中率低）
SELECT
    left(query, 80) AS query_preview,
    calls,
    round(shared_blks_hit::numeric / nullif(shared_blks_hit + shared_blks_read, 0) * 100, 2)
        AS cache_hit_pct,
    shared_blks_read
FROM pg_stat_statements
WHERE shared_blks_read > 1000
ORDER BY shared_blks_read DESC
LIMIT 10;

-- 重置统计
SELECT pg_stat_statements_reset();
```

## 索引策略

### 索引审计

```sql
-- 查找未使用的索引
SELECT schemaname || '.' || relname AS table, indexrelname AS index,
    pg_size_pretty(pg_relation_size(i.indexrelid)) AS size, idx_scan AS scans
FROM pg_stat_user_indexes i JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0 AND NOT indisunique AND NOT indisprimary
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

### 索引最佳实践

```sql
-- 1. 使用 CONCURRENTLY 创建索引（不阻塞写入）
CREATE INDEX CONCURRENTLY idx_orders_status ON orders (status);

-- 2. 覆盖索引避免回表
CREATE INDEX idx_orders_covering ON orders (user_id)
    INCLUDE (status, total_amount);

-- 3. 部分索引减小体积
CREATE INDEX idx_orders_active ON orders (created_at)
    WHERE status IN ('pending', 'processing');

-- 4. 重建膨胀的索引
REINDEX INDEX CONCURRENTLY idx_orders_status;

-- 5. 多列索引的列顺序：高选择性在前
-- 好：user_id 选择性高（基数大），status 选择性低
CREATE INDEX idx_orders_user_status ON orders (user_id, status);
```

## VACUUM 与 ANALYZE

### VACUUM

```sql
-- 普通 VACUUM：回收死行空间（不阻塞读写）
VACUUM orders;

-- VACUUM VERBOSE：显示详细信息
VACUUM VERBOSE orders;

-- VACUUM FULL：重写整个表（阻塞所有操作，慎用！）
-- 仅在表膨胀率极高（>50%）且可以接受停机时使用
VACUUM FULL orders;

-- 查看表膨胀率
SELECT
    relname AS table,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    n_dead_tup,
    n_live_tup,
    round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 2)
        AS dead_pct,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```

### ANALYZE

```sql
ANALYZE orders;                              -- 更新表统计信息（优化器依赖）
ANALYZE orders (user_id, status, created_at); -- 只分析特定列
```

### Autovacuum 调优

```ini
# postgresql.conf（全局默认）
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50         # 最少死行数才触发
autovacuum_vacuum_scale_factor = 0.2     # 死行比例阈值（20%）
autovacuum_analyze_threshold = 50
autovacuum_analyze_scale_factor = 0.1    # 变更比例阈值（10%）
```

```sql
-- 对高写入表单独调参（降低触发阈值，更频繁 VACUUM）
ALTER TABLE hot_table SET (
    autovacuum_vacuum_scale_factor = 0.01,   -- 1% 死行就 VACUUM
    autovacuum_vacuum_threshold = 1000,
    autovacuum_analyze_scale_factor = 0.005
);
```

## 内存参数调优

### shared_buffers

```ini
# PostgreSQL 的数据页缓存
# 推荐值：系统内存的 25%，通常不超过 8-16GB
# 超过 16GB 后收益递减（因为 OS page cache 也在缓存）

# 16GB 内存的服务器
shared_buffers = '4GB'

# 64GB 内存的服务器
shared_buffers = '16GB'
```

```sql
-- 检查缓存命中率（应 >99%）
SELECT
    sum(blks_hit) AS cache_hits,
    sum(blks_read) AS disk_reads,
    round(sum(blks_hit)::numeric / nullif(sum(blks_hit) + sum(blks_read), 0) * 100, 2)
        AS hit_ratio
FROM pg_stat_database;
```

### work_mem

```ini
# 每个排序/哈希操作的内存（注意：是每个操作，不是每个连接）
# 一个复杂查询可能有多个排序/哈希操作
# 总消耗 = work_mem * 并发连接数 * 每连接操作数

# 保守起步
work_mem = '16MB'

# 如果 EXPLAIN 显示 Sort Method: external merge，适当调大
# 可以在会话级别临时调大
SET work_mem = '256MB';
-- 执行大查询
RESET work_mem;
```

### 其他关键参数

```ini
effective_cache_size = '12GB'           # 系统内存的 50-75%（只影响优化器决策，不分配内存）
maintenance_work_mem = '1GB'            # VACUUM / CREATE INDEX 的内存
random_page_cost = 1.1                  # SSD 推荐（默认 4.0 是 HDD）
effective_io_concurrency = 200          # SSD 推荐（默认 1）
max_parallel_workers_per_gather = 4     # 每个查询最多并行 worker
```

## PgBouncer 连接池

### 为什么需要连接池

PostgreSQL 每个连接是独立进程，内存开销约 5-10MB。应用层数千连接直连数据库会导致：
- 内存耗尽
- 进程上下文切换开销大
- 连接建立的 fork 延迟

PgBouncer 通过复用少量后端连接来服务大量前端连接。

### 配置文件（pgbouncer.ini）

```ini
[databases]
myapp = host=127.0.0.1 port=5432 dbname=myapp

[pgbouncer]
# 监听地址
listen_addr = 0.0.0.0
listen_port = 6432

# === 连接池模式 ===
# session：连接独占直到客户端断开（最兼容，节省最少）
# transaction：事务结束后归还连接（推荐，大幅减少后端连接数）
# statement：每条语句后归还（不支持多语句事务，极少使用）
pool_mode = transaction

# === 连接数控制 ===
max_client_conn = 1000           # 最大客户端连接数
default_pool_size = 25           # 每个 user/database 组合的默认池大小
min_pool_size = 5                # 空闲时维持的最小连接数
reserve_pool_size = 5            # 紧急储备连接
reserve_pool_timeout = 3         # 储备连接等待时间（秒）
max_db_connections = 100         # 每个数据库的最大后端连接数

# === 超时 ===
server_lifetime = 3600           # 后端连接最大存活时间（秒）
server_idle_timeout = 600        # 空闲后端连接回收时间
client_idle_timeout = 0          # 客户端空闲超时（0=不超时）
query_timeout = 0                # 查询超时（0=不超时）
query_wait_timeout = 120         # 客户端等待可用连接的超时

# === 认证 ===
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# === 日志 ===
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60
```

### transaction 模式限制

不可用功能：会话级 SET（用 `SET LOCAL` 替代）、LISTEN/NOTIFY、预备语句、临时表、WITH HOLD 游标。

## 关键监控查询

```sql
-- 长事务检测（可能阻塞 VACUUM）
SELECT pid, usename, state, age(now(), xact_start) AS xact_age, left(query, 80) AS query
FROM pg_stat_activity WHERE xact_start IS NOT NULL
ORDER BY xact_start ASC LIMIT 10;

-- 表级 IO 统计（找出全表扫描多的表）
SELECT relname, seq_scan, idx_scan, n_live_tup, n_dead_tup
FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 20;
```

## 常见陷阱

- **EXPLAIN 估算偏差**：`rows` 估算与实际差距大时，先运行 `ANALYZE` 更新统计信息。如果统计信息是新的但仍然偏差大，检查 `default_statistics_target`（可设为 500-1000 提高精度）
- **work_mem 不是越大越好**：work_mem 是按操作分配的。设为 1GB + 100 个并发连接 + 每连接 3 个排序操作 = 可能消耗 300GB。保守设置，需要时用 `SET LOCAL` 临时调大
- **VACUUM FULL 不是常规操作**：VACUUM FULL 需要 ACCESS EXCLUSIVE 锁（完全阻塞表），且需要临时双倍磁盘空间。日常使用普通 VACUUM，或用 `pg_repack` 在线压缩
- **长事务阻塞 VACUUM**：任何打开的事务都会阻止 VACUUM 回收在该事务开始后产生的死行。注意监控长事务和空闲事务（`idle in transaction`）
- **random_page_cost 默认值坑**：默认 4.0 假设随机 IO 比顺序 IO 慢 4 倍（HDD 场景）。SSD 上应设为 1.1-1.5，否则优化器会不合理地偏好 Seq Scan
- **CREATE INDEX 会锁表**：默认的 `CREATE INDEX` 对表加 SHARE 锁（阻塞写入）。生产环境务必使用 `CREATE INDEX CONCURRENTLY`
- **PgBouncer transaction 模式的兼容性**：LISTEN/NOTIFY、会话级 SET、预备语句、临时表在 transaction 模式下不可靠。务必在部署前验证

## 组合提示

索引选型和创建参考 `postgresql-schema`。查询优化技巧（CTE 物化、LATERAL JOIN 等）参考 `postgresql-queries`。JSONB 查询的索引策略参考 `postgresql-json`。生产环境的备份恢复和高可用配合 `postgresql-ha`。
