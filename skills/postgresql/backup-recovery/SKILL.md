---
name: postgresql-backup-recovery
description: PostgreSQL 备份与恢复（pg_dump 逻辑备份、pg_basebackup 基础备份、WAL 归档与 PITR）
tech_stack: [postgresql]
capability: [relational-db]
version: "postgresql unversioned"
collected_at: 2026-04-18
---

# PostgreSQL 备份与恢复

> 来源：https://www.postgresql.org/docs/current/backup.html, continuous-archiving.html, app-pgdump.html, runtime-config-wal.html

## 用途
保护 PostgreSQL 数据不因崩溃、硬件故障、人为误操作而丢失。三种备份路径：SQL dump（逻辑）、文件系统备份（物理）、持续归档 + WAL 回放（PITR）。

## 何时使用
- **pg_dump / pg_dumpall**：临时导出、跨版本/跨架构迁移、选择性恢复、向非 PG 产品迁移。**不适合**生产环境的常规备份。
- **pg_basebackup + WAL 归档**：生产高可靠场景，支持 PITR、Warm Standby、接近零数据丢失。
- **Standalone hot backup**（`pg_basebackup -X`）：比 pg_dump 快，但不支持 PITR。
- **增量备份**（PG17+ `pg_basebackup --incremental`）：大库 + 变更少的场景，恢复时用 `pg_combinebackup` 合成全量。

## 基础用法

### pg_dump 逻辑备份
```bash
# 自定义格式（推荐，支持 pg_restore 选择性恢复）
pg_dump -Fc mydb > db.dump
pg_restore -d newdb db.dump

# 并行目录格式（最快，仅 -Fd 支持）
pg_dump -Fd mydb -f dumpdir -j 5

# 覆盖恢复同一库
pg_restore -d mydb --clean --if-exists db.dump
```

### 持续归档（PITR）
`postgresql.conf`:
```conf
wal_level = replica            # 或更高；minimal 不支持归档
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
archive_timeout = 60           # 限制数据丢失窗口（分钟级以内合理）
```

拍 base backup：
```bash
pg_basebackup -D /backup/base -Ft -z -P
```

### PITR 恢复流程
1. 停库 → 清空数据目录 → 复原 base backup
2. 清空 `pg_wal/`，如有未归档 WAL 复制进去
3. `postgresql.conf` 设置 `restore_command`、可选 `recovery_target_*`
4. 创建 `recovery.signal` → 启动服务器

```conf
restore_command = 'cp /archive/%f %p'
recovery_target_time = '2026-04-18 10:00:00'
recovery_target_action = 'promote'    # 到达目标后直接提升为主库
```

## 关键 API（摘要）

### WAL / 归档配置
- `wal_level`：`replica`（默认）支持归档与流复制；`logical` 支持逻辑解码；`minimal` 不够 PITR
- `archive_mode`：`on` / `always`（standby 也归档）
- `archive_command` / `archive_library`：完成归档时执行；必须**零退出码代表成功**，**拒绝覆盖已有文件**
- `archive_timeout`：强制切 WAL 段上限（勿设过短，会撑爆归档）
- `synchronous_commit`：`on`（默认，本地落盘）/ `remote_apply` / `remote_write` / `local` / `off`
- `full_page_writes`：默认 `on`；关闭减小 WAL 但风险是部分页写损坏
- `checkpoint_timeout` 默认 5min；`max_wal_size` 默认 1GB
- `summarize_wal`：增量备份前提，默认 `off`

### 恢复目标
- `restore_command`：归档恢复必填，拉取 WAL 段
- `recovery_target_time` / `_xid` / `_lsn` / `_name` / `= 'immediate'`
- `recovery_target_inclusive`（默认 on）、`recovery_target_timeline`（默认 `latest`）
- `recovery_target_action`：`pause`（默认）/ `promote` / `shutdown`

### pg_dump 常用选项
- `-Fc`（custom）、`-Fd`（directory，**唯一支持并行 `-j`**）、`-Fp`（plain，默认）、`-Ft`（tar）
- `-a` data-only / `-s` schema-only / `-c` DROP 后重建 / `-C` 含 CREATE DATABASE
- `-n schema` / `-t table` / `-T exclude-table`
- `-Z gzip|lz4|zstd:级别`
- `--enable-row-security`：RLS 表导出需显式开启，否则默认只导出当前可见行
- `--if-exists` 配合 `-c` 使用

### 低层备份 API
- `SELECT pg_backup_start('label', fast => false)` → 拷贝数据目录 → `SELECT * FROM pg_backup_stop(wait_for_archive => true)`
- 将返回的第二列写入 backup 根目录 `backup_label`，第三列若非空写入 `tablespace_map`

## 注意事项
- `pg_dump` 不能作为持续归档方案的一部分，**不是**文件系统级备份
- `pg_dump` 可以从**旧版** PG 导出到新版，但不能从更高 major 版本导出
- `pg_basebackup` 之后需要保证 base backup 起始时间之前的 WAL 一直可用，归档**先于**首次 base backup 启用并测试
- 归档命令必须拒绝覆盖已有文件；写 shell 脚本更便于错误日志（启用 `logging_collector` 可在 server log 里看到 stderr）
- 备份中要**排除** `pg_wal/` 与 `pg_replslot/`；`pg_dynshmem/` `pg_notify/` `pg_serial/` `pg_snapshots/` `pg_stat_tmp/` `pg_subtrans/` 内容可省（目录需保留）
- `CREATE DATABASE`、`CREATE TABLESPACE` 期间的 base backup 有陷阱：tablespace 路径是 WAL 绝对路径，跨机恢复会踩坑 → 变更后重新拍 base backup
- 归档恢复不恢复 `postgresql.conf` / `pg_hba.conf` / `pg_ident.conf`
- 如果归档命令持续失败，`pg_wal/` 会撑爆磁盘，触发 PANIC 停库 → 监控必备
- 归档恢复完成会生成新 timeline，默认走 `latest`；要恢复到分支 timeline 需显式指定
- 增量备份的依赖链需**自行跟踪**，PG 不管理链关系；在 standby 上若最近无活动增量备份可能失败
- 恢复 dump 会执行任意 SQL，源超级用户不可信则需先审查脚本

## 组合提示
与 `postgresql-replication`（Warm Standby / 流复制共享 WAL 归档）、`postgresql-row-level-security`（pg_dump `--enable-row-security` 陷阱）常一起使用。
