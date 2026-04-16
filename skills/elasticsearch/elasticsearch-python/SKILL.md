---
name: elasticsearch-python
description: "elasticsearch-py 与 elasticsearch-dsl-py 官方 Python 客户端：连接、CRUD、Bulk、分页、DSL 查询构建与异步客户端"
tech_stack: [elasticsearch, backend]
language: [python]
---

# Elasticsearch Python 客户端

> 来源：https://elasticsearch-py.readthedocs.io/ / https://elasticsearch-dsl.readthedocs.io/
> 版本基准：elasticsearch-py 8.x / elasticsearch-dsl-py 8.x

## 用途

使用 Python 操作 Elasticsearch：通过 elasticsearch-py 低级客户端执行所有 REST API 操作，通过 elasticsearch-dsl-py 高级库以 Pythonic 方式构建查询和定义文档模型。

## 何时使用

- Python 应用中集成 Elasticsearch 搜索功能
- 批量数据导入/ETL 流水线
- 构建复杂查询逻辑（推荐使用 DSL 库）
- 定义文档模型和 ORM 式操作
- 异步 Web 框架（FastAPI/aiohttp）中使用 ES

## 安装

```bash
# 低级客户端（必装）
pip install elasticsearch==8.15.1

# 高级 DSL 库（推荐）
pip install elasticsearch-dsl==8.18.0

# 异步支持
pip install elasticsearch[async]
```

版本对应：elasticsearch-py 主版本号必须与 Elasticsearch 服务端主版本一致（8.x 客户端 -> 8.x 服务端）。

## 连接配置

### 基础连接

```python
from elasticsearch import Elasticsearch

# 本地开发
es = Elasticsearch("http://localhost:9200")

# Basic Auth
es = Elasticsearch(
    "https://my-cluster.example.com:9243",
    basic_auth=("username", "password"),
    verify_certs=True,
    ca_certs="/path/to/http_ca.crt",
)

# API Key 认证（推荐生产环境）
es = Elasticsearch(
    "https://my-cluster.example.com:9243",
    api_key="base64_encoded_api_key",
)

# API Key (id, key) 元组格式
es = Elasticsearch(
    "https://my-cluster.example.com:9243",
    api_key=("api_key_id", "api_key_secret"),
)

# Elastic Cloud
es = Elasticsearch(
    cloud_id="my-deployment:base64_cloud_id",
    api_key="base64_encoded_api_key",
)
```

### 连接池与超时

```python
es = Elasticsearch(
    ["https://node1:9200", "https://node2:9200", "https://node3:9200"],
    api_key="...",
    # 连接池配置
    max_retries=3,
    retry_on_timeout=True,
    # 超时配置
    request_timeout=30,       # 单次请求超时（秒）
    # 连接参数
    connections_per_node=10,
)
```

### 验证连接

```python
info = es.info()
print(info["version"]["number"])  # '8.15.1'

health = es.cluster.health()
print(health["status"])  # 'green'
```

## 文档 CRUD

### 索引（创建/更新）文档

```python
# 指定 ID（若已存在则覆盖）
es.index(index="articles", id="1", document={
    "title": "Elasticsearch 入门",
    "content": "Elasticsearch 是一个分布式搜索引擎...",
    "status": "published",
    "created_at": "2024-01-15",
})

# 自动生成 ID
resp = es.index(index="articles", document={
    "title": "新文章",
    "status": "draft",
})
new_id = resp["_id"]

# create：仅在文档不存在时创建（已存在则报错）
es.create(index="articles", id="unique-id", document={
    "title": "唯一文档",
})
```

### 读取文档

```python
# 获取单个文档
doc = es.get(index="articles", id="1")
source = doc["_source"]
version = doc["_version"]

# 仅获取 _source
source = es.get_source(index="articles", id="1")

# 检查存在性
if es.exists(index="articles", id="1"):
    print("文档存在")

# 批量获取
resp = es.mget(index="articles", ids=["1", "2", "3"])
for doc in resp["docs"]:
    if doc["found"]:
        print(doc["_source"])
```

### 更新文档

```python
# 部分更新
es.update(index="articles", id="1", doc={
    "status": "archived",
    "updated_at": "2024-06-01",
})

# 脚本更新
es.update(index="articles", id="1", script={
    "source": "ctx._source.views += params.count",
    "params": {"count": 1},
})

# upsert（存在则更新，不存在则创建）
es.update(index="articles", id="1",
    doc={"status": "published"},
    upsert={"title": "默认标题", "status": "published"},
)
```

### 删除文档

```python
es.delete(index="articles", id="1")

# 按查询删除
es.delete_by_query(index="articles", query={
    "range": {"created_at": {"lt": "2023-01-01"}}
})
```

## 搜索

```python
resp = es.search(
    index="articles",
    query={
        "bool": {
            "must": [{"match": {"content": "elasticsearch"}}],
            "filter": [{"term": {"status": "published"}}],
        }
    },
    highlight={"fields": {"content": {"fragment_size": 200}}},
    sort=[{"created_at": "desc"}],
    source=["title", "created_at", "status"],
    from_=0,
    size=20,
)

total = resp["hits"]["total"]["value"]
for hit in resp["hits"]["hits"]:
    print(f"Score: {hit['_score']}, Title: {hit['_source']['title']}")
    if "highlight" in hit:
        print(f"Highlight: {hit['highlight']['content']}")
```

注意：Python 客户端中 `from` 参数需写作 `from_`（避免与 Python 关键字冲突）。

## Bulk API（批量操作）

### helpers.bulk（推荐）

```python
from elasticsearch.helpers import bulk

# 基本用法
actions = [
    {
        "_index": "articles",
        "_id": str(i),
        "_source": {
            "title": f"文章 {i}",
            "content": f"内容 {i}",
            "status": "published",
        },
    }
    for i in range(1000)
]

success, errors = bulk(es, actions, chunk_size=500, raise_on_error=False)
print(f"成功: {success}, 失败: {len(errors)}")
```

### 使用生成器（内存友好）

```python
def generate_actions():
    """从大文件或数据库逐行生成文档，不需要一次性加载到内存"""
    import csv
    with open("data.csv") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield {
                "_index": "products",
                "_id": row["id"],
                "_source": {
                    "name": row["name"],
                    "price": float(row["price"]),
                    "category": row["category"],
                },
            }

success, errors = bulk(es, generate_actions(), chunk_size=1000)
```

### helpers.parallel_bulk（多线程并行）

```python
from elasticsearch.helpers import parallel_bulk

for ok, result in parallel_bulk(
    es,
    generate_actions(),
    chunk_size=500,
    thread_count=4,
    raise_on_error=False,
):
    if not ok:
        print(f"Failed: {result}")
```

注意：`parallel_bulk` 返回一个生成器，**必须消费（迭代）它才会实际执行**。

### helpers.streaming_bulk（流式处理）

```python
from elasticsearch.helpers import streaming_bulk

for ok, result in streaming_bulk(
    es,
    generate_actions(),
    chunk_size=500,
    raise_on_error=False,
):
    action, info = result.popitem()
    if not ok:
        print(f"Failed to {action}: {info}")
```

### Bulk 性能优化

```python
# 写入前禁用刷新
es.indices.put_settings(index="articles", settings={
    "index.refresh_interval": "-1",
    "index.number_of_replicas": 0,
})

# 执行 bulk 写入
bulk(es, generate_actions(), chunk_size=2000)

# 写入后恢复设置
es.indices.put_settings(index="articles", settings={
    "index.refresh_interval": "1s",
    "index.number_of_replicas": 1,
})

# 强制刷新使数据可搜索
es.indices.refresh(index="articles")
```

## 分页方式

### Scroll API（遍历全量数据）

```python
from elasticsearch.helpers import scan

# scan 是对 scroll API 的封装
for doc in scan(
    es,
    index="articles",
    query={"match_all": {}},
    scroll="5m",
    size=1000,
    source=["title", "status"],
):
    process(doc["_source"])
```

### search_after + PIT（推荐的深度分页）

```python
pit = es.open_point_in_time(index="articles", keep_alive="5m")
pit_id = pit["id"]

search_after = None
try:
    while True:
        kwargs = {
            "size": 100,
            "query": {"term": {"status": "published"}},
            "pit": {"id": pit_id, "keep_alive": "5m"},
            "sort": [{"created_at": "desc"}, {"_shard_doc": "asc"}],
        }
        if search_after:
            kwargs["search_after"] = search_after

        resp = es.search(**kwargs)
        hits = resp["hits"]["hits"]
        if not hits:
            break

        for hit in hits:
            process(hit["_source"])

        search_after = hits[-1]["sort"]
        # PIT ID 可能在响应中更新
        pit_id = resp.get("pit_id", pit_id)
finally:
    es.close_point_in_time(id=pit_id)
```

## elasticsearch-dsl-py 高级库

### 查询构建（Query）

```python
from elasticsearch_dsl import Search, Q

# 基本搜索
s = Search(using=es, index="articles")
s = s.query("match", title="elasticsearch")
s = s.filter("term", status="published")
s = s.exclude("range", created_at={"lt": "2023-01-01"})
s = s.sort("-created_at")  # 前缀 - 表示降序
s = s.source(includes=["title", "created_at"])
s = s[0:20]  # 分页：from=0, size=20

response = s.execute()
print(f"Total: {response.hits.total.value}")
for hit in response:
    print(hit.title, hit.meta.score)
```

### 复杂查询组合

```python
from elasticsearch_dsl import Q

# Q 对象可用 & | ~ 运算符组合
q_title = Q("match", title="elasticsearch")
q_content = Q("match", content="搜索引擎")
q_status = Q("term", status="published")
q_date = Q("range", created_at={"gte": "2024-01-01"})

# (title OR content) AND status AND date
combined = (q_title | q_content) & q_status & q_date

s = Search(using=es, index="articles")
s = s.query(combined)
s = s.highlight("title", "content", fragment_size=200)
response = s.execute()

for hit in response:
    # 高亮结果
    if hasattr(hit.meta, "highlight"):
        print(hit.meta.highlight.title)
```

### 聚合

```python
from elasticsearch_dsl import Search, A

s = Search(using=es, index="articles")
s = s.query("match", content="elasticsearch")

# 添加聚合
s.aggs.bucket("by_status", "terms", field="status")
s.aggs.bucket("by_month", "date_histogram",
    field="created_at",
    calendar_interval="month",
).metric("avg_views", "avg", field="views")

response = s.execute()

for bucket in response.aggregations.by_status.buckets:
    print(f"{bucket.key}: {bucket.doc_count}")

for bucket in response.aggregations.by_month.buckets:
    print(f"{bucket.key_as_string}: avg_views={bucket.avg_views.value}")
```

### Document 持久化模型

```python
from datetime import datetime
from elasticsearch_dsl import Document, Text, Keyword, Date, Integer, InnerDoc, Nested

class Comment(InnerDoc):
    author = Keyword()
    content = Text()
    created_at = Date()

class Article(Document):
    title = Text(analyzer="standard", fields={"raw": Keyword()})
    content = Text()
    status = Keyword()
    tags = Keyword(multi=True)
    views = Integer()
    created_at = Date()
    comments = Nested(Comment)

    class Index:
        name = "articles"
        settings = {
            "number_of_shards": 2,
            "number_of_replicas": 1,
        }

# 创建索引（含 mapping）
Article.init(using=es)

# 创建文档
article = Article(
    meta={"id": "1"},
    title="Elasticsearch 入门",
    content="这是一篇教程...",
    status="published",
    tags=["elasticsearch", "tutorial"],
    views=0,
    created_at=datetime.now(),
)
article.comments.append(Comment(
    author="Alice",
    content="写得不错！",
    created_at=datetime.now(),
))
article.save(using=es)

# 获取文档
article = Article.get(id="1", using=es)
print(article.title)

# 更新
article.views += 1
article.save(using=es)

# 删除
article.delete(using=es)

# 搜索
s = Article.search(using=es)
s = s.filter("term", status="published")
for article in s.execute():
    print(article.title)
```

## 异步客户端

```python
from elasticsearch import AsyncElasticsearch

es_async = AsyncElasticsearch(
    "https://my-cluster:9243",
    api_key="...",
)

# 在 async 函数中使用
async def search_articles(query: str):
    resp = await es_async.search(
        index="articles",
        query={"match": {"content": query}},
        size=20,
    )
    return resp["hits"]["hits"]

async def bulk_index(documents):
    from elasticsearch.helpers import async_bulk
    success, errors = await async_bulk(es_async, documents)
    return success

# 关闭连接（重要）
async def cleanup():
    await es_async.close()
```

### FastAPI 集成示例

```python
from fastapi import FastAPI, Depends
from elasticsearch import AsyncElasticsearch
from contextlib import asynccontextmanager

es = AsyncElasticsearch("http://localhost:9200")

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await es.close()

app = FastAPI(lifespan=lifespan)

@app.get("/search")
async def search(q: str, page: int = 1, size: int = 20):
    resp = await es.search(
        index="articles",
        query={"multi_match": {"query": q, "fields": ["title^3", "content"]}},
        from_=(page - 1) * size,
        size=size,
    )
    return {
        "total": resp["hits"]["total"]["value"],
        "results": [hit["_source"] for hit in resp["hits"]["hits"]],
    }
```

## 索引管理

```python
# 创建索引
es.indices.create(index="my-index", mappings={...}, settings={...})

# 检查索引是否存在
es.indices.exists(index="my-index")

# 获取 mapping
es.indices.get_mapping(index="my-index")

# 添加字段到现有 mapping
es.indices.put_mapping(index="my-index", properties={
    "new_field": {"type": "keyword"}
})

# 删除索引
es.indices.delete(index="my-index")

# 刷新索引
es.indices.refresh(index="my-index")
```

## 常见陷阱

- **版本不匹配**：elasticsearch-py 8.x 无法连接 7.x 服务端，主版本号必须一致
- **parallel_bulk 返回生成器**：必须迭代消费 `parallel_bulk()` 的返回值，否则不会执行任何操作。常见错误是 `parallel_bulk(...)` 不用 `for` 循环消费
- **from_ 不是 from**：Python 客户端中分页参数是 `from_`（带下划线），因为 `from` 是 Python 保留字
- **异步客户端必须显式关闭**：`AsyncElasticsearch` 使用完毕必须调用 `await es.close()`，否则会报 `ResourceWarning`
- **bulk 默认 chunk_size=500**：对于大文档（每条 >10KB），应适当减小 chunk_size 以避免请求体过大
- **scan helper 不保证顺序**：`helpers.scan()` 为吞吐量优化，不保证文档返回顺序。需要有序遍历应使用 `search_after`
- **DSL 的 Search 对象是不可变的**：每次调用 `.query()` / `.filter()` 等方法都返回新对象，必须赋值接收。`s.query(...)` 不会修改 `s` 本身
- **Document.save() 是全量覆盖**：DSL 的 `Document.save()` 会用当前对象的所有字段覆盖 ES 中的文档，不是部分更新。部分更新应使用 `article.update(views=100)`

## 组合提示

- 配合 **elasticsearch-core** 理解索引结构和映射定义
- 配合 **elasticsearch-queries** 理解 Query DSL 语法（Python 客户端的 query 参数直接对应 DSL JSON）
- 配合 **elasticsearch-aggregations** 构建聚合查询
- 配合 **elasticsearch-operations** 管理集群和索引生命周期
