---
name: postgresql-ha
description: "PostgreSQL 高可用：流复制、逻辑复制、pg_basebackup 备份、PITR 时间点恢复、Patroni/repmgr 方案。"
tech_stack: [postgresql, backend]
capability: [relational-db, orchestration]
---

# PostgreSQL HA（高可用与灾备）

> 来源：https://www.postgresql.org/docs/current/warm-standby.html
> 版本基准：PostgreSQL 16/17

## 用途

构建 PostgreSQL 的高可用架构，包括主从复制、备份恢复、时间点恢复，确保数据安全性和服务连续性。

## 何时使用

- 需要读写分离（主库写、从库读）
- 需要故障自动切换（failover）
- 需要定期备份和灾难恢复能力
- 需要跨数据库或跨版本的数据同步（逻辑复制）
- 需要从误操作中恢复到任意时间点（PITR）

## 流复制（Streaming Replication）

流复制是 PostgreSQL 原生的物理复制机制，将 WAL（Write-Ahead Log）从主库实时发送到备库。备库可用于只读查询和故障切换。

### 主库配置

```ini
# postgresql.conf（主库）
wal_level = replica                    # 必须为 replica 或 logical
max_wal_senders = 10                   # 最大 WAL 发送进程数
wal_keep_size = '1GB'                  # 保留的 WAL 大小（防备库落后时 WAL 被回收）
synchronous_standby_names = ''         # 异步复制（留空）
# synchronous_standby_names = 'ANY 1 (standby1, standby2)'  # 同步复制
hot_standby = on                       # 允许备库接受只读查询
```

```conf
# pg_hba.conf（主库，允许复制连接）
host    replication    repl_user    10.0.0.0/8    scram-sha-256
```

```sql
-- 创建复制专用角色
CREATE ROLE repl_user WITH REPLICATION LOGIN PASSWORD 'strong_repl_pass';
```

### 备库搭建（pg_basebackup）

```bash
# 在备库机器上执行：使用 pg_basebackup 从主库克隆
pg_basebackup \
    -h primary-host \
    -p 5432 \
    -U repl_user \
    -D /var/lib/postgresql/17/main \
    -Fp \                              # plain 格式
    -Xs \                              # 流式传输 WAL
    -P \                               # 显示进度
    -R                                 # 自动生成 standby.signal 和连接配置

# -R 参数会自动创建：
# /var/lib/postgresql/17/main/standby.signal
# 并在 postgresql.auto.conf 中添加 primary_conninfo
```

### 备库配置

```ini
# postgresql.conf（备库）
hot_standby = on                       # 允许只读查询
hot_standby_feedback = on              # 防止主库 VACUUM 清理备库还需要的行
max_standby_streaming_delay = 30s      # 查询冲突时最大等待时间
max_standby_archive_delay = 30s
```

```ini
# postgresql.auto.conf（pg_basebackup -R 自动生成）
primary_conninfo = 'host=primary-host port=5432 user=repl_user password=strong_repl_pass'
```

```bash
# 备库目录下存在此文件表示进入备库模式
touch /var/lib/postgresql/17/main/standby.signal

# 启动备库
pg_ctl start -D /var/lib/postgresql/17/main
```

### 监控复制状态

```sql
-- 在主库上查看复制状态
SELECT
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes,
    write_lag,
    flush_lag,
    replay_lag
FROM pg_stat_replication;

-- 在备库上查看自身状态
SELECT
    status,
    received_lsn,
    latest_end_lsn,
    latest_end_time,
    pg_last_wal_receive_lsn(),
    pg_last_wal_replay_lsn(),
    pg_last_xact_replay_timestamp(),
    now() - pg_last_xact_replay_timestamp() AS replication_delay
FROM pg_stat_wal_receiver;

-- 检查当前是主库还是备库
SELECT pg_is_in_recovery();  -- true = 备库, false = 主库
```

### 同步复制

```ini
# postgresql.conf（主库）
# 至少 1 个备库确认写入才返回成功（强一致性，但影响写入延迟）
synchronous_standby_names = 'FIRST 1 (standby1, standby2)'

# 或 ANY：任意 N 个确认即可
synchronous_standby_names = 'ANY 1 (standby1, standby2)'

# 同步级别
synchronous_commit = on           # 等待 WAL flush 到备库（默认）
# synchronous_commit = remote_apply  # 等待备库回放完成（最强一致性）
# synchronous_commit = remote_write  # 等待备库写入 OS 缓冲（性能折中）
```

### 手动故障切换

```bash
# 在备库上提升为主库
pg_ctl promote -D /var/lib/postgresql/17/main

# 或使用 SQL
SELECT pg_promote();
```

## 逻辑复制（Logical Replication）

逻辑复制基于行级别的变更事件（INSERT/UPDATE/DELETE），比流复制更灵活：可以选择性复制表、跨版本复制、支持双向复制。

### 发布端（Publisher）配置

```ini
# postgresql.conf
wal_level = logical     # 必须为 logical（比 replica 开销略高）
max_replication_slots = 10
max_wal_senders = 10
```

```sql
-- 创建发布（指定表）
CREATE PUBLICATION my_pub FOR TABLE users, orders;

-- 发布所有表
CREATE PUBLICATION all_tables_pub FOR ALL TABLES;

-- 只发布部分操作
CREATE PUBLICATION insert_only_pub FOR TABLE events
    WITH (publish = 'insert');   -- 只复制 INSERT

-- 行过滤（PostgreSQL 15+）
CREATE PUBLICATION regional_pub FOR TABLE orders
    WHERE (region = 'us');

-- 列过滤（PostgreSQL 15+）
CREATE PUBLICATION partial_pub FOR TABLE users (id, name, email);
```

### 订阅端（Subscriber）配置

```sql
-- 创建订阅（自动初始同步 + 持续复制）
CREATE SUBSCRIPTION my_sub
    CONNECTION 'host=publisher-host port=5432 dbname=myapp user=repl_user password=pass'
    PUBLICATION my_pub;

-- 跳过初始数据同步（表已有数据时）
CREATE SUBSCRIPTION my_sub
    CONNECTION 'host=publisher-host port=5432 dbname=myapp user=repl_user password=pass'
    PUBLICATION my_pub
    WITH (copy_data = false);

-- 管理订阅
ALTER SUBSCRIPTION my_sub DISABLE;                  -- 暂停
ALTER SUBSCRIPTION my_sub ENABLE;                   -- 恢复
ALTER SUBSCRIPTION my_sub REFRESH PUBLICATION;      -- 刷新表列表
DROP SUBSCRIPTION my_sub;                           -- 删除
```

### 监控逻辑复制

```sql
-- 发布端：查看复制槽状态
SELECT
    slot_name,
    plugin,
    slot_type,
    active,
    pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
FROM pg_replication_slots;

-- 订阅端：查看订阅状态
SELECT
    subname,
    received_lsn,
    latest_end_lsn,
    latest_end_time
FROM pg_stat_subscription;
```

### 流复制 vs 逻辑复制

| 维度 | 流复制 | 逻辑复制 |
|------|--------|---------|
| 复制粒度 | 整个集群（物理） | 表级别（逻辑） |
| 跨版本 | 不支持 | 支持（可用于滚动升级） |
| 选择性复制 | 不支持 | 支持（表/列/行过滤） |
| 备库可写 | 不可写 | 可写（注意冲突） |
| 性能开销 | 低 | 略高（需要解码 WAL） |
| 故障切换 | 原生支持（promote） | 不直接支持 failover |
| 主要用途 | HA + 读扩展 | 数据分发 + 版本迁移 |

## pg_basebackup 备份

### 基础备份

```bash
# plain 格式备份
pg_basebackup -h primary-host -U repl_user \
    -D /backup/base/$(date +%Y%m%d) -Fp -Xs -P --checkpoint=fast

# tar 压缩格式（便于传输和存储）
pg_basebackup -h primary-host -U repl_user \
    -D /backup/base/$(date +%Y%m%d) -Ft -z -Xs -P
```

### WAL 归档（持续备份）

```ini
# postgresql.conf
archive_mode = on
archive_command = 'cp %p /backup/wal/%f'
archive_timeout = 300   # 即使 WAL 未写满也每 5 分钟强制归档一次
```

## PITR（时间点恢复）

PITR 允许将数据库恢复到过去任意时间点，是应对误操作（误删表、错误 UPDATE）的最后手段。

### 前置条件

- 有一个基础备份（pg_basebackup）
- 有从基础备份时间到目标恢复时间的连续 WAL 归档

### 恢复步骤

```bash
# 1. 停止 PostgreSQL
pg_ctl stop -D /var/lib/postgresql/17/main

# 2. 备份当前数据目录（以防恢复失败）
mv /var/lib/postgresql/17/main /var/lib/postgresql/17/main.broken

# 3. 从基础备份恢复
# plain 格式
cp -r /backup/base/20240115 /var/lib/postgresql/17/main

# tar 格式
mkdir /var/lib/postgresql/17/main
tar xzf /backup/base/20240115/base.tar.gz -C /var/lib/postgresql/17/main

# 4. 配置恢复参数
cat >> /var/lib/postgresql/17/main/postgresql.auto.conf << 'EOF'
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2024-01-15 14:30:00+08'
# 其他恢复目标选项：
# recovery_target_xid = '12345'           # 恢复到特定事务
# recovery_target_lsn = '0/1234568'       # 恢复到特定 LSN
# recovery_target = 'immediate'           # 恢复到一致状态即停止
recovery_target_action = 'pause'           # 恢复后暂停（可检查数据）
# recovery_target_action = 'promote'      # 恢复后自动提升为主库
EOF

# 5. 创建恢复信号文件
touch /var/lib/postgresql/17/main/recovery.signal

# 6. 启动 PostgreSQL（开始恢复）
pg_ctl start -D /var/lib/postgresql/17/main

# 7. 检查恢复状态
psql -c "SELECT pg_is_in_recovery();"   -- 应该返回 true

# 8. 确认数据正确后，手动提升
psql -c "SELECT pg_wal_replay_resume();"  -- 如果 action=pause
psql -c "SELECT pg_promote();"
```

**恢复目标选项**：`recovery_target_time`（时间）、`recovery_target_xid`（事务ID）、`recovery_target_lsn`（WAL位置）、`recovery_target_name`（还原点，需提前 `SELECT pg_create_restore_point('name')`）。

## 高可用方案

### Patroni（推荐）

Patroni 是基于分布式共识（etcd/ZooKeeper/Consul）的自动化 HA 方案，提供自动故障检测和切换。

```yaml
# patroni.yml 核心配置（简化版）
scope: pg-cluster
name: node1
etcd3:
  hosts: [10.0.0.10:2379, 10.0.0.11:2379, 10.0.0.12:2379]
bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    maximum_lag_on_failover: 1048576  # 1MB
    postgresql:
      use_pg_rewind: true             # 旧主库自动重新同步
      parameters:
        wal_level: replica
        hot_standby: on
        max_wal_senders: 10
        max_replication_slots: 10
postgresql:
  listen: 0.0.0.0:5432
  connect_address: 10.0.0.1:5432
  data_dir: /var/lib/postgresql/17/main
```

**Patroni 关键特性**：自动 leader election + failover（基于 etcd/ZK/Consul）、`pg_rewind` 旧主库自动重新加入、REST API 管理、计划内 switchover。

```bash
patronictl -c /etc/patroni.yml list          # 查看集群状态
patronictl -c /etc/patroni.yml switchover    # 计划内主从切换
patronictl -c /etc/patroni.yml failover      # 强制故障切换
```

### repmgr

repmgr 是较轻量的复制管理工具，提供集群管理和故障切换功能，但自动化程度低于 Patroni。

```bash
# 注册主库
repmgr -f /etc/repmgr.conf primary register

# 克隆并注册备库
repmgr -h primary-host -U repmgr -d repmgr -f /etc/repmgr.conf standby clone
repmgr -f /etc/repmgr.conf standby register

# 手动切换
repmgr -f /etc/repmgr.conf standby switchover --siblings-follow

# 启动 failover 守护进程
repmgrd -f /etc/repmgr.conf --daemonize
```

### 方案对比

| 维度 | Patroni | repmgr | 原生流复制 |
|------|---------|--------|-----------|
| 自动 Failover | 完整支持 | 需 repmgrd | 不支持 |
| 共识机制 | etcd/ZK/Consul | 无（投票机制） | 无 |
| 脑裂防护 | 强（分布式锁） | 弱 | 无 |
| 运维复杂度 | 中（需维护 etcd） | 低 | 最低 |
| 社区活跃度 | 高（Zalando 维护） | 中（2ndQuadrant） | - |
| 推荐场景 | 生产环境首选 | 小规模、简单环境 | 开发/测试 |

## 常见陷阱

- **WAL 保留不足**：备库断开连接后，如果主库的 WAL 已被回收，备库无法重新同步。务必设置足够大的 `wal_keep_size` 或使用 replication slot（但 slot 会阻止 WAL 回收，磁盘可能爆满）
- **同步复制降低写入性能**：`synchronous_commit = on` 会等待至少一个备库确认，写入延迟显著增加。评估业务对一致性的要求，非关键数据可用异步复制
- **逻辑复制不复制 DDL**：`ALTER TABLE`、`CREATE INDEX` 等 DDL 不会通过逻辑复制传播。需要在订阅端手动执行 DDL 变更
- **逻辑复制冲突**：如果订阅端表上有独立的写入操作，可能与复制的数据冲突（唯一键冲突等），导致复制暂停
- **PITR 恢复不可逆**：一旦开始恢复，原数据目录会被覆盖。务必在恢复前备份当前数据目录
- **pg_basebackup 期间的磁盘空间**：需要目标目录有足够空间容纳整个数据库。备份期间主库会额外保留 WAL
- **Patroni 的 etcd 可用性**：Patroni 依赖 etcd 集群做共识。如果 etcd 集群不可用，Patroni 会将主库降级以防止脑裂。确保 etcd 至少 3 节点且健康
- **热备库查询冲突**：备库执行只读查询时，如果主库的 VACUUM 操作需要清理备库正在读取的行，会产生冲突。通过 `max_standby_streaming_delay` 和 `hot_standby_feedback` 控制

## 组合提示

部署前先参考 `postgresql-core`（基础配置和认证）。生产环境必须配合 `postgresql-performance`（共享内存参数、PgBouncer 连接池）。备库可用于读扩展，查询优化参考 `postgresql-queries` 和 `postgresql-schema`（索引策略）。
