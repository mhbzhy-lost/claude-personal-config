---
name: elasticsearch-core
description: "Elasticsearch 核心概念：集群架构、索引管理、文档 CRUD、映射定义、字段类型与分析器"
tech_stack: [elasticsearch, backend]
---

# Elasticsearch 核心概念

> 来源：https://www.elastic.co/guide/en/elasticsearch/reference/current/
> 版本基准：Elasticsearch 8.x

## 用途

掌握 Elasticsearch 的基础架构概念和核心操作：集群拓扑、索引生命周期、文档增删改查、映射与字段类型定义、文本分析器配置。这是使用 Elasticsearch 的前置知识。

## 何时使用

- 初始化 Elasticsearch 集群或理解现有集群架构
- 创建索引并定义 mapping
- 对文档执行 CRUD 操作
- 选择合适的字段类型（text vs keyword 等）
- 配置自定义分析器处理中文/多语言文本

## 架构核心概念

### 集群（Cluster）

一组协同工作的节点（Node），共享同一个 `cluster.name`。集群状态：
- **green**：所有主分片和副本分片均已分配
- **yellow**：所有主分片已分配，部分副本未分配
- **red**：部分主分片未分配，存在数据丢失风险

### 节点角色（Node Roles）

| 角色 | 配置 | 职责 |
|------|------|------|
| master | `node.roles: [master]` | 管理集群状态、索引创建/删除 |
| data | `node.roles: [data]` | 存储数据、执行搜索和聚合 |
| data_hot / data_warm / data_cold | 对应角色 | 分层存储（热/温/冷） |
| ingest | `node.roles: [ingest]` | 文档预处理管道 |
| coordinating | `node.roles: []` | 请求路由、结果聚合 |

### 分片与副本（Shards & Replicas）

- **主分片（Primary Shard）**：索引创建后数量不可变（除非 reindex），决定数据分布
- **副本分片（Replica Shard）**：主分片的拷贝，提供高可用和读取吞吐
- 推荐单分片大小：10-50 GB
- 每个节点分片数上限：建议不超过每 GB 堆内存 20 个分片

## 索引管理

### 创建索引

```bash
# REST API
curl -X PUT "localhost:9200/my-index" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "1s"
  },
  "mappings": {
    "properties": {
      "title": { "type": "text", "analyzer": "standard" },
      "status": { "type": "keyword" },
      "created_at": { "type": "date" },
      "price": { "type": "float" },
      "tags": { "type": "keyword" },
      "content": {
        "type": "text",
        "fields": {
          "raw": { "type": "keyword" }
        }
      }
    }
  }
}'
```

```python
# Python 客户端
from elasticsearch import Elasticsearch

es = Elasticsearch("http://localhost:9200")

es.indices.create(
    index="my-index",
    settings={
        "number_of_shards": 3,
        "number_of_replicas": 1,
    },
    mappings={
        "properties": {
            "title": {"type": "text", "analyzer": "standard"},
            "status": {"type": "keyword"},
            "created_at": {"type": "date"},
            "price": {"type": "float"},
            "tags": {"type": "keyword"},
        }
    },
)
```

### 索引操作

```bash
# 查看索引信息
curl -X GET "localhost:9200/my-index"

# 关闭索引（停止读写，可修改设置）
curl -X POST "localhost:9200/my-index/_close"

# 打开索引
curl -X POST "localhost:9200/my-index/_open"

# 删除索引
curl -X DELETE "localhost:9200/my-index"

# 查看索引列表
curl -X GET "localhost:9200/_cat/indices?v"
```

## 文档 CRUD

### 创建/索引文档

```bash
# 指定 ID
curl -X PUT "localhost:9200/my-index/_doc/1" -H 'Content-Type: application/json' -d'
{
  "title": "Elasticsearch 入门",
  "status": "published",
  "created_at": "2024-01-15",
  "price": 29.99
}'

# 自动生成 ID
curl -X POST "localhost:9200/my-index/_doc" -H 'Content-Type: application/json' -d'
{
  "title": "第二篇文章",
  "status": "draft"
}'
```

```python
# 指定 ID
es.index(index="my-index", id="1", document={
    "title": "Elasticsearch 入门",
    "status": "published",
    "created_at": "2024-01-15",
    "price": 29.99,
})

# 自动生成 ID
es.index(index="my-index", document={
    "title": "第二篇文章",
    "status": "draft",
})
```

### 读取文档

```bash
curl -X GET "localhost:9200/my-index/_doc/1"

# 仅获取 _source
curl -X GET "localhost:9200/my-index/_source/1"

# 检查文档是否存在
curl -I "localhost:9200/my-index/_doc/1"
```

```python
doc = es.get(index="my-index", id="1")
print(doc["_source"])

exists = es.exists(index="my-index", id="1")
```

### 更新文档

```bash
# 部分更新
curl -X POST "localhost:9200/my-index/_update/1" -H 'Content-Type: application/json' -d'
{
  "doc": {
    "status": "archived",
    "price": 19.99
  }
}'

# 脚本更新
curl -X POST "localhost:9200/my-index/_update/1" -H 'Content-Type: application/json' -d'
{
  "script": {
    "source": "ctx._source.price *= params.discount",
    "params": { "discount": 0.8 }
  }
}'
```

```python
es.update(index="my-index", id="1", doc={
    "status": "archived",
    "price": 19.99,
})
```

### 删除文档

```bash
curl -X DELETE "localhost:9200/my-index/_doc/1"

# 按查询删除
curl -X POST "localhost:9200/my-index/_delete_by_query" -H 'Content-Type: application/json' -d'
{
  "query": { "term": { "status": "draft" } }
}'
```

```python
es.delete(index="my-index", id="1")

es.delete_by_query(index="my-index", query={
    "term": {"status": "draft"}
})
```

### 批量操作（Bulk API）

```bash
curl -X POST "localhost:9200/_bulk" -H 'Content-Type: application/x-ndjson' -d'
{"index": {"_index": "my-index", "_id": "1"}}
{"title": "文章一", "status": "published"}
{"index": {"_index": "my-index", "_id": "2"}}
{"title": "文章二", "status": "draft"}
{"delete": {"_index": "my-index", "_id": "3"}}
{"update": {"_index": "my-index", "_id": "1"}}
{"doc": {"status": "archived"}}
'
```

```python
from elasticsearch.helpers import bulk

actions = [
    {"_index": "my-index", "_id": "1", "_source": {"title": "文章一", "status": "published"}},
    {"_index": "my-index", "_id": "2", "_source": {"title": "文章二", "status": "draft"}},
]
success, errors = bulk(es, actions)
```

## 映射（Mapping）

### 字段类型速查

| 类型 | 用途 | 是否可搜索 | 是否分词 |
|------|------|-----------|---------|
| `text` | 全文搜索（文章内容、标题） | 是 | 是 |
| `keyword` | 精确匹配（状态、标签、ID） | 是 | 否 |
| `integer` / `long` | 整数 | 是 | 否 |
| `float` / `double` | 浮点数 | 是 | 否 |
| `boolean` | 布尔值 | 是 | 否 |
| `date` | 日期时间 | 是 | 否 |
| `object` | JSON 对象（扁平化存储） | 是 | 否 |
| `nested` | JSON 对象数组（独立文档存储） | 需 nested query | 否 |
| `geo_point` | 经纬度坐标 | 是 | 否 |
| `ip` | IPv4/IPv6 地址 | 是 | 否 |

### Multi-fields（多字段映射）

同一字段以不同方式索引，常见于同时需要全文搜索和精确匹配的场景：

```json
{
  "properties": {
    "city": {
      "type": "text",
      "fields": {
        "raw": { "type": "keyword" },
        "autocomplete": {
          "type": "text",
          "analyzer": "autocomplete_analyzer"
        }
      }
    }
  }
}
```

使用：`city` 用于全文搜索，`city.raw` 用于精确匹配和排序，`city.autocomplete` 用于自动补全。

### Dynamic Mapping（动态映射）

```json
{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "title": { "type": "text" },
      "metadata": {
        "type": "object",
        "dynamic": "true"
      }
    }
  }
}
```

`dynamic` 取值：
- `true`（默认）：自动检测并添加新字段
- `runtime`：新字段映射为 runtime fields（不索引，查询时从 _source 计算）
- `false`：忽略新字段（不索引，但保留在 _source 中）
- `strict`：遇到未知字段抛异常

### Nested vs Object

**Object**（默认）：内部字段被扁平化，数组中不同对象的字段值会交叉匹配。

**Nested**：每个数组元素作为独立隐藏文档索引，保持对象内字段关联性。

```json
{
  "mappings": {
    "properties": {
      "comments": {
        "type": "nested",
        "properties": {
          "author": { "type": "keyword" },
          "text": { "type": "text" }
        }
      }
    }
  }
}
```

## 分析器（Analyzer）

分析器由三部分组成：Character Filters -> Tokenizer -> Token Filters

### 内置分析器

| 分析器 | 说明 |
|--------|------|
| `standard` | 默认。Unicode 分词 + 小写转换 |
| `simple` | 非字母字符分割 + 小写 |
| `whitespace` | 空格分割，不转小写 |
| `keyword` | 不分词，整个输入作为一个 token |
| `pattern` | 正则表达式分割 |

### 自定义分析器

```bash
curl -X PUT "localhost:9200/my-index" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "analysis": {
      "char_filter": {
        "html_cleaner": {
          "type": "html_strip"
        }
      },
      "tokenizer": {
        "my_tokenizer": {
          "type": "pattern",
          "pattern": "[\\W_]+"
        }
      },
      "filter": {
        "my_stopwords": {
          "type": "stop",
          "stopwords": ["the", "a", "is"]
        }
      },
      "analyzer": {
        "my_custom_analyzer": {
          "type": "custom",
          "char_filter": ["html_cleaner"],
          "tokenizer": "my_tokenizer",
          "filter": ["lowercase", "my_stopwords"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "content": {
        "type": "text",
        "analyzer": "my_custom_analyzer"
      }
    }
  }
}'
```

### 测试分析器

```bash
# 测试内置分析器
curl -X POST "localhost:9200/_analyze" -H 'Content-Type: application/json' -d'
{
  "analyzer": "standard",
  "text": "Hello World! This is a test."
}'

# 测试索引上的自定义分析器
curl -X POST "localhost:9200/my-index/_analyze" -H 'Content-Type: application/json' -d'
{
  "analyzer": "my_custom_analyzer",
  "text": "<p>Hello World!</p>"
}'
```

## 常见陷阱

- **mapping 一旦创建不可修改字段类型**：只能新增字段，不能更改已有字段的类型。需要变更类型时必须创建新索引并 reindex
- **text vs keyword 混淆**：用于过滤/排序/聚合的字段必须用 `keyword`，`text` 字段会分词导致精确匹配失败
- **nested 字段的性能开销**：每个 nested 对象都是一个隐藏文档，大量 nested 对象会显著增加文档数量和内存消耗。默认上限 50 个 nested 对象/文档
- **dynamic mapping 生产环境风险**：`dynamic: true` 在生产环境可能导致 mapping 膨胀（字段数爆炸），建议设置为 `strict` 或 `false`
- **分片数不可变**：`number_of_shards` 在索引创建后无法修改，需提前规划。副本数（`number_of_replicas`）可动态调整
- **refresh_interval 影响写入可见性**：默认 1 秒刷新一次。批量写入时可临时设为 `-1`（禁用自动刷新）以提升性能，写入完成后恢复
- **Bulk API 必须用 NDJSON 格式**：每行一个 JSON 对象，行尾必须有换行符。使用 curl 时必须用 `--data-binary` 而非 `-d`

## 组合提示

- 配合 **elasticsearch-queries** 使用 mapping 定义的字段进行搜索
- 配合 **elasticsearch-aggregations** 对 keyword/numeric/date 字段做聚合分析
- 配合 **elasticsearch-operations** 管理索引模板和生命周期策略
- 配合 **elasticsearch-python** 用 Python 客户端执行所有操作
