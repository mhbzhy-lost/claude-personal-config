---
name: elasticsearch-aggregations
description: "Elasticsearch 聚合框架：桶聚合、指标聚合、管道聚合、复合聚合与嵌套组合"
tech_stack: [elasticsearch, backend]
---

# Elasticsearch 聚合框架

> 来源：https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations.html
> 版本基准：Elasticsearch 8.x

## 用途

使用 Elasticsearch 聚合框架对数据进行统计分析：分组计数、数值统计、时间序列分析、多维度交叉分析、分页遍历高基数聚合结果。

## 何时使用

- 实现 Faceted Search（分面搜索，如电商分类筛选计数）
- 构建数据仪表盘和统计报表
- 时间序列数据分析（日志、指标、交易）
- 高基数字段的分页聚合（如按用户 ID 聚合）
- 在聚合结果上做二次计算（管道聚合）

## 聚合基本结构

```json
{
  "query": { "...过滤文档范围..." },
  "size": 0,
  "aggs": {
    "聚合名称": {
      "聚合类型": { "...参数..." },
      "aggs": {
        "子聚合名称": { "..." }
      }
    }
  }
}
```

`size: 0` 表示不返回搜索命中文档，仅返回聚合结果（性能优化）。

## 桶聚合（Bucket Aggregations）

将文档分到不同的桶中，每个桶可包含子聚合。

### terms（按字段值分组）

```bash
curl -X GET "localhost:9200/orders/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "by_category": {
      "terms": {
        "field": "category",
        "size": 20,
        "order": { "_count": "desc" },
        "min_doc_count": 1
      }
    }
  }
}'
```

```python
from elasticsearch import Elasticsearch

es = Elasticsearch("http://localhost:9200")

resp = es.search(index="orders", size=0, aggs={
    "by_category": {
        "terms": {
            "field": "category",
            "size": 20,
            "order": {"_count": "desc"},
        }
    }
})

for bucket in resp["aggregations"]["by_category"]["buckets"]:
    print(f"{bucket['key']}: {bucket['doc_count']}")
```

重要参数：
- `size`：返回的桶数量（默认 10，非全部）
- `shard_size`：每个分片返回的桶数量（默认 `size * 1.5 + 10`），增大可提高精度
- `order`：排序方式，支持 `_count`、`_key`、或子聚合指标名
- `missing`：缺少该字段的文档归入的桶名

### date_histogram（时间直方图）

```bash
curl -X GET "localhost:9200/orders/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "sales_over_time": {
      "date_histogram": {
        "field": "order_date",
        "calendar_interval": "month",
        "format": "yyyy-MM",
        "min_doc_count": 0,
        "extended_bounds": {
          "min": "2024-01",
          "max": "2024-12"
        }
      },
      "aggs": {
        "total_revenue": { "sum": { "field": "amount" } },
        "avg_order": { "avg": { "field": "amount" } }
      }
    }
  }
}'
```

```python
resp = es.search(index="orders", size=0, aggs={
    "sales_over_time": {
        "date_histogram": {
            "field": "order_date",
            "calendar_interval": "month",
            "format": "yyyy-MM",
            "min_doc_count": 0,
            "extended_bounds": {"min": "2024-01", "max": "2024-12"},
        },
        "aggs": {
            "total_revenue": {"sum": {"field": "amount"}},
            "avg_order": {"avg": {"field": "amount"}},
        },
    }
})

for bucket in resp["aggregations"]["sales_over_time"]["buckets"]:
    print(f"{bucket['key_as_string']}: "
          f"count={bucket['doc_count']}, "
          f"revenue={bucket['total_revenue']['value']}, "
          f"avg={bucket['avg_order']['value']}")
```

时间间隔：
- `calendar_interval`：`minute` / `hour` / `day` / `week` / `month` / `quarter` / `year`
- `fixed_interval`：`30s` / `1m` / `1h` / `7d`（固定时长，不受日历影响）

### range（范围分组）

```bash
curl -X GET "localhost:9200/products/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "price_ranges": {
      "range": {
        "field": "price",
        "keyed": true,
        "ranges": [
          { "key": "cheap",    "to": 50 },
          { "key": "mid",      "from": 50, "to": 200 },
          { "key": "expensive","from": 200 }
        ]
      },
      "aggs": {
        "avg_rating": { "avg": { "field": "rating" } }
      }
    }
  }
}'
```

### histogram（数值直方图）

```json
{
  "aggs": {
    "price_distribution": {
      "histogram": {
        "field": "price",
        "interval": 50,
        "min_doc_count": 1
      }
    }
  }
}
```

### nested（嵌套聚合）

对 `nested` 类型字段做聚合，必须使用 nested 聚合包裹。

```bash
curl -X GET "localhost:9200/articles/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "comments_agg": {
      "nested": { "path": "comments" },
      "aggs": {
        "top_authors": {
          "terms": { "field": "comments.author", "size": 10 }
        },
        "avg_rating": {
          "avg": { "field": "comments.rating" }
        }
      }
    }
  }
}'
```

### filter / filters（过滤桶）

```json
{
  "aggs": {
    "recent_orders": {
      "filter": {
        "range": { "order_date": { "gte": "now-7d" } }
      },
      "aggs": {
        "avg_amount": { "avg": { "field": "amount" } }
      }
    },
    "status_breakdown": {
      "filters": {
        "filters": {
          "pending":   { "term": { "status": "pending" } },
          "completed": { "term": { "status": "completed" } },
          "cancelled": { "term": { "status": "cancelled" } }
        }
      }
    }
  }
}
```

## 指标聚合（Metric Aggregations）

### 常用指标

```bash
curl -X GET "localhost:9200/orders/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "total_revenue":   { "sum":   { "field": "amount" } },
    "avg_amount":      { "avg":   { "field": "amount" } },
    "min_amount":      { "min":   { "field": "amount" } },
    "max_amount":      { "max":   { "field": "amount" } },
    "order_count":     { "value_count": { "field": "amount" } },
    "unique_customers":{ "cardinality": { "field": "customer_id", "precision_threshold": 1000 } },
    "amount_stats":    { "stats": { "field": "amount" } },
    "amount_percentiles": {
      "percentiles": {
        "field": "amount",
        "percents": [50, 90, 95, 99]
      }
    }
  }
}'
```

```python
resp = es.search(index="orders", size=0, aggs={
    "total_revenue": {"sum": {"field": "amount"}},
    "unique_customers": {"cardinality": {"field": "customer_id", "precision_threshold": 1000}},
    "amount_percentiles": {"percentiles": {"field": "amount", "percents": [50, 90, 95, 99]}},
})

aggs = resp["aggregations"]
print(f"总收入: {aggs['total_revenue']['value']}")
print(f"独立客户: {aggs['unique_customers']['value']}")
print(f"P99 金额: {aggs['amount_percentiles']['values']['99.0']}")
```

### 指标聚合速查

| 聚合 | 说明 | 返回值 |
|------|------|--------|
| `sum` | 求和 | `value` |
| `avg` | 平均值 | `value` |
| `min` / `max` | 最小/最大值 | `value` |
| `value_count` | 计数（含重复） | `value` |
| `cardinality` | 去重计数（近似值） | `value` |
| `stats` | 一次性返回 count/min/max/avg/sum | 多字段 |
| `extended_stats` | stats + 方差/标准差 | 多字段 |
| `percentiles` | 百分位数 | `values` 对象 |
| `percentile_ranks` | 百分位排名 | `values` 对象 |
| `top_hits` | 返回桶内的 top 文档 | `hits` |

### top_hits（桶内文档）

```json
{
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 10 },
      "aggs": {
        "top_products": {
          "top_hits": {
            "size": 3,
            "sort": [{ "sales": "desc" }],
            "_source": ["name", "price", "sales"]
          }
        }
      }
    }
  }
}
```

## 管道聚合（Pipeline Aggregations）

在其他聚合的输出上做二次计算。

### bucket_sort（桶排序）

```json
{
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 100 },
      "aggs": {
        "total_sales": { "sum": { "field": "amount" } },
        "sort_by_sales": {
          "bucket_sort": {
            "sort": [{ "total_sales": { "order": "desc" } }],
            "size": 10
          }
        }
      }
    }
  }
}
```

### cumulative_sum（累计求和）

```bash
curl -X GET "localhost:9200/orders/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "monthly_sales": {
      "date_histogram": {
        "field": "order_date",
        "calendar_interval": "month"
      },
      "aggs": {
        "revenue": { "sum": { "field": "amount" } },
        "cumulative_revenue": {
          "cumulative_sum": { "buckets_path": "revenue" }
        }
      }
    }
  }
}'
```

```python
resp = es.search(index="orders", size=0, aggs={
    "monthly_sales": {
        "date_histogram": {
            "field": "order_date",
            "calendar_interval": "month",
        },
        "aggs": {
            "revenue": {"sum": {"field": "amount"}},
            "cumulative_revenue": {
                "cumulative_sum": {"buckets_path": "revenue"}
            },
        },
    }
})

for bucket in resp["aggregations"]["monthly_sales"]["buckets"]:
    print(f"{bucket['key_as_string']}: "
          f"revenue={bucket['revenue']['value']}, "
          f"cumulative={bucket['cumulative_revenue']['value']}")
```

### derivative（导数/环比变化）

```json
{
  "aggs": {
    "monthly_sales": {
      "date_histogram": {
        "field": "order_date",
        "calendar_interval": "month"
      },
      "aggs": {
        "revenue": { "sum": { "field": "amount" } },
        "revenue_change": {
          "derivative": { "buckets_path": "revenue" }
        }
      }
    }
  }
}
```

### 其他管道聚合

| 聚合 | 说明 |
|------|------|
| `avg_bucket` | 同级桶的平均值 |
| `max_bucket` / `min_bucket` | 同级桶的最大/最小值 |
| `sum_bucket` | 同级桶的总和 |
| `moving_avg` | 移动平均 |
| `moving_fn` | 自定义移动窗口函数 |
| `bucket_selector` | 根据条件过滤桶 |
| `bucket_script` | 自定义桶级脚本计算 |

### bucket_selector（条件过滤桶）

```json
{
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 50 },
      "aggs": {
        "total_sales": { "sum": { "field": "amount" } },
        "high_revenue_only": {
          "bucket_selector": {
            "buckets_path": { "revenue": "total_sales" },
            "script": "params.revenue > 10000"
          }
        }
      }
    }
  }
}
```

## 复合聚合（Composite Aggregation）

专为高基数字段设计的分页聚合，使用 `after_key` 游标遍历所有桶。

### 基本用法

```bash
# 首次请求
curl -X GET "localhost:9200/orders/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "all_categories": {
      "composite": {
        "size": 100,
        "sources": [
          { "category": { "terms": { "field": "category" } } },
          { "month": { "date_histogram": { "field": "order_date", "calendar_interval": "month" } } }
        ]
      },
      "aggs": {
        "total_revenue": { "sum": { "field": "amount" } },
        "avg_amount": { "avg": { "field": "amount" } }
      }
    }
  }
}'

# 后续分页：使用上一次响应的 after_key
curl -X GET "localhost:9200/orders/_search" -H 'Content-Type: application/json' -d'
{
  "size": 0,
  "aggs": {
    "all_categories": {
      "composite": {
        "size": 100,
        "sources": [
          { "category": { "terms": { "field": "category" } } },
          { "month": { "date_histogram": { "field": "order_date", "calendar_interval": "month" } } }
        ],
        "after": { "category": "electronics", "month": 1706745600000 }
      },
      "aggs": {
        "total_revenue": { "sum": { "field": "amount" } }
      }
    }
  }
}'
```

### Python 完整分页遍历

```python
def composite_agg_scan(es, index, agg_body):
    """遍历 composite 聚合的所有桶"""
    after = None
    while True:
        body = {
            "size": 0,
            "aggs": {"result": agg_body.copy()},
        }
        if after:
            body["aggs"]["result"]["composite"]["after"] = after

        resp = es.search(index=index, **body)
        agg_result = resp["aggregations"]["result"]
        buckets = agg_result["buckets"]
        if not buckets:
            break

        for bucket in buckets:
            yield bucket

        after = agg_result.get("after_key")
        if after is None:
            break

# 使用
agg_body = {
    "composite": {
        "size": 500,
        "sources": [
            {"customer": {"terms": {"field": "customer_id"}}},
        ],
    },
    "aggs": {
        "total_spent": {"sum": {"field": "amount"}},
    },
}

for bucket in composite_agg_scan(es, "orders", agg_body):
    print(f"Customer {bucket['key']['customer']}: {bucket['total_spent']['value']}")
```

## 实用聚合模式

### 电商分面搜索（Faceted Search）

```json
{
  "query": { "match": { "name": "手机" } },
  "size": 20,
  "aggs": {
    "brands":     { "terms": { "field": "brand",    "size": 20 } },
    "price_range": {
      "range": {
        "field": "price",
        "ranges": [
          { "key": "0-1000",     "to": 1000 },
          { "key": "1000-3000",  "from": 1000, "to": 3000 },
          { "key": "3000-5000",  "from": 3000, "to": 5000 },
          { "key": "5000+",      "from": 5000 }
        ]
      }
    },
    "avg_price":  { "avg": { "field": "price" } }
  }
}
```

### 时间序列仪表盘

```json
{
  "size": 0,
  "query": { "range": { "timestamp": { "gte": "now-24h" } } },
  "aggs": {
    "by_interval": {
      "date_histogram": {
        "field": "timestamp",
        "fixed_interval": "5m"
      },
      "aggs": {
        "error_count":  { "filter": { "term": { "level": "error" } } },
        "avg_duration": { "avg": { "field": "duration_ms" } },
        "p99_duration": { "percentiles": { "field": "duration_ms", "percents": [99] } }
      }
    }
  }
}
```

## 常见陷阱

- **terms 聚合默认只返回 10 个桶**：`size` 默认为 10，不是全部。需要更多桶必须显式设置 `size`，但不要设成极大值（如 100000），高基数场景应使用 composite 聚合
- **terms 聚合结果是近似值**：在多分片环境下，每个分片独立计算 top-N 桶再合并，低频桶可能被遗漏。增大 `shard_size` 可提高精度但会增加开销
- **cardinality 是近似值**：基于 HyperLogLog++ 算法，低基数（<1000）几乎精确，高基数存在误差。`precision_threshold` 默认 3000，增大可减少误差但消耗更多内存
- **text 字段不能直接聚合**：聚合需要 keyword 或 numeric 字段。text 字段需使用其 `.keyword` 子字段（如 `title.keyword`）
- **nested 字段聚合必须用 nested 聚合包裹**：直接在 nested 字段上做 terms 聚合会得到空结果
- **管道聚合的 buckets_path 语法**：用 `>` 分隔嵌套路径（如 `parent>child`），用 `.` 访问多值指标（如 `stats.avg`）
- **date_histogram 时区问题**：默认使用 UTC，中国时区需指定 `"time_zone": "+08:00"` 或 `"time_zone": "Asia/Shanghai"`，否则按天/月分组的边界会偏移 8 小时
- **size: 0 容易遗忘**：不需要搜索文档结果时（仅要聚合），务必设置 `size: 0`，否则会同时返回默认 10 条文档，浪费带宽

## 组合提示

- 配合 **elasticsearch-queries** 通过 query 限定聚合的文档范围
- 配合 **elasticsearch-core** 理解字段类型对聚合行为的影响
- 配合 **elasticsearch-python** 使用 elasticsearch-dsl-py 的 `A()` 快捷方式构建聚合
- 配合 **elasticsearch-operations** 优化大规模聚合的性能（分片策略、缓存配置）
