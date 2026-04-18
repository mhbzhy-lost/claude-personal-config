---
name: postgresql-replication
description: PostgreSQL 复制体系（流复制 / 逻辑复制 / Hot Standby / 同步复制 / 级联）
tech_stack: [postgresql]
capability: [relational-db]
version: "postgresql unversioned"
collected_at: 2026-04-18
---

# PostgreSQL 复制

> 来源：https://www.postgresql.org/docs/current/warm-standby.html, logical-replication.html, hot-standby.html, monitoring-stats.html

## 用途
构建高可用集群、只读扩展、跨版本/跨平台迁移。物理复制（基于 WAL 字节）保证 byte-for-byte 一致；逻辑复制（基于复制标识）允许跨版本、部分表、发布订阅模型。

## 何时使用
- **流复制 + Hot Standby**：主备 HA，备库同时承担只读查询
- **同步复制**：金融级零数据丢失，付出提交延迟代价
- **逻辑复制**：跨主版本升级、部分表复制、合并多库、跨 OS 平台
- **级联复制**：减少主库直连数，跨站点带宽优化
- **Warm Standby（纯文件日志搬运）**：不需要低延迟的灾备

## 基础用法

### 主库准备（流复制）
```conf
# postgresql.conf
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
```
```conf
# pg_hba.conf
host  replication  repl_user  192.168.1.0/24  scram-sha-256
```
```sql
CREATE ROLE repl_user WITH REPLICATION LOGIN PASSWORD 'xxx';
SELECT pg_create_physical_replication_slot('standby_slot');
```

### 备库启动
```bash
pg_basebackup -h primary -U repl_user -D /var/lib/pg/data -R -X stream -S standby_slot
```
`-R` 会自动生成 `standby.signal` + `postgresql.auto.conf`，其中包含：
```conf
primary_conninfo = 'host=primary port=5432 user=repl_user password=xxx'
primary_slot_name = 'standby_slot'
restore_command = 'cp /archive/%f %p'    # 可选
```

### 启用 Hot Standby（备库可读）
```conf
hot_standby = on
```

## 关键 API（摘要）

### 核心参数
- **主库**：`wal_level = replica|logical`、`max_wal_senders`、`max_replication_slots`、`wal_keep_size`、`max_slot_wal_keep_size`
- **备库**：`primary_conninfo`、`primary_slot_name`、`restore_command`、`recovery_target_timeline = 'latest'`、`hot_standby = on`
- **备库共享内存**（必须 ≥ 主库）：`max_connections`、`max_prepared_transactions`、`max_locks_per_transaction`、`max_wal_senders`、`max_worker_processes`

### 同步复制
```conf
synchronous_standby_names = 'FIRST 2 (s1, s2, s3)'   # 按优先级
synchronous_standby_names = 'ANY 2 (s1, s2, s3)'     # 仲裁
synchronous_commit = on           # on/remote_write/remote_apply/local/off
```

### 提升备库
```bash
pg_ctl promote -D /var/lib/pg/data
# 或 SQL: SELECT pg_promote();
```

### 冲突缓解
- `hot_standby_feedback = on`：备库反馈 xmin，阻止主库 VACUUM 清理备库在用的行
- `max_standby_archive_delay` / `max_standby_streaming_delay`：查询被取消前等待 WAL 回放的最长时间

### 逻辑复制
```sql
-- 发布端
CREATE PUBLICATION pub_all FOR ALL TABLES;
-- 订阅端
CREATE SUBSCRIPTION sub_a CONNECTION 'host=... dbname=...' PUBLICATION pub_all;
```

### 监控
- `pg_stat_replication`（主库视角，每个 walsender 一行：`sent_lsn`, `write_lsn`, `flush_lsn`, `replay_lsn`, `write_lag`, `flush_lag`, `replay_lag`, `sync_state`）
- `pg_stat_wal_receiver`（备库视角）
- 滞后：`pg_current_wal_lsn()` - `pg_last_wal_receive_lsn()`

### Hot Standby 允许/禁止
- 允许：`SELECT`、`COPY TO`、`DECLARE/FETCH`、`SET`、只读事务、`PREPARE/EXECUTE`、`LOAD`
- 禁止：所有 DML、DDL、`SELECT FOR UPDATE/SHARE`、`nextval/setval`、`LISTEN/NOTIFY`、`PREPARE TRANSACTION`、`CREATE INDEX/GRANT/ANALYZE/VACUUM/CLUSTER/REINDEX`

## 注意事项
- 硬件架构必须一致（32/64 位不能混）；跨 major 版本**不能**物理复制
- 升级时**先升备库再升主库**（minor 版本）
- 异步复制天然有数据丢失窗口；同步复制若所有同步备库挂掉，主库会**卡住**所有写入
- 复制槽会无限保留 WAL，可能撑爆 `pg_wal` → 必须设 `max_slot_wal_keep_size`
- 备库 `max_connections` 等参数**必须 ≥ 主库**，否则恢复会 pause
- Hot standby 不支持 Serializable 隔离级别
- Hot standby 仍会写"hint bits"磁盘写
- `DROP DATABASE` / `ALTER DATABASE ... SET TABLESPACE` 会让备库该库所有连接立即断开
- 级联复制当前**仅异步**；同步参数对下游无效
- 逻辑复制若订阅端也有其他写入，会产生冲突
- 共享 WAL 归档时，备库 `archive_command` 必须先判存在且内容一致才允许覆盖

## 组合提示
与 `postgresql-backup-recovery`（WAL 归档共享设施、PITR 与备库互为补充）、Patroni/repmgr 等 HA 编排工具常一起使用。
