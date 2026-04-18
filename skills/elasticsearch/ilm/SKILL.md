---
name: elasticsearch-ilm
description: 使用 Index Lifecycle Management 自动管理时序索引的 rollover、retention 与删除
tech_stack: [elasticsearch]
capability: [search-engine]
version: "elasticsearch unversioned"
collected_at: 2026-04-18
---

# Elasticsearch ILM（索引生命周期管理）

> 来源：https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management

## 用途
为 logs / metrics 等时序索引自动执行 rollover、归档迁移与到期删除，控制性能、可靠性与存储成本。

## 何时使用
- 按大小 / 文档数 / 时间自动切分新索引（rollover）
- 热温冷冻层迁移，降低旧数据存储成本
- 到期自动删除，强制执行数据保留策略
- 与 data stream 搭配管理 append-only 时序数据
- **不要**在 Elasticsearch Serverless 上使用 ILM——改用 data stream lifecycle

## 五个阶段
| 阶段 | 语义 | 典型动作 |
|------|------|----------|
| Hot | 活跃写入 / 查询 | rollover、set_priority、force_merge、shrink、downsample、searchable_snapshot |
| Warm | 偶尔更新、仍查询 | allocate、migrate、read-only、shrink、force_merge、downsample |
| Cold | 极少查询 | allocate、migrate、searchable_snapshot、read-only、downsample |
| Frozen | 归档态 | searchable_snapshot、unfollow |
| Delete | 删除 | wait_for_snapshot、delete |

## 基础用法

### 1. 创建策略：rollover 到 25GB，30 天后删除
```json
PUT _ilm/policy/my_policy
{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_primary_shard_size": "25GB" } } },
      "delete": { "min_age": "30d", "actions": { "delete": {} } }
    }
  }
}
```

### 2. 绑定到索引模板
```json
PUT _index_template/my_template
{
  "index_patterns": ["test-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "my_policy",
      "index.lifecycle.rollover_alias": "test-alias"
    }
  }
}
```
> `index.lifecycle.rollover_alias` 仅 rolling index 需要，data stream 不需要。

### 3.（仅 rolling index）创建初始索引 + write alias
```json
PUT test-000001
{ "aliases": { "test-alias": { "is_write_index": true } } }
```
初始索引名必须匹配模板 pattern 且以数字结尾。

## 关键行为

- **min_age 基准**：rollover 之后，下一阶段的 `min_age` 从 rollover 时间算起，而非创建时间
- **隐式 rollover 阈值**：任一分片文档数 ≥ 200,000,000 时自动触发 rollover（即便未达配置阈值）
- **策略缓存**：阶段定义缓存于索引 metadata；修改策略不会立即影响正在执行的阶段
- **多周期完成**：rollover / shrink 等动作可能跨多个 ILM 周期，断点续跑
- **yellow 集群可迁移**：有未分配分片时索引仍可过渡，但清理步骤可能失败

## 注意事项
- 集群节点版本必须一致，混合版本集群下 ILM 行为不保证
- Serverless 不支持 ILM，换用 data stream lifecycle
- 默认 Kibana hot 阶段阈值：30 天或 50GB primary shard size
- Hot 阶段的 rollover / shrink / force_merge 必须全部完成才能进入 warm

## 组合提示
- **Data streams** 是 ILM 的首选载体（write-once 时序数据）
- 搭配 **index templates** 才能让新生成的 backing index 自动继承策略
- 冷冻层配合 **searchable_snapshot** 降低存储成本
