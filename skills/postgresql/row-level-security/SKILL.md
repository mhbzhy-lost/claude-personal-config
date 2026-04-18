---
name: postgresql-row-level-security
description: PostgreSQL 行级安全（RLS）策略定义、permissive/restrictive 组合与陷阱
tech_stack: [postgresql]
language: [sql]
capability: [relational-db, permission]
version: "postgresql unversioned"
collected_at: 2026-04-18
---

# PostgreSQL 行级安全（RLS）

> 来源：https://www.postgresql.org/docs/current/ddl-rowsecurity.html, sql-createpolicy.html

## 用途
按用户/角色在行维度限制表的可见性与可写性。多租户隔离、同表多用户数据共享但仅改自有记录、实现类 Unix 权限语义。

## 何时使用
- 多租户 SaaS：租户只看自己的数据
- 业务表：所有人可读，仅本人可改
- 审计/脱敏场景：按角色屏蔽敏感行
- 数据库层强制安全，**不依赖**应用层过滤

## 基础用法

```sql
-- 1. 开启表的 RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- 2. 定义策略：每个 manager 只见自己名下的行
CREATE POLICY account_managers ON accounts
    TO managers
    USING (manager = current_user);
```

无 `WITH CHECK` 时，策略的 `USING` 同时作为写检查（防止 manager 插入/改成别人名下的行）。

```sql
-- 所有人可读，仅改自己（多策略组合）
CREATE POLICY user_sel ON users FOR SELECT USING (true);
CREATE POLICY user_mod ON users USING (user_name = current_user);
```

## 关键 API（摘要）

### CREATE POLICY 语法
```sql
CREATE POLICY name ON table_name
    [ AS { PERMISSIVE | RESTRICTIVE } ]         -- 默认 PERMISSIVE
    [ FOR { ALL | SELECT | INSERT | UPDATE | DELETE } ]
    [ TO { role_name | PUBLIC | CURRENT_USER | ... } [, ...] ]
    [ USING (visibility_expr) ]                  -- 哪些行可见/可改
    [ WITH CHECK (write_expr) ]                  -- 写入/更新后的新行必须满足
```

### 命令-子句适用性
| 命令 | USING | WITH CHECK |
|------|-------|-----------|
| SELECT | 是 | **否** |
| INSERT | **否** | 是 |
| UPDATE | 是（原行） | 是（新行） |
| DELETE | 是 | **否** |
| ALL | 是，且兼做 WITH CHECK（若未单独指定） | 是 |

### 策略组合规则
- **PERMISSIVE**（默认）之间 `OR`，至少一条通过才放行
- **RESTRICTIVE** 之间 `AND`，必须全部通过
- 最终：`(OR of permissives) AND (AND of restrictives)`
- **只有 restrictive 没有 permissive → 完全禁止**
- 跨命令组合（UPDATE 隐含 SELECT）用 `AND`

### 开关与 bypass
```sql
ALTER TABLE t ENABLE  ROW LEVEL SECURITY;      -- 启用
ALTER TABLE t DISABLE ROW LEVEL SECURITY;      -- 禁用（策略仍保留，不生效）
ALTER TABLE t FORCE   ROW LEVEL SECURITY;      -- 表 owner 也受策略约束
ALTER TABLE t NO FORCE ROW LEVEL SECURITY;
```
- Superuser 与 `BYPASSRLS` 属性角色**始终**绕过 RLS
- Table owner 默认绕过，除非 FORCE
- 参数 `SET row_security = off`：若查询会被策略过滤则**报错**（备份场景防静默丢行）

### 常见配套命令
```sql
ALTER POLICY ...
DROP POLICY name ON table_name;
CREATE ROLE foo BYPASSRLS;
```

## 注意事项
- **默认拒绝**：表启用 RLS 后如没有任何策略，所有人（非 owner/非 BYPASSRLS）看不到任何行
- **TRUNCATE、REFERENCES、外键约束、唯一约束、PK 检查**都**不经过 RLS**，可能通过约束报错信息形成隐蔽通道泄露数据
- 策略表达式**以查询用户的权限**执行，引用的表/函数用户必须有权访问
- 子查询/函数型策略有**竞态漏洞**：`SELECT ... FOR UPDATE` 可能绕过，推荐子查询用 `SELECT ... FOR SHARE` 或对引用表加 `ACCESS EXCLUSIVE` 锁
- `LEAKPROOF` 函数可能先于策略求值，选函数时要谨慎
- 没有 `MERGE` 的独立策略，按实际执行的 SELECT/INSERT/UPDATE/DELETE 动作分别适用
- `pg_dump` 默认 `row_security = off`（导全量）；对启用 RLS 的表须用 `--enable-row-security`，否则导出会报错（提醒管理员确认语义）
- `USING` 返回 false/null → 行不可见（无报错）；`WITH CHECK` 返回 false/null → **抛错并中止命令**
- 策略名按表命名空间，不同表可重名
- BEFORE ROW 触发器可能修改将要写入的行 → WITH CHECK 在触发器后、其他约束前执行

## 组合提示
与 `postgresql-backup-recovery`（pg_dump `--enable-row-security` 行为）、角色/GRANT 权限体系、应用的 session 变量（如 `SET app.current_tenant`）常结合使用。
