---
name: langchain-vector-stores
description: LangChain 向量存储与 RAG 检索基础：统一 API、相似度搜索与检索架构选型
tech_stack: [langchain, backend]
language: [python]
capability: [rag, search-engine]
version: "langchain unversioned"
collected_at: 2026-04-18
---

# LangChain Vector Stores（向量存储）

> 来源：
> - https://docs.langchain.com/oss/python/integrations/vectorstores
> - https://docs.langchain.com/oss/python/langchain/retrieval

## 用途
将文档嵌入为向量并提供相似度检索，是 RAG（检索增强生成）的核心基础组件，用于突破 LLM 上下文窗口与静态知识的限制。

## 何时使用
- 需要为 LLM 注入外部/私有知识（文档问答、企业知识库）
- 构建 RAG 流水线：`Loader → Splitter → Embeddings → VectorStore → Retriever`
- 对大规模文本做语义（而非关键字）检索
- 需要按 metadata 过滤的语义召回场景

## 基础用法

```python
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_core.documents import Document

# 1. 初始化（传入 embedding 模型）
vector_store = InMemoryVectorStore(embedding=SomeEmbeddingModel())

# 2. 写入
vector_store.add_documents(
    documents=[Document(page_content="..."), Document(page_content="...")],
    ids=["id1", "id2"],
)

# 3. 检索
docs = vector_store.similarity_search("your query here", k=4)

# 4. 删除
vector_store.delete(ids=["id1"])
```

## 关键 API（摘要）

| API | 说明 |
|-----|------|
| `add_documents(documents, ids=...)` | 批量写入 Document，可指定 ID 以便后续更新/删除 |
| `delete(ids=[...])` | 按 ID 删除 |
| `similarity_search(query, k=4, filter=...)` | 语义近邻查询，`filter` 支持 metadata 过滤 |
| `InMemoryVectorStore(embedding=...)` | 开发/测试用的内存实现，位于 `langchain_core.vectorstores` |

RAG 管线其他搭档组件：
- **Document Loaders**：外部数据源 → 标准化 `Document`
- **Text Splitters**：大文档切块
- **Embeddings**：文本 → 向量（OpenAI / Azure / Gemini / Bedrock / HuggingFace / Ollama / Cohere / Mistral 等）
- **Retrievers**：统一检索接口，可在 vector store 之上封装更多策略

## 注意事项

- **相似度度量**：cosine / Euclidean / dot product，多数后端底层用 HNSW 索引；选择需与 embedding 模型训练目标一致（多数现代模型用 cosine）
- **query 与索引必须共用同一个 embedding 模型**，否则检索质量崩塌
- **InMemoryVectorStore 仅适合原型**，生产用 Pinecone / Qdrant / Chroma / Milvus / MongoDB Atlas / Elasticsearch / PGVector 等 100+ 集成之一
- **metadata filter 行为因后端而异**：语法、支持的操作符（`$eq` / `$in` 等）由具体实现决定，跨后端不可直接移植
- 版本信息未在官方文档显式标注，以 `collected_at` 日期对齐最新语义

## RAG 架构选型

| 架构 | 形态 | 控制力 | 灵活性 | 延迟 | 适用 |
|------|------|--------|--------|------|------|
| **2-Step RAG** | 必检索 → 生成 | 高 | 低 | 快 | 检索是必要前置的确定性场景 |
| **Agentic RAG** | Agent 自行决策是否/如何检索 | 低 | 高 | 变动 | 复杂推理、多轮/多工具场景 |
| **Hybrid** | 在检索与生成之间加 query 改写、相关性/答案校验 | 中 | 中 | 变动 | 歧义 query、对质量/正确性要求高 |

## 组合提示
- 通常与 `langchain-text-splitters`、具体的 `langchain-<provider>` embedding 包、以及 `Retriever` / `LCEL` 管线组合
- Agentic RAG 场景将 vector store 包成 tool 暴露给 agent，而非强制前置检索
