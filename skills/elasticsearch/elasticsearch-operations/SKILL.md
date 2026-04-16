---
name: elasticsearch-operations
description: "Elasticsearch 运维管理：集群监控、分片策略、索引生命周期、模板管理、性能调优与备份恢复"
tech_stack: [elasticsearch]
---

# Elasticsearch 运维与管理

> 来源：https://www.elastic.co/guide/en/elasticsearch/reference/current/
> 版本基准：Elasticsearch 8.x

## 用途

管理和运维 Elasticsearch 集群：监控集群健康状态、规划分片策略、配置索引生命周期管理（ILM）、使用模板统一索引配置、调优搜索和写入性能、实施备份恢复策略。

## 何时使用

- 部署或扩容 Elasticsearch 集群
- 监控集群健康状态和诊断问题
- 管理时序数据（日志、指标）的自动轮转和清理
- 统一管理多个索引的 mapping 和 settings
- 解决搜索延迟、写入瓶颈等性能问题
- 实施灾难恢复和数据备份策略

## 集群健康与监控

### 集群健康状态

```bash
# 集群整体健康
curl -X GET "localhost:9200/_cluster/health?pretty"
# 响应示例：
# {
#   "cluster_name": "my-cluster",
#   "status": "green",
#   "number_of_nodes": 3,
#   "number_of_data_nodes": 3,
#   "active_primary_shards": 15,
#   "active_shards": 30,
#   "relocating_shards": 0,
#   "initializing_shards": 0,
#   "unassigned_shards": 0,
#   "active_shards_percent_as_number": 100.0
# }

# 索引级别健康
curl -X GET "localhost:9200/_cluster/health?level=indices&pretty"

# 分片级别健康
curl -X GET "localhost:9200/_cluster/health?level=shards&pretty"

# 等待特定状态（用于启动脚本）
curl -X GET "localhost:9200/_cluster/health?wait_for_status=green&timeout=60s"
```

```python
from elasticsearch import Elasticsearch

es = Elasticsearch("http://localhost:9200")

health = es.cluster.health()
print(f"Status: {health['status']}")
print(f"Nodes: {health['number_of_nodes']}")
print(f"Unassigned shards: {health['unassigned_shards']}")
```

### _cat API（人类可读格式）

```bash
# 索引列表（含健康状态、文档数、存储大小）
curl -X GET "localhost:9200/_cat/indices?v&s=store.size:desc"

# 分片分布
curl -X GET "localhost:9200/_cat/shards?v&s=store:desc"

# 节点信息
curl -X GET "localhost:9200/_cat/nodes?v&h=name,ip,heap.percent,ram.percent,cpu,load_1m,node.role"

# 未分配分片及原因
curl -X GET "localhost:9200/_cat/shards?v&h=index,shard,prirep,state,unassigned.reason&s=state"

# 磁盘使用
curl -X GET "localhost:9200/_cat/allocation?v"

# 线程池状态（排查队列积压）
curl -X GET "localhost:9200/_cat/thread_pool?v&h=node_name,name,active,queue,rejected"

# 待执行任务
curl -X GET "localhost:9200/_cat/pending_tasks?v"
```

```python
# Python 中 _cat API 返回文本格式，也可使用对应的 JSON API
nodes = es.nodes.info()
stats = es.nodes.stats()

# 或使用 cat API
print(es.cat.indices(v=True, s="store.size:desc"))
print(es.cat.nodes(v=True, h="name,ip,heap.percent,cpu"))
```

### 诊断未分配分片

```bash
# 查看未分配原因
curl -X GET "localhost:9200/_cluster/allocation/explain?pretty" -H 'Content-Type: application/json' -d'
{
  "index": "my-index",
  "shard": 0,
  "primary": true
}'
```

常见未分配原因：
- `INDEX_CREATED`：新创建索引的分片尚未分配
- `CLUSTER_RECOVERED`：集群恢复过程中
- `NODE_LEFT`：节点离开集群
- `ALLOCATION_FAILED`：分配失败（磁盘空间不足等）
- `REROUTE_CANCELLED`：手动取消的重分配

## 分片策略

### 分片规划原则

| 指标 | 推荐值 |
|------|--------|
| 单分片大小 | 10-50 GB |
| 每节点分片数 | 不超过每 GB 堆内存 20 个分片 |
| 单节点建议上限 | ~600 个分片 |
| 副本数 | 生产环境至少 1 |

### 动态调整副本数

```bash
# 增加副本数
curl -X PUT "localhost:9200/my-index/_settings" -H 'Content-Type: application/json' -d'
{
  "index": {
    "number_of_replicas": 2
  }
}'
```

```python
es.indices.put_settings(index="my-index", settings={
    "index.number_of_replicas": 2,
})
```

### Reindex（重建索引）

当需要修改分片数或字段类型时，必须通过 reindex 迁移数据。

```bash
curl -X POST "localhost:9200/_reindex" -H 'Content-Type: application/json' -d'
{
  "source": {
    "index": "old-index",
    "size": 5000
  },
  "dest": {
    "index": "new-index"
  }
}'
```

```python
es.reindex(
    source={"index": "old-index", "size": 5000},
    dest={"index": "new-index"},
    wait_for_completion=False,  # 异步执行，返回 task_id
)
```

### Shrink（缩减分片数）

```bash
# 1. 将所有分片迁移到同一节点并设为只读
curl -X PUT "localhost:9200/my-index/_settings" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "index.routing.allocation.require._name": "node-1",
    "index.blocks.write": true
  }
}'

# 2. 缩减分片数（目标分片数必须是原分片数的因子）
curl -X POST "localhost:9200/my-index/_shrink/my-index-shrunk" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "index.number_of_shards": 1,
    "index.number_of_replicas": 1,
    "index.routing.allocation.require._name": null,
    "index.blocks.write": null
  }
}'
```

## 索引生命周期管理（ILM）

ILM 自动管理索引在不同阶段（hot -> warm -> cold -> frozen -> delete）的转换。

### 创建 ILM 策略

```bash
curl -X PUT "localhost:9200/_ilm/policy/logs_policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "1d"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 },
          "allocate": {
            "require": { "data": "warm" }
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "set_priority": { "priority": 0 },
          "allocate": {
            "require": { "data": "cold" }
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}'
```

```python
es.ilm.put_lifecycle(name="logs_policy", policy={
    "phases": {
        "hot": {
            "min_age": "0ms",
            "actions": {
                "rollover": {
                    "max_primary_shard_size": "50gb",
                    "max_age": "1d",
                },
                "set_priority": {"priority": 100},
            },
        },
        "warm": {
            "min_age": "7d",
            "actions": {
                "shrink": {"number_of_shards": 1},
                "forcemerge": {"max_num_segments": 1},
            },
        },
        "delete": {
            "min_age": "90d",
            "actions": {"delete": {}},
        },
    }
})
```

### ILM 各阶段可用操作

| 阶段 | 可用操作 |
|------|---------|
| **hot** | `rollover`, `set_priority`, `unfollow`, `readonly` |
| **warm** | `allocate`, `shrink`, `forcemerge`, `set_priority`, `migrate`, `readonly`, `unfollow` |
| **cold** | `allocate`, `set_priority`, `migrate`, `freeze`, `searchable_snapshot`, `unfollow`, `readonly` |
| **frozen** | `searchable_snapshot` |
| **delete** | `delete`, `wait_for_snapshot` |

### 查看 ILM 状态

```bash
# 查看索引的 ILM 状态
curl -X GET "localhost:9200/my-index/_ilm/explain?pretty"

# 查看所有策略
curl -X GET "localhost:9200/_ilm/policy?pretty"

# ILM 全局状态
curl -X GET "localhost:9200/_ilm/status"
```

## 索引模板（Index Templates）

### Component Template（可复用的组件模板）

```bash
# 创建 mappings 组件
curl -X PUT "localhost:9200/_component_template/logs_mappings" -H 'Content-Type: application/json' -d'
{
  "template": {
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "message": { "type": "text" },
        "level": { "type": "keyword" },
        "service": { "type": "keyword" },
        "trace_id": { "type": "keyword" }
      }
    }
  }
}'

# 创建 settings 组件
curl -X PUT "localhost:9200/_component_template/logs_settings" -H 'Content-Type: application/json' -d'
{
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "refresh_interval": "5s",
      "index.lifecycle.name": "logs_policy",
      "index.lifecycle.rollover_alias": "logs"
    }
  }
}'
```

### Composable Index Template（组合索引模板）

```bash
curl -X PUT "localhost:9200/_index_template/logs_template" -H 'Content-Type: application/json' -d'
{
  "index_patterns": ["logs-*"],
  "composed_of": ["logs_mappings", "logs_settings"],
  "priority": 200,
  "template": {
    "settings": {
      "index.codec": "best_compression"
    },
    "mappings": {
      "properties": {
        "host": { "type": "keyword" }
      }
    }
  },
  "_meta": {
    "description": "日志索引模板",
    "version": 1
  }
}'
```

```python
# 创建组件模板
es.cluster.put_component_template(name="logs_mappings", template={
    "mappings": {
        "properties": {
            "@timestamp": {"type": "date"},
            "message": {"type": "text"},
            "level": {"type": "keyword"},
        }
    }
})

# 创建索引模板
es.indices.put_index_template(name="logs_template",
    index_patterns=["logs-*"],
    composed_of=["logs_mappings", "logs_settings"],
    priority=200,
    template={
        "settings": {"index.codec": "best_compression"},
    },
)
```

模板优先级规则：
1. 组件模板按 `composed_of` 数组顺序合并（后面的覆盖前面的）
2. 索引模板自身的 settings/mappings 覆盖组件模板
3. 多个匹配的索引模板中，`priority` 值最大的生效

### Data Streams（时序数据推荐）

```bash
# 创建数据流模板
curl -X PUT "localhost:9200/_index_template/logs_ds_template" -H 'Content-Type: application/json' -d'
{
  "index_patterns": ["logs-*"],
  "data_stream": {},
  "composed_of": ["logs_mappings", "logs_settings"],
  "priority": 200
}'

# 写入数据（自动创建 data stream）
curl -X POST "localhost:9200/logs-app/_doc" -H 'Content-Type: application/json' -d'
{
  "@timestamp": "2024-06-01T12:00:00Z",
  "message": "User login successful",
  "level": "info",
  "service": "auth"
}'

# 查看 data stream 信息
curl -X GET "localhost:9200/_data_stream/logs-app"
```

## 性能调优

### 写入优化

```bash
# 批量写入前的临时设置
curl -X PUT "localhost:9200/my-index/_settings" -H 'Content-Type: application/json' -d'
{
  "index": {
    "refresh_interval": "-1",
    "number_of_replicas": 0,
    "translog.durability": "async",
    "translog.flush_threshold_size": "1gb"
  }
}'

# 写入完成后恢复
curl -X PUT "localhost:9200/my-index/_settings" -H 'Content-Type: application/json' -d'
{
  "index": {
    "refresh_interval": "1s",
    "number_of_replicas": 1,
    "translog.durability": "request"
  }
}'

# 强制刷新
curl -X POST "localhost:9200/my-index/_refresh"

# 强制合并段（只对不再写入的索引）
curl -X POST "localhost:9200/my-index/_forcemerge?max_num_segments=1"
```

### 写入优化检查清单

| 优化项 | 说明 |
|--------|------|
| `refresh_interval: -1` | 批量写入时禁用自动刷新 |
| `number_of_replicas: 0` | 批量写入时临时关闭副本 |
| Bulk API chunk_size | 建议 5-15 MB 每批或 1000-5000 条 |
| `translog.durability: async` | 异步 translog 刷盘（有极小数据丢失风险） |
| 合理分片数 | 避免过多小分片（oversharding） |
| `_source` 按需禁用 | 不需要获取原文时可禁用以节省存储 |

### 搜索优化

```bash
# 路由（将相关文档集中在同一分片，减少跨分片查询）
curl -X PUT "localhost:9200/my-index/_doc/1?routing=user_123" -H 'Content-Type: application/json' -d'
{
  "user_id": "user_123",
  "content": "..."
}'

curl -X GET "localhost:9200/my-index/_search?routing=user_123" -H 'Content-Type: application/json' -d'
{
  "query": { "term": { "user_id": "user_123" } }
}'
```

### 搜索优化检查清单

| 优化项 | 说明 |
|--------|------|
| `filter` 替代 `must` | 不需要评分的条件放 filter（可缓存） |
| `size: 0` | 仅需聚合时不返回文档 |
| `_source` 过滤 | 只返回需要的字段 |
| `routing` | 按用户/租户路由减少分片扫描 |
| `preference` | 设置 `_local` 优先本地分片 |
| 避免深度分页 | `from + size > 10000` 时改用 `search_after` |
| `index.sort` | 预排序索引加速排序查询 |

### JVM 堆内存配置

```bash
# elasticsearch.yml 或 jvm.options
# 堆内存不超过物理内存的 50%，且不超过 ~30 GB（CompressedOops 阈值）
-Xms16g
-Xmx16g
```

规则：
- 堆内存 = 物理内存的 50%（另一半留给文件系统缓存）
- 不要超过 ~30.5 GB（超过后 JVM 禁用 CompressedOops，实际可用内存反而减少）
- Xms = Xmx（避免堆内存动态调整开销）

## 快照与恢复

### 注册快照仓库

```bash
# 文件系统仓库（需所有节点可访问同一路径）
curl -X PUT "localhost:9200/_snapshot/my_backup" -H 'Content-Type: application/json' -d'
{
  "type": "fs",
  "settings": {
    "location": "/mount/backups/es_snapshots",
    "compress": true
  }
}'

# S3 仓库
curl -X PUT "localhost:9200/_snapshot/s3_backup" -H 'Content-Type: application/json' -d'
{
  "type": "s3",
  "settings": {
    "bucket": "my-es-backups",
    "region": "us-east-1",
    "base_path": "snapshots"
  }
}'
```

### 创建和恢复快照

```bash
# 创建快照（指定索引）
curl -X PUT "localhost:9200/_snapshot/my_backup/snapshot_2024_06?wait_for_completion=true" -H 'Content-Type: application/json' -d'
{
  "indices": "logs-*,orders-*",
  "ignore_unavailable": true,
  "include_global_state": false
}'

# 查看快照列表
curl -X GET "localhost:9200/_snapshot/my_backup/_all?pretty"

# 查看快照状态
curl -X GET "localhost:9200/_snapshot/my_backup/snapshot_2024_06/_status"

# 恢复快照
curl -X POST "localhost:9200/_snapshot/my_backup/snapshot_2024_06/_restore" -H 'Content-Type: application/json' -d'
{
  "indices": "orders-*",
  "ignore_unavailable": true,
  "rename_pattern": "(.+)",
  "rename_replacement": "restored_$1",
  "include_global_state": false
}'

# 删除快照
curl -X DELETE "localhost:9200/_snapshot/my_backup/snapshot_2024_06"
```

```python
# 创建快照
es.snapshot.create(
    repository="my_backup",
    snapshot="snapshot_2024_06",
    indices="logs-*,orders-*",
    ignore_unavailable=True,
    include_global_state=False,
    wait_for_completion=True,
)

# 恢复快照
es.snapshot.restore(
    repository="my_backup",
    snapshot="snapshot_2024_06",
    indices="orders-*",
    rename_pattern="(.+)",
    rename_replacement="restored_$1",
)
```

### SLM（快照生命周期管理）

```bash
curl -X PUT "localhost:9200/_slm/policy/nightly_backup" -H 'Content-Type: application/json' -d'
{
  "schedule": "0 0 1 * * ?",
  "name": "<nightly-{now/d}>",
  "repository": "my_backup",
  "config": {
    "indices": ["*"],
    "ignore_unavailable": true,
    "include_global_state": false
  },
  "retention": {
    "expire_after": "30d",
    "min_count": 7,
    "max_count": 30
  }
}'
```

## 常用运维命令速查

```bash
# 集群级别
curl "localhost:9200/_cluster/health?pretty"                    # 健康状态
curl "localhost:9200/_cluster/stats?pretty"                     # 集群统计
curl "localhost:9200/_cluster/settings?pretty"                  # 集群设置
curl "localhost:9200/_cluster/allocation/explain?pretty"        # 分片分配解释

# 索引级别
curl "localhost:9200/_cat/indices?v&s=store.size:desc"         # 索引列表
curl "localhost:9200/my-index/_stats?pretty"                    # 索引统计
curl "localhost:9200/my-index/_segments?pretty"                 # 段信息
curl "localhost:9200/my-index/_recovery?pretty"                 # 恢复进度

# 节点级别
curl "localhost:9200/_cat/nodes?v&h=name,ip,heap.percent,cpu"  # 节点状态
curl "localhost:9200/_nodes/stats?pretty"                       # 节点详细统计
curl "localhost:9200/_nodes/hot_threads"                        # 热点线程

# 任务管理
curl "localhost:9200/_tasks?actions=*reindex&detailed"          # 查看 reindex 任务
curl -X POST "localhost:9200/_tasks/task_id/_cancel"            # 取消任务
```

## 常见陷阱

- **分片过多（Oversharding）**：每个分片消耗内存和文件描述符。100 个 1MB 的分片远不如 1 个 100MB 的分片高效。时序数据用 ILM + rollover 自动管理
- **堆内存超过 30.5 GB**：超过 CompressedOops 阈值后，JVM 对象指针从 4 字节变为 8 字节，实际可用内存可能反而减少
- **forcemerge 正在写入的索引**：`_forcemerge` 非常消耗 I/O，只应对不再写入的索引执行。对活跃索引 forcemerge 会导致性能严重下降
- **ILM rollover 需要写入别名**：ILM 的 rollover action 要求索引使用写入别名（write alias），或使用 data streams。直接对普通索引配置 rollover 不会生效
- **模板优先级冲突**：多个索引模板匹配同一索引模式时，只有 `priority` 最高的生效（不是合并）。确保模板 priority 设置正确
- **快照恢复到同名索引**：恢复快照时如果目标索引已存在且处于 open 状态，恢复会失败。需要先关闭或删除目标索引，或使用 `rename_pattern` / `rename_replacement`
- **_cat API 不适合程序调用**：_cat API 返回文本格式，适合人工查看。程序应使用对应的 JSON API（如 `_cluster/health` 而非 `_cat/health`）
- **磁盘水位线**：当磁盘使用率超过 85%（低水位线）时 ES 停止向该节点分配分片，超过 90%（高水位线）时主动迁移分片，超过 95%（洪水水位线）时所有索引变为只读

## 组合提示

- 配合 **elasticsearch-core** 理解分片/副本/映射的基础概念
- 配合 **elasticsearch-aggregations** 构建监控仪表盘的聚合查询
- 配合 **elasticsearch-python** 用 Python 脚本自动化运维操作
- 配合 **elasticsearch-queries** 使用 `_delete_by_query` 和 `_update_by_query` 批量维护数据
