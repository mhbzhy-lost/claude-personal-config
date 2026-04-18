---
name: postgresql-queries
description: "PostgreSQL 高级查询：CTE/递归CTE、窗口函数、LATERAL JOIN、UPSERT、批量操作。"
tech_stack: [postgresql, backend]
capability: [relational-db]
---

# PostgreSQL Queries（高级查询技巧）

> 来源：https://www.postgresql.org/docs/current/queries-with.html
> 版本基准：PostgreSQL 16/17

## 用途

掌握 PostgreSQL 高级查询能力，用声明式 SQL 替代应用层的复杂逻辑，减少数据往返，提升性能与可读性。

## 何时使用

- 需要分步骤构建复杂查询逻辑（CTE）
- 处理树形/层级数据（递归 CTE）
- 排名、累计、同比环比计算（窗口函数）
- 需要子查询引用外层查询的列（LATERAL JOIN）
- 插入或更新的幂等操作（UPSERT）
- 大批量数据导入导出（COPY / unnest）

## CTE（WITH 查询）

### 基础 CTE

```sql
-- 将复杂查询拆分为可读的步骤
WITH monthly_revenue AS (
    SELECT
        date_trunc('month', created_at) AS month,
        sum(amount) AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY 1
),
monthly_growth AS (
    SELECT
        month,
        revenue,
        lag(revenue) OVER (ORDER BY month) AS prev_revenue,
        round(
            (revenue - lag(revenue) OVER (ORDER BY month))
            / lag(revenue) OVER (ORDER BY month) * 100, 2
        ) AS growth_pct
    FROM monthly_revenue
)
SELECT * FROM monthly_growth ORDER BY month;
```

### CTE 物化控制

```sql
-- MATERIALIZED：强制 CTE 独立计算一次（PostgreSQL 12+）
-- 适用于：CTE 被多次引用，或包含昂贵计算
WITH expensive_calc AS MATERIALIZED (
    SELECT user_id, count(*) AS order_count
    FROM orders
    GROUP BY user_id
)
SELECT * FROM expensive_calc WHERE order_count > 10
UNION ALL
SELECT * FROM expensive_calc WHERE order_count = 1;

-- NOT MATERIALIZED：允许优化器将 CTE 内联到主查询（下推 WHERE）
-- 适用于：CTE 只引用一次，且主查询有过滤条件可下推
WITH user_data AS NOT MATERIALIZED (
    SELECT * FROM users  -- 优化器会把 WHERE id = 123 下推进来
)
SELECT * FROM user_data WHERE id = 123;
```

**默认行为**：引用一次的 CTE 自动内联；引用多次则自动物化。

### 递归 CTE

```sql
-- 组织架构树遍历
WITH RECURSIVE org_tree AS (
    -- 基础条件：从根节点开始
    SELECT id, name, manager_id, 1 AS depth, ARRAY[id] AS path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- 递归条件：查找下属
    SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || e.id
    FROM employees e
    INNER JOIN org_tree t ON e.manager_id = t.id
    WHERE t.depth < 20  -- 安全深度限制，防止无限递归
)
SELECT
    repeat('  ', depth - 1) || name AS org_chart,
    depth,
    path
FROM org_tree
ORDER BY path;
```

```sql
-- 数据修改 CTE：归档 + 删除一条语句完成
WITH archived AS (
    DELETE FROM orders
    WHERE created_at < '2023-01-01'
    RETURNING *
)
INSERT INTO orders_archive SELECT * FROM archived;
```

## 窗口函数

### ROW_NUMBER / RANK / DENSE_RANK

```sql
-- 每个部门薪资排名
SELECT
    department,
    name,
    salary,
    row_number() OVER w AS rn,         -- 连续编号（无并列）
    rank() OVER w AS rnk,              -- 并列跳号（1,2,2,4）
    dense_rank() OVER w AS dense_rnk   -- 并列不跳号（1,2,2,3）
FROM employees
WINDOW w AS (PARTITION BY department ORDER BY salary DESC);

-- 去重：取每组最新一条（经典用法）
WITH ranked AS (
    SELECT *,
        row_number() OVER (
            PARTITION BY user_id
            ORDER BY created_at DESC
        ) AS rn
    FROM user_events
)
SELECT * FROM ranked WHERE rn = 1;
```

### LAG / LEAD（前后行访问）

```sql
-- 计算环比增长率
SELECT
    month,
    revenue,
    lag(revenue) OVER (ORDER BY month) AS prev_month,
    lead(revenue) OVER (ORDER BY month) AS next_month,
    round(
        (revenue - lag(revenue) OVER (ORDER BY month))::numeric
        / nullif(lag(revenue) OVER (ORDER BY month), 0) * 100,
    2) AS mom_growth_pct
FROM monthly_revenue;

-- lag/lead 带默认值
SELECT
    name,
    lag(name, 1, '(first)') OVER (ORDER BY id) AS prev_name,
    lead(name, 1, '(last)') OVER (ORDER BY id) AS next_name
FROM items;
```

### 聚合窗口函数

```sql
-- 累计求和 / 移动平均
SELECT
    date,
    amount,
    sum(amount) OVER (ORDER BY date) AS running_total,
    avg(amount) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7d,
    count(*) OVER () AS total_rows  -- 不加 ORDER BY = 全分区
FROM daily_sales;

-- 占比计算
SELECT
    category,
    amount,
    round(amount / sum(amount) OVER () * 100, 2) AS pct_of_total,
    round(amount / sum(amount) OVER (PARTITION BY department) * 100, 2) AS pct_of_dept
FROM expenses;
```

### FIRST_VALUE / LAST_VALUE / NTH_VALUE

```sql
SELECT
    department,
    name,
    salary,
    first_value(name) OVER w AS highest_paid,
    last_value(name) OVER w AS lowest_paid,
    nth_value(name, 2) OVER w AS second_highest
FROM employees
WINDOW w AS (
    PARTITION BY department
    ORDER BY salary DESC
    -- 重要：last_value 和 nth_value 需要完整窗口帧
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
);
```

### 窗口帧速查

```sql
ROWS BETWEEN 2 PRECEDING AND CURRENT ROW          -- 当前行 + 前 2 行
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW   -- 分区起始到当前行
RANGE BETWEEN INTERVAL '7 days' PRECEDING AND CURRENT ROW  -- 最近 7 天（值范围）
```

## LATERAL JOIN

LATERAL 允许子查询引用前面 FROM 项的列，相当于"对每一行执行一次子查询"。

```sql
-- 取每个用户最近 3 个订单
SELECT u.id, u.name, recent.*
FROM users u
CROSS JOIN LATERAL (
    SELECT id AS order_id, amount, created_at
    FROM orders
    WHERE orders.user_id = u.id
    ORDER BY created_at DESC
    LIMIT 3
) recent;

-- 等效于 LEFT JOIN LATERAL ... ON true（保留无订单的用户）
SELECT u.id, u.name, recent.*
FROM users u
LEFT JOIN LATERAL (
    SELECT id AS order_id, amount, created_at
    FROM orders
    WHERE orders.user_id = u.id
    ORDER BY created_at DESC
    LIMIT 3
) recent ON true;
```

```sql
-- LATERAL + 集合返回函数：解析 JSONB 数组
SELECT p.id, p.name, tag.value AS tag
FROM products p
CROSS JOIN LATERAL jsonb_array_elements_text(p.tags) AS tag(value);
```

## UPSERT（ON CONFLICT）

```sql
-- 插入或更新（基于唯一约束冲突）
INSERT INTO user_profiles (user_id, bio, avatar_url)
VALUES (123, 'Hello world', 'https://example.com/avatar.jpg')
ON CONFLICT (user_id) DO UPDATE SET
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();

-- 插入或忽略（跳过冲突行）
INSERT INTO tags (name)
VALUES ('postgresql'), ('database'), ('sql')
ON CONFLICT (name) DO NOTHING;

-- 带条件的 UPSERT + 返回结果
INSERT INTO products (sku, name, price, updated_at)
VALUES ('ABC-123', 'Widget', 29.99, now())
ON CONFLICT (sku) DO UPDATE SET
    price = EXCLUDED.price, updated_at = EXCLUDED.updated_at
WHERE products.price <> EXCLUDED.price  -- 只在价格变化时更新
RETURNING id, sku, (xmax = 0) AS was_inserted;
```

## 批量操作

### COPY（最快的批量导入导出）

```sql
-- 从 CSV 文件导入（服务端文件）
COPY users (name, email, created_at)
FROM '/tmp/users.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ',', NULL '');

-- 导出到 CSV
COPY (SELECT * FROM users WHERE created_at > '2024-01-01')
TO '/tmp/recent_users.csv'
WITH (FORMAT csv, HEADER true);

-- 从 stdin 导入（psql 客户端侧）
\copy users (name, email) FROM 'users.csv' WITH (FORMAT csv, HEADER true)

-- 二进制格式（更快但不可读）
COPY large_table TO '/tmp/data.bin' WITH (FORMAT binary);
COPY large_table FROM '/tmp/data.bin' WITH (FORMAT binary);
```

### unnest 批量插入 / 批量更新

```sql
-- unnest 批量插入（适合应用层参数化）
INSERT INTO orders (user_id, product_id, quantity)
SELECT * FROM unnest(
    ARRAY[1, 2, 3]::bigint[],
    ARRAY[101, 102, 103]::bigint[],
    ARRAY[2, 1, 5]::integer[]
);

-- VALUES 列表批量更新
UPDATE products AS p SET price = v.new_price, name = v.new_name
FROM (VALUES (1, 29.99, 'Widget A'), (2, 49.99, 'Widget B')) AS v(id, new_price, new_name)
WHERE p.id = v.id;
```

## 其他实用技巧

```sql
-- generate_series：填充空白日期
SELECT d.day::date, coalesce(count(o.id), 0) AS order_count
FROM generate_series('2024-01-01'::date, '2024-01-31'::date, '1 day') AS d(day)
LEFT JOIN orders o ON o.created_at::date = d.day::date
GROUP BY 1 ORDER BY 1;

-- FILTER：条件聚合（替代 CASE WHEN）
SELECT date_trunc('month', created_at) AS month,
    count(*) FILTER (WHERE status = 'completed') AS completed,
    sum(amount) FILTER (WHERE status = 'completed') AS completed_revenue
FROM orders GROUP BY 1;

-- DISTINCT ON：取每组第一条（ORDER BY 首列须与 DISTINCT ON 列一致）
SELECT DISTINCT ON (user_id) user_id, order_id, amount, created_at
FROM orders ORDER BY user_id, created_at DESC;
```

## 常见陷阱

- **递归 CTE 无限循环**：务必在递归条件中加入终止条件（深度限制或环检测）。没有终止条件时查询会耗尽内存
- **窗口函数的默认帧**：带 ORDER BY 时默认帧是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`，不是整个分区。`last_value()` 在此默认帧下只返回当前行的值，需要显式指定 `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`
- **CTE 物化陷阱（PostgreSQL 11 及更早）**：老版本 CTE 强制物化，不会下推 WHERE 条件。若遇到性能问题，考虑升级到 12+ 或用子查询替代
- **ON CONFLICT 需要唯一约束/唯一索引**：`ON CONFLICT` 只能基于已有的 UNIQUE 约束、UNIQUE 索引或 PRIMARY KEY，不能用普通 WHERE 条件
- **LATERAL 性能**：LATERAL 本质上是嵌套循环，外层结果集大时可能很慢。确保内层子查询有合适的索引
- **COPY 的权限**：`COPY FROM/TO` 读写服务端文件系统，需要超级用户权限。客户端应用使用 `\copy`（psql）或编程语言的 COPY 协议
- **DISTINCT ON 的排序依赖**：`DISTINCT ON` 的列必须出现在 `ORDER BY` 的最前面，否则报错

## 组合提示

配合 `postgresql-schema`（索引优化）确保查询命中索引。复杂查询的性能分析使用 `postgresql-performance`（EXPLAIN ANALYZE）。JSONB 数据的查询与聚合技巧详见 `postgresql-json`。
