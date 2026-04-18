---
name: langchain-embeddings
description: LangChain Embeddings 抽象接口与缓存包装器，用于将文本映射到向量以支持语义检索与 RAG
tech_stack: [langchain, backend]
language: [python]
capability: [rag]
version: "langchain unversioned"
collected_at: 2026-04-18
---

# LangChain Embeddings（文本向量化接口）

> 来源：
> - https://docs.langchain.com/oss/python/integrations/embeddings
> - https://reference.langchain.com/python/langchain-core/embeddings/embeddings/Embeddings
> - https://docs.langchain.com/oss/python/langchain/knowledge-base

## 用途

`Embeddings` 是 `langchain-core` 中的抽象基类，为各类文本向量化模型（OpenAI、Google、HuggingFace 等）提供统一接口，输出定长向量以便按语义相似度检索，是 RAG 流水线中 Text Splitter 与 Vector Store 之间的连接层。

## 何时使用

- 构建语义搜索 / RAG：把文档与查询映射到同一向量空间后做相似度比对
- 需要跨 provider 切换向量模型但保持上层代码不变
- 需要对高频文本的 embedding 做磁盘/KV 缓存以降低 API 成本与延迟
- 离线批量向量化（用 `embed_documents`）与在线查询（用 `embed_query`）路径分离

不适用：只想做关键词匹配、或向量模型本身已由 Vector Store 内部封装时无需直接接触此接口。

## 基础用法

```python
from langchain_openai import OpenAIEmbeddings

emb = OpenAIEmbeddings(model="text-embedding-3-small")

# 批量文档向量（List[List[float]]）
doc_vecs = emb.embed_documents(["hello world", "langchain rocks"])

# 单条查询向量（List[float]）
q_vec = emb.embed_query("what is langchain?")
```

## 关键 API（摘要）

`Embeddings` 抽象类：

- `embed_documents(texts: List[str]) -> List[List[float]]`：批量向量化文档
- `embed_query(text: str) -> List[float]`：单条查询向量化
- `aembed_documents(texts)` / `aembed_query(text)`：异步变体，默认回退到同步实现，provider 可覆写以获得原生异步性能

`CacheBackedEmbeddings`（来自 `langchain_classic.embeddings`）——用 KV 存储缓存哈希后的文本向量：

- `from_bytes_store(underlying_embedder, document_embedding_cache, *, namespace="", batch_size=None, query_embedding_cache=None)`
- `underlying_embedder`：底层真正调用 provider 的 embedder
- `namespace`：**必填最佳实践**，通常设为 `underlying_embeddings.model`，避免不同模型缓存串台
- `query_embedding_cache`：默认不缓存查询，如需缓存需显式传入

常见相似度度量（上层自行计算或由 Vector Store 处理）：

- 余弦相似度（cosine）——度量向量夹角，最常用
- 欧氏距离（euclidean）——直线距离
- 点积（dot product）——投影量

## 基础示例

余弦相似度手算：

```python
import numpy as np

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

print(cosine_similarity(q_vec, doc_vecs[0]))
```

文件级缓存包装：

```python
from langchain_classic.embeddings import CacheBackedEmbeddings
from langchain_classic.storage import LocalFileStore
from langchain_openai import OpenAIEmbeddings

underlying = OpenAIEmbeddings(model="text-embedding-3-small")
store = LocalFileStore("./cache/")

cached = CacheBackedEmbeddings.from_bytes_store(
    underlying,
    store,
    namespace=underlying.model,   # 避免不同模型共用缓存
)

cached.embed_query("Hello, world!")  # 首次走 API
cached.embed_query("Hello, world!")  # 命中缓存，近乎瞬时
```

## 注意事项

- **namespace 必设**：不同 embedding 模型产生的向量维度/分布不同，共用缓存会返回错误向量。约定用 `model` 名作为 namespace
- **查询默认不缓存**：`CacheBackedEmbeddings` 仅缓存 `embed_documents`，查询缓存需显式传 `query_embedding_cache`
- **query 与 document 接口分离是刻意设计**：部分模型（如 instruction-tuned）对查询与文档使用不同 prompt 或前缀，不要假设二者可互换
- **异步回退代价**：未覆写 `aembed_*` 的 provider 实际还是同步执行，高并发场景需确认 provider 是否原生支持
- **分块先行**：对长文档先用 `RecursiveCharacterTextSplitter`（典型 1000 字符 chunk + 200 字符 overlap）再 embedding，避免超长文本被截断

## 组合提示

典型 RAG 装配链路：

```
PyPDFLoader / 其他 DocumentLoader
  -> RecursiveCharacterTextSplitter（切块）
  -> Embeddings（可用 CacheBackedEmbeddings 包一层）
  -> VectorStore（InMemoryVectorStore / Chroma / FAISS / PGVector ...）
  -> Retriever（vectorstore.as_retriever()，支持 similarity / MMR / score 过滤）
  -> LCEL chain 或 LangGraph agent
```

可选接入 LangSmith 做 tracing：设置 `LANGSMITH_TRACING=true` 与 `LANGSMITH_API_KEY` 环境变量。
