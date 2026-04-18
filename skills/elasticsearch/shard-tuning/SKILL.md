---
name: elasticsearch-shard-tuning
description: 调优 Elasticsearch 分片规模、索引 / 搜索速度与 JVM 内存压力
tech_stack: [elasticsearch]
capability: [search-engine]
version: "elasticsearch unversioned"
collected_at: 2026-04-18
---

# Elasticsearch 分片与性能调优

> 来源：https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/

## 用途
针对高吞吐写入、低延迟查询和 JVM 压力场景，给出分片规模、索引参数、搜索参数和 GC 诊断的最佳实践。

## 何时使用
- 新集群容量规划：决定 primary / replica / shard 数
- 批量导入历史数据（bulk backfill）
- 查询延迟回归排查
- 节点 JVM old gen 持续 >85%，频繁触发 circuit breaker

## 分片规模基线
- 单分片大小 **10GB ~ 50GB**
- 单分片文档数 **< 200,000,000**（Lucene 硬上限 2,147,483,519）
- 每节点 **≤ 1,000 非 frozen shard**；专用 frozen node **≤ 3,000 frozen shard**
- master-eligible 节点：**每 3,000 索引预留 ≥ 1GB heap**
- 更少更大的分片比更多更小的开销小（搜索单分片单线程，分片多不等于快）

### 减少分片数量的手段
- 增大单索引覆盖时间窗
- 删空索引 / 无用索引
- 低峰期 `force_merge`
- `_shrink` 收缩现有索引
- `_reindex` 合并小索引

### 防止热点
```
PUT my-index/_settings
{ "index.routing.allocation.total_shards_per_node": N }
```

## 索引速度优化

| 手段 | 要点 |
|------|------|
| Bulk 请求 | 起步 100 doc，翻倍直到不再提升；单请求 < 数十 MB |
| 并发 worker | 多线程并发写，遇到 `429 TOO_MANY_REQUESTS` 做指数退避 |
| Refresh interval | 重写入期间设 `-1`，结束后恢复并 force merge；有搜索流量时可设 `30s` |
| 副本数 | 大批量初始导入时 `number_of_replicas=0`（需外部备份兜底），完成后恢复 |
| Doc ID | 用自动生成 ID，跳过存在性检查 |
| Memory | 至少一半系统内存给 filesystem cache；关闭 swap；`indices.memory.index_buffer_size` 每分片上限 512MB |
| 存储 | SSD > HDD，直连 > 远程 |

### 关闭 refresh 示例
```json
PUT my-index/_settings
{ "index": { "refresh_interval": "-1" } }
```

## 搜索速度优化
- **文档建模**：避免 join，denormalize；nested 慢数倍，parent-child 慢数百倍
- **字段**：标识符用 `keyword` 而非数值（term 查询更快）；`copy_to` 合并多字段搜索
- **查询**：用定值日期替代 `now` 提升缓存命中；`preference` 参数稳定路由；避免脚本（尤其排序 / 聚合）
- **只读索引**：`force_merge` 到 1 segment；对高聚合 keyword 预热 global ordinals；慎用 `index.store.preload`
- **高级**：index sorting、`index_phrases`、`index_prefixes`、`constant_keyword`
- **副本数经验值**：`max(max_failures, ceil(num_nodes / num_primaries) - 1)`
- **分析**：Profile API / Kibana Search Profiler；`open_contexts` 过高意味着 scroll 未及时清理

## JVM 内存压力诊断

### 查看节点 memory pressure
```bash
cat nodes_stats.json | jq -rc '.nodes[]|.name as $n|.jvm.mem.pools.old|{name:$n, memory_pressure:(100*.used_in_bytes/.max_in_bytes|round) }'
```

### GC 健康指标
- Young GC：< 50ms，约每 10s 一次
- Old GC：< 1s，≤ 每 10min 一次

### 缓解策略
- 关闭 OS swap；heap 不超过一半系统内存；`Xms == Xmx`
- 保持 heap < 30GB 以启用 Compressed OOPs
- 减少分片数（见上）
- 流量层：降低 `index.max_result_window`、`search.max_buckets`、`search.allow_expensive_queries=false`、启用 slow log
- 字段：避免在 text 字段启用 fielddata，改用 multi-field keyword；高基数字段减少 global ordinal 计算；必要时 clear cache
- Heap dump 定位根因

## 注意事项
- 删整个索引而非单文档：删除文档只打 tombstone，等 segment merge 才真正回收
- 分片数上限超出时临时调大 `cluster.max_shards_per_node`，再加节点或减分片
- 关闭副本做初始导入前必须有外部备份
- bulk 请求并发过高会把集群打挂，务必处理 429
- `refresh_interval=-1` 期间搜索读不到新文档，需在导入结束后恢复

## 组合提示
- 时序场景用 **data stream + ILM** 自动 rollover，天然满足分片规模准则
- cross-cluster replication 分离写与读负载
- 与 **elasticsearch-ilm** skill 搭配：rollover 阈值 `max_primary_shard_size` 直接对齐 10–50GB 基线
