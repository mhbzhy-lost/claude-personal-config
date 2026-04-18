---
name: elasticsearch-queries
description: "Elasticsearch Query DSL 完整指南：全文搜索、精确查询、布尔组合、高亮、排序与分页"
tech_stack: [elasticsearch, backend]
capability: [search-engine]
---

# Elasticsearch Query DSL

> 来源：https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html
> 版本基准：Elasticsearch 8.x

## 用途

使用 Elasticsearch Query DSL 构建各类搜索查询：全文匹配、精确过滤、布尔组合、模糊搜索、短语匹配、高亮显示、排序与深度分页。

## 何时使用

- 实现搜索功能（全文搜索、关键词过滤、范围筛选）
- 构建复杂查询条件（多条件组合、嵌套查询）
- 实现搜索结果高亮、排序、分页
- 优化搜索相关性和性能

## 查询 vs 过滤上下文

- **查询上下文（Query context）**：计算相关性评分（_score），用于 "文档与查询的匹配程度"
- **过滤上下文（Filter context）**：仅判断是否匹配（yes/no），不计算评分，可被缓存，性能更优

经验法则：需要影响评分的条件放 `must` / `should`，仅过滤的条件放 `filter` / `must_not`。

## Bool 查询（核心）

Bool 查询是最常用的复合查询，通过组合子句构建复杂条件。

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "elasticsearch 入门" } }
      ],
      "filter": [
        { "term": { "status": "published" } },
        { "range": { "price": { "gte": 10, "lte": 100 } } }
      ],
      "should": [
        { "term": { "tags": "hot" } },
        { "term": { "tags": "recommended" } }
      ],
      "must_not": [
        { "term": { "status": "deleted" } }
      ],
      "minimum_should_match": 1
    }
  }
}'
```

```python
from elasticsearch import Elasticsearch

es = Elasticsearch("http://localhost:9200")

resp = es.search(index="products", query={
    "bool": {
        "must": [
            {"match": {"title": "elasticsearch 入门"}}
        ],
        "filter": [
            {"term": {"status": "published"}},
            {"range": {"price": {"gte": 10, "lte": 100}}}
        ],
        "should": [
            {"term": {"tags": "hot"}},
            {"term": {"tags": "recommended"}}
        ],
        "must_not": [
            {"term": {"status": "deleted"}}
        ],
        "minimum_should_match": 1,
    }
})
```

### Bool 子句行为

| 子句 | 影响评分 | 语义 | 缓存 |
|------|---------|------|------|
| `must` | 是 | AND，文档必须匹配 | 否 |
| `filter` | 否 | AND，文档必须匹配，不计分 | 是 |
| `should` | 是 | OR，匹配可加分 | 否 |
| `must_not` | 否 | NOT，排除匹配的文档 | 是 |

`minimum_should_match`：当 bool 查询中没有 `must`/`filter` 时，`should` 至少需匹配一条；有 `must`/`filter` 时默认为 0。

## 全文搜索查询

### match（最常用）

对输入文本分词后搜索，适合全文检索。

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match": {
      "content": {
        "query": "elasticsearch 分布式搜索",
        "operator": "and",
        "minimum_should_match": "75%"
      }
    }
  }
}'
```

- `operator`：`or`（默认，任意词匹配）/ `and`（所有词都必须匹配）
- `minimum_should_match`：至少匹配的词条比例或数量

### multi_match（多字段搜索）

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "multi_match": {
      "query": "elasticsearch 教程",
      "fields": ["title^3", "content", "tags^2"],
      "type": "best_fields",
      "tie_breaker": 0.3
    }
  }
}'
```

常用 type：
- `best_fields`（默认）：取最高分字段的得分
- `most_fields`：各字段分数相加（适合同一内容不同分析方式）
- `cross_fields`：跨字段组合（适合名+姓这类分散在多字段的内容）
- `phrase`：等同于对每个字段执行 `match_phrase`
- `phrase_prefix`：等同于对每个字段执行 `match_phrase_prefix`

### match_phrase（短语匹配）

要求所有词条按顺序出现，且位置连续（可通过 `slop` 放宽间距）。

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match_phrase": {
      "content": {
        "query": "distributed search engine",
        "slop": 2
      }
    }
  }
}'
```

### match_phrase_prefix（前缀短语匹配）

最后一个词作为前缀匹配，适合搜索建议/自动补全。

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match_phrase_prefix": {
      "title": {
        "query": "elast",
        "max_expansions": 50
      }
    }
  }
}'
```

注意：`match_phrase_prefix` 不支持 `fuzziness` 参数。

## 精确查询（Term-level）

这类查询不对输入分词，用于 keyword / numeric / date / boolean 字段。

### term / terms

```bash
# 单值精确匹配
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "term": { "status": { "value": "published" } }
  }
}'

# 多值匹配（OR 语义）
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "terms": { "tags": ["elasticsearch", "search", "database"] }
  }
}'
```

### range（范围查询）

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "range": {
      "created_at": {
        "gte": "2024-01-01",
        "lt": "2024-07-01",
        "format": "yyyy-MM-dd"
      }
    }
  }
}'
```

参数：`gt`（大于）、`gte`（大于等于）、`lt`（小于）、`lte`（小于等于）。

### exists（字段存在性）

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "exists": { "field": "description" }
  }
}'
```

### wildcard / prefix / regexp

```bash
# 通配符查询（避免前导通配符 *abc，性能很差）
{ "query": { "wildcard": { "name": { "value": "elast*" } } } }

# 前缀查询
{ "query": { "prefix": { "name": { "value": "elast" } } } }
```

## 模糊搜索（Fuzziness）

基于编辑距离（Levenshtein distance）容忍拼写错误。

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match": {
      "title": {
        "query": "elastisearch",
        "fuzziness": "AUTO",
        "prefix_length": 2,
        "max_expansions": 50
      }
    }
  }
}'
```

`fuzziness` 取值：
- `AUTO`（推荐）：根据词长自动决定（0-2字符=0，3-5字符=1，>5字符=2）
- `0` / `1` / `2`：固定编辑距离

`prefix_length`：前 N 个字符必须精确匹配（提升性能，推荐 2-3）。

## Nested 查询

查询 `nested` 类型字段时必须使用 nested 查询。

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "nested": {
      "path": "comments",
      "query": {
        "bool": {
          "must": [
            { "match": { "comments.author": "Alice" } },
            { "range": { "comments.date": { "gte": "2024-01-01" } } }
          ]
        }
      },
      "inner_hits": {
        "size": 3,
        "highlight": {
          "fields": { "comments.text": {} }
        }
      }
    }
  }
}'
```

`inner_hits`：返回匹配的具体 nested 对象，用于展示哪些子文档命中了查询。

## 高亮（Highlight）

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match": { "content": "elasticsearch 分布式" }
  },
  "highlight": {
    "pre_tags": ["<em>"],
    "post_tags": ["</em>"],
    "fields": {
      "content": {
        "fragment_size": 150,
        "number_of_fragments": 3
      },
      "title": {}
    }
  }
}'
```

```python
resp = es.search(
    index="articles",
    query={"match": {"content": "elasticsearch 分布式"}},
    highlight={
        "pre_tags": ["<em>"],
        "post_tags": ["</em>"],
        "fields": {
            "content": {"fragment_size": 150, "number_of_fragments": 3},
            "title": {},
        },
    },
)
for hit in resp["hits"]["hits"]:
    print(hit.get("highlight", {}))
```

高亮器类型：`unified`（默认，推荐）、`plain`、`fvh`（需 `term_vector: with_positions_offsets`）。

## _source 过滤

```bash
# 指定返回字段
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "query": { "match_all": {} },
  "_source": ["title", "created_at", "status"],
  "size": 10
}'

# 包含/排除模式
{
  "_source": {
    "includes": ["title", "meta.*"],
    "excludes": ["content"]
  }
}

# 完全禁用 _source
{ "_source": false }
```

## 排序（Sort）

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": { "match": { "title": "elasticsearch" } },
  "sort": [
    { "created_at": { "order": "desc" } },
    { "price": { "order": "asc", "missing": "_last" } },
    "_score"
  ]
}'
```

注意：`text` 字段不能直接排序，需使用其 `keyword` 子字段（如 `title.raw`）或启用 `fielddata`（不推荐，消耗大量内存）。

## 分页

### from + size（浅分页）

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "query": { "match_all": {} },
  "from": 0,
  "size": 20,
  "sort": [{ "created_at": "desc" }]
}'
```

限制：`from + size` 不能超过 `index.max_result_window`（默认 10000）。

### search_after + PIT（深度分页，推荐）

```bash
# 1. 打开 Point in Time
curl -X POST "localhost:9200/products/_open_point_in_time?keep_alive=5m"
# 返回 {"id": "pit_id_here"}

# 2. 首次查询
curl -X GET "localhost:9200/_search" -H 'Content-Type: application/json' -d'
{
  "size": 20,
  "query": { "match_all": {} },
  "pit": { "id": "pit_id_here", "keep_alive": "5m" },
  "sort": [
    { "created_at": "desc" },
    { "_shard_doc": "asc" }
  ]
}'

# 3. 后续分页：使用上一页最后一条的 sort 值
curl -X GET "localhost:9200/_search" -H 'Content-Type: application/json' -d'
{
  "size": 20,
  "query": { "match_all": {} },
  "pit": { "id": "pit_id_here", "keep_alive": "5m" },
  "search_after": ["2024-01-15T10:30:00.000Z", 12345],
  "sort": [
    { "created_at": "desc" },
    { "_shard_doc": "asc" }
  ]
}'

# 4. 用完后关闭 PIT
curl -X DELETE "localhost:9200/_pit" -H 'Content-Type: application/json' -d'
{ "id": "pit_id_here" }'
```

```python
# Python search_after 分页
pit = es.open_point_in_time(index="products", keep_alive="5m")
pit_id = pit["id"]

search_after = None
while True:
    body = {
        "size": 100,
        "query": {"match_all": {}},
        "pit": {"id": pit_id, "keep_alive": "5m"},
        "sort": [{"created_at": "desc"}, {"_shard_doc": "asc"}],
    }
    if search_after:
        body["search_after"] = search_after

    resp = es.search(**body)
    hits = resp["hits"]["hits"]
    if not hits:
        break

    for hit in hits:
        process(hit["_source"])

    search_after = hits[-1]["sort"]

es.close_point_in_time(id=pit_id)
```

## 实用查询模式

### 搜索框标准查询模板

```json
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "用户输入的搜索词",
            "fields": ["title^3", "content", "tags^2"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        }
      ],
      "filter": [
        { "term": { "status": "published" } },
        { "range": { "created_at": { "gte": "now-30d" } } }
      ]
    }
  },
  "highlight": {
    "fields": { "title": {}, "content": { "fragment_size": 200 } }
  },
  "sort": ["_score", { "created_at": "desc" }],
  "_source": ["title", "summary", "created_at", "author"],
  "from": 0,
  "size": 20
}
```

## 常见陷阱

- **term 查询用在 text 字段上**：text 字段经过分词，`term: "Elasticsearch"` 不会匹配已被小写化的 token `elasticsearch`。精确匹配必须用 keyword 字段
- **from + size 超过 10000**：默认 `max_result_window` 为 10000，深度分页必须用 `search_after` + PIT
- **should 子句被忽略**：当 bool 查询中存在 `must` 或 `filter` 时，`should` 默认 `minimum_should_match: 0`，即 should 子句不强制匹配，只影响评分
- **match_phrase 性能**：短语查询比普通 match 更消耗资源，尤其是在大文本字段上。`slop` 值越大性能越差
- **wildcard 前导通配符**：`*abc` 这类前导通配符查询需要扫描所有 term，性能极差，应避免使用
- **高亮要求 _source 可用**：如果禁用了 `_source`，unified 高亮器无法工作
- **fuzziness 不适用于 CJK**：模糊搜索基于编辑距离，对中日韩单字符 token 效果差，中文场景优先用 synonym filter 或 pinyin analyzer

## 组合提示

- 配合 **elasticsearch-core** 理解 mapping 和字段类型对查询行为的影响
- 配合 **elasticsearch-aggregations** 在搜索结果上添加聚合（faceted search）
- 配合 **elasticsearch-python** 使用 elasticsearch-dsl-py 构建类型安全的查询
