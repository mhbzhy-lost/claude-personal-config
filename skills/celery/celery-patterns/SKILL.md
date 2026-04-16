---
name: celery-patterns
description: "Celery Canvas 工作流原语：chain、group、chord、chunks、starmap、任务签名与不可变签名。"
tech_stack: [celery]
---

# Celery Patterns（Canvas 工作流）

> 来源：https://docs.celeryq.dev/en/stable/userguide/canvas.html
> 版本基准：Celery 5.4+（当前稳定线 5.6）

## 用途

Canvas 是 Celery 的工作流编排系统，提供 chain（链式）、group（并行组）、chord（带回调的并行）、chunks（分块）等原语，用于将多个任务组合为复杂的分布式工作流。所有原语本身也是签名对象，可以嵌套组合。

## 何时使用

- 多个任务需要按顺序执行，上游结果传给下游（chain）
- 多个独立任务需要并行执行（group）
- 并行任务全部完成后需要汇总处理（chord）
- 大批量数据需要分块并行处理（chunks）
- 需要构建 DAG 式复杂工作流（原语嵌套组合）

## 前置任务定义

以下示例基于这组任务：

```python
# proj/tasks.py
from celery import shared_task

@shared_task
def add(x, y):
    return x + y

@shared_task
def multiply(x, y):
    return x * y

@shared_task
def sum_list(numbers):
    return sum(numbers)

@shared_task
def fetch_url(url):
    import httpx
    resp = httpx.get(url, timeout=30)
    return {"url": url, "status": resp.status_code, "length": len(resp.text)}

@shared_task
def save_results(results):
    # 将汇总结果写入数据库
    db.bulk_insert(results)
    return len(results)

@shared_task(bind=True)
def on_error(self, request, exc, traceback):
    """chord/chain 的错误回调"""
    print(f"Task {request.id} failed: {exc}")
```

## Signature（签名）

签名是任务调用的"蓝图"，封装了任务名、参数和选项，可以传递、序列化和组合。

```python
from celery import signature

# 创建签名的三种方式
sig1 = add.signature((2, 3))          # 完整写法
sig2 = add.s(2, 3)                     # 快捷方式
sig3 = signature("proj.tasks.add", args=(2, 3))  # 按名称（跨项目调用）

# 签名可以附加选项
sig = add.s(2, 3).set(
    queue="high_priority",
    countdown=10,
    expires=60,
)

# 执行签名
result = sig.delay()          # 异步执行
result = sig.apply_async()    # 等价，支持更多参数
```

### Partial Signature（部分签名）

```python
# 部分签名：只提供部分参数，剩余参数在调用时或被上游结果填充
partial = add.s(2)     # 缺少第二个参数
result = partial.delay(3)  # 补充 y=3 -> add(2, 3)

# 在 chain 中，上游结果自动填充为第一个参数
# chain: add(4, 4) -> add(8, 5) -> add(13, 6)
workflow = chain(add.s(4, 4), add.s(5), add.s(6))
```

### Immutable Signature（不可变签名）

```python
# 不可变签名：不接收上游结果作为参数
sig = add.si(10, 20)   # si = signature immutable

# 在 chain 中，不可变签名忽略上游返回值
workflow = chain(add.s(4, 4), add.si(10, 20))
# add(4,4)=8, 然后 add(10,20)=30（8 被忽略）
```

## Chain（链式执行）

任务按顺序执行，每个任务的返回值自动传递给下一个任务的第一个参数。

```python
from celery import chain

# 方式一：显式 chain()
workflow = chain(add.s(4, 4), add.s(5), add.s(6))
result = workflow.apply_async()
# 执行顺序：add(4,4)=8 -> add(8,5)=13 -> add(13,6)=19
print(result.get())  # 19

# 方式二：管道操作符 |
workflow = add.s(4, 4) | add.s(5) | add.s(6)
result = workflow.apply_async()

# 获取中间结果
result = workflow.apply_async()
result.parent.get()        # 中间步骤的结果
result.parent.parent.get() # 更早步骤的结果
```

### Chain 错误处理

```python
# chain 中任何一步失败，后续步骤不再执行
# 可以通过 link_error 设置错误回调
workflow = chain(
    fetch_url.s("https://example.com"),
    save_results.s(),
)
result = workflow.apply_async(link_error=on_error.s())
```

## Group（并行执行）

将多个任务组成一组，并行发送给 Worker 执行。

```python
from celery import group

# 创建并行组
job = group(add.s(i, i) for i in range(10))
result = job.apply_async()

# 获取所有结果（阻塞）
results = result.get(timeout=30)
# [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]

# 检查是否全部完成
result.ready()       # True/False
result.successful()  # 全部成功返回 True
result.completed_count()  # 已完成数量

# 实际场景：并行抓取多个 URL
urls = ["https://a.com", "https://b.com", "https://c.com"]
job = group(fetch_url.s(url) for url in urls)
results = job.apply_async().get(timeout=60)
```

## Chord（并行 + 回调）

chord = group（header） + 回调任务（body）。header 中所有任务并行执行完毕后，结果列表传给 body 回调。

```python
from celery import chord

# 基础 chord：10 个加法并行，结果汇总求和
callback = sum_list.s()
header = group(add.s(i, i) for i in range(10))
result = chord(header)(callback)
# 等价写法
result = chord(add.s(i, i) for i in range(10))(sum_list.s())

print(result.get())  # 90

# 管道写法
result = (group(add.s(i, i) for i in range(10)) | sum_list.s()).apply_async()
```

### Chord 错误处理

```python
# chord 中任何一个任务失败，默认回调不会执行
# 使用 link_error 处理错误
result = chord(
    [fetch_url.s(url) for url in urls],
    save_results.s().on_error(on_error.s())
).apply_async()
```

### Chord 进阶：嵌套

```python
# chord 内可以嵌套 chain
workflow = chord(
    [
        chain(fetch_url.s(url), process_result.s())
        for url in urls
    ],
    save_results.s()
)
```

## Chunks（分块）

将大量数据分成若干块，每块作为一个任务并行执行。

```python
# 将 100 个任务分成 10 组，每组 10 个
result = add.chunks(zip(range(100), range(100)), 10).apply_async()
results = result.get()
# [[0, 2, 4, ...], [20, 22, 24, ...], ...]  每组一个子列表

# 实际场景：批量处理用户数据
user_ids = list(range(10000))
chunk_size = 100
result = process_user.chunks(
    [(uid,) for uid in user_ids],
    chunk_size
).apply_async()
```

## Map 和 Starmap

```python
# map：将参数列表逐一应用到同一个任务（在单个任务中顺序执行）
result = add.starmap([(2, 2), (4, 4), (8, 8)])
# 在一个 Worker 进程中顺序执行所有调用

# 与 chunks 的区别：
# - starmap：所有调用在单个任务中执行
# - chunks：分成多个任务并行执行
```

## 实战工作流示例

### ETL 管道

```python
from celery import chain, group, chord

@shared_task
def extract_source(source_id):
    """从数据源提取原始数据"""
    return fetch_raw_data(source_id)

@shared_task
def transform(raw_data):
    """清洗转换数据"""
    return clean_and_transform(raw_data)

@shared_task
def load_to_warehouse(transformed_list):
    """批量写入数仓"""
    warehouse.bulk_insert(transformed_list)
    return len(transformed_list)

@shared_task
def notify_complete(count):
    """发送完成通知"""
    send_slack(f"ETL 完成，共处理 {count} 条记录")

# 多数据源并行提取 -> 各自转换 -> 汇总加载 -> 通知
source_ids = [1, 2, 3, 4, 5]
workflow = chord(
    [chain(extract_source.s(sid), transform.s()) for sid in source_ids],
    chain(load_to_warehouse.s(), notify_complete.s())
)
workflow.apply_async()
```

### 扇出-聚合模式

```python
@shared_task
def search_engine(query, engine):
    """在指定搜索引擎中搜索"""
    return do_search(query, engine)

@shared_task
def merge_results(results_list):
    """合并去重排序"""
    merged = []
    for results in results_list:
        merged.extend(results)
    return sorted(set(merged), key=lambda x: x["score"], reverse=True)[:20]

def parallel_search(query):
    engines = ["google", "bing", "duckduckgo"]
    workflow = chord(
        [search_engine.s(query, engine) for engine in engines],
        merge_results.s()
    )
    return workflow.apply_async()
```

### Django View 中使用 Canvas

```python
# views.py
from django.http import JsonResponse
from celery import chain
from .tasks import validate_order, charge_payment, send_confirmation

def create_order(request):
    order_data = request.POST.dict()
    workflow = chain(
        validate_order.s(order_data),
        charge_payment.s(),
        send_confirmation.s(),
    )
    result = workflow.apply_async()
    return JsonResponse({"task_id": result.id, "status": "processing"})
```

### FastAPI 中使用 Canvas

```python
from fastapi import FastAPI
from celery import chord, chain
from celery.result import AsyncResult
from app.tasks import fetch_url, save_results

app = FastAPI()

@app.post("/crawl/")
def start_crawl(urls: list[str]):
    workflow = chord(
        [fetch_url.s(url) for url in urls],
        save_results.s()
    )
    result = workflow.apply_async()
    return {"task_id": result.id}

@app.get("/crawl/{task_id}")
def get_crawl_status(task_id: str):
    result = AsyncResult(task_id)
    return {
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
```

## 常见陷阱

- **chord 中不要使用 Redis 作为 result_backend 而不设置 result_backend**：chord 强依赖 result backend 来追踪 header 任务完成状态，没有 backend 会直接报错
- **chain 内调用 result.get()**：在任务内部对同一个 Worker 池的任务调用 `get()` 会死锁；应始终用 chain/chord 而非手动等待
- **group 结果顺序**：group 的结果列表与输入顺序一致，但执行顺序不保证
- **chord 错误传播**：header 中任何任务失败，默认 body 回调不执行（Celery 5.x）；需要容错时可在 header 任务中 catch 异常返回默认值
- **不可变签名忘记用 si()**：在 chord body 中如果不需要 header 结果，必须用 `.si()` 否则结果列表会被强行传入导致参数错误
- **chunks 返回嵌套列表**：`chunks().apply_async().get()` 返回的是 `[[...], [...], ...]` 嵌套结构，需要展平
- **大规模 group/chord**：超过数千个任务的 group/chord 会给 Broker 造成压力，考虑用 chunks 分批或限制并发
- **管道操作符优先级**：`a.s() | b.s() | c.s()` 是从左到右结合，但混合 group 时注意加括号 `(group(...) | callback.s())`

## 组合提示

- 与 **celery-core** 搭配：任务定义、Broker/Backend 配置是 Canvas 的前提
- 与 **celery-scheduling** 搭配：可以在 Beat 定时任务中触发复杂 Canvas 工作流
- 与 **celery-monitoring** 搭配：通过 Flower 监控工作流中各步骤的执行状态
- chain 中配合 `link_error` 实现错误回调，chord 中用 `.on_error()` 处理聚合失败
