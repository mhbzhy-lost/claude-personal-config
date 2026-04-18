---
name: redis-persistence
description: Redis 持久化（RDB 快照、AOF 日志、混合模式与备份策略）
tech_stack: [redis]
capability: [key-value-store]
version: "redis unversioned"
collected_at: 2026-04-18
---

# Redis 持久化

> 来源：https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/

## 用途
防止 Redis 进程重启/崩溃导致内存数据全丢。提供三档可选：RDB（周期快照）、AOF（写日志）、RDB+AOF 混合（生产推荐）。

## 何时使用
- **RDB + AOF 混合**：生产推荐，兼顾快恢复与秒级耐久
- **仅 RDB**：能容忍几分钟数据丢失、追求最高性能/备份友好
- **仅 AOF**：不推荐，缺失快照就没有快恢复与离线备份
- **都关闭**：纯缓存、可从上游重建

## 基础用法

### RDB 配置（redis.conf）
```conf
save 3600 1        # 1 小时内 ≥1 key 变更
save 300 100       # 5 分钟内 ≥100 key
save 60 10000      # 1 分钟内 ≥10000 key
dbfilename dump.rdb
dir /var/lib/redis
```

### 开启 AOF
```conf
appendonly yes
appendfsync everysec      # 默认推荐：后台线程每秒 fsync
# appendfsync always      # 每命令 fsync，最安全但最慢
# appendfsync no          # 由 OS 决定（~30s）
```

### 运行时开启（不重启）
```bash
redis-cli config set appendonly yes
redis-cli config set appendfsync everysec
redis-cli config rewrite
```

## 关键 API（摘要）

### RDB
- 机制：`fork()` 子进程用 COW 写临时文件，原子替换
- 主进程**零磁盘 IO**，性能好；大库 fork 本身可能卡几十 ms ~ 1s
- 命令：`BGSAVE`（后台）、`SAVE`（阻塞，几乎不用）、`LASTSAVE`

### AOF
- 机制：所有写命令以 RESP 协议格式追加到 AOF 文件，重启回放
- Redis 7.0+ 采用 base + incremental 多文件（`appenddirname` 目录）
- 命令：`BGREWRITEAOF` 手动触发 rewrite
- 自动 rewrite：`auto-aof-rewrite-percentage 100` + `auto-aof-rewrite-min-size 64mb`

### fsync 策略对比
| 策略 | 最大丢失 | 延迟 |
|------|---------|------|
| `always` | 0（确认后落盘） | 高 |
| `everysec`（默认） | ≤ 1 秒 | 低 |
| `no` | 几秒~30秒（看 OS） | 最低 |

### 启动优先级
RDB + AOF 同时存在时，Redis **加载 AOF**（通常更新）。

### 从 RDB 切到 AOF（在线）
1. 备份 `dump.rdb`
2. `config set appendonly yes`
3. （可选）`config set save ""` 关闭 RDB
4. `config rewrite` 持久化到 conf
5. 重启前确认：`INFO persistence` 中 `aof_rewrite_in_progress=0`、`aof_rewrite_scheduled=0`、`aof_last_bgrewrite_status=ok`

### 备份 AOF（Redis 7.0+）
```bash
redis-cli config set auto-aof-rewrite-percentage 0
# 确认 INFO persistence aof_rewrite_in_progress=0
cp -r $appenddirname /backup/aof-$(date +%F)
redis-cli config set auto-aof-rewrite-percentage 100
```
RDB 文件可直接拷贝，运行中也安全。

## 注意事项
- **仅 RDB** 崩溃会丢上次快照以来所有写
- **fork 抖动**：大数据集 fork 可能导致主进程数百 ms 卡顿；透明大页（THP）会放大影响，生产应关闭 THP
- **`appendfsync always`** 延迟显著升高，仅在对单次丢失零容忍时启用
- **`appendfsync no`** OS 崩溃可能丢几十秒（Linux 默认 30s 脏页刷盘）
- **Redis < 7.0** AOF rewrite 期间主进程额外缓冲，内存翻倍、磁盘双写
- **AOF 备份** 必须先停 rewrite 再拷贝，否则文件集不一致
- 备份策略建议：hourly 保留 48h + daily 保留 1~2 月 + 至少一份异地
- `save ""` 才是真的禁用 RDB；只删 `save` 行仍保留默认策略
- RDB 损坏可 `redis-check-rdb`，AOF 损坏可 `redis-check-aof --fix`

## 组合提示
与 `redis-sentinel`（replica 全量同步用 RDB 传输）、备份调度（S3/异地同步）、监控告警（`INFO persistence` 的 `rdb_last_bgsave_status` / `aof_last_write_status`）常搭配。
