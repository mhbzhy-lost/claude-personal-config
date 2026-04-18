---
name: langchain-retrievers
description: LangChain Retriever 接口与 RAG 检索组件用法，覆盖向量检索、BM25 与外部知识源集成
tech_stack: [langchain, backend]
language: [python]
capability: [rag, search-engine]
version: "langchain unversioned"
collected_at: 2026-04-18
---

# LangChain Retrievers（检索器）

> 来源：
> - https://docs.langchain.com/oss/python/langchain/retrieval
> - https://docs.langchain.com/oss/python/integrations/retrievers
> - https://docs.langchain.com/oss/python/integrations/retrievers/bm25

## 用途
Retriever 是 LangChain 中"给定一个字符串 query，返回一组 `Document`"的统一接口，是 RAG（Retrieval-Augmented Generation）的核心组件，用于弥补 LLM 上下文窗口有限与知识静态两大短板。

## 何时使用
- 构建 RAG 问答系统：向 LLM 注入外部知识作为上下文
- 接入已有知识源（Wikipedia、Arxiv、Tavily、企业 SQL/CRM）而无需自建向量库
- 需要非向量的关键字/稀疏检索（BM25、TF-IDF）或与向量检索做混合召回
- 作为 Agent 工具，由 LLM 自主决定"是否检索/检索什么"（Agentic RAG）

## 基础用法

### 1. 从向量库转 Retriever（最常见）
```python
retriever = vector_store.as_retriever()  # 任意 VectorStore 都支持
docs = retriever.invoke("what is BM25?")
```

### 2. BM25 稀疏检索
```python
# pip install -qU rank_bm25
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document

retriever = BM25Retriever.from_documents([
    Document(page_content="foo"),
    Document(page_content="foo bar"),
])
docs = retriever.invoke("foo")
```

### 3. 自定义分词（BM25 推荐）
```python
import nltk; nltk.download("punkt_tab")
from nltk.tokenize import word_tokenize

retriever = BM25Retriever.from_documents(docs, k=2, preprocess_func=word_tokenize)
```

### 4. BM25Plus（短文档友好）
```python
retriever = BM25Retriever.from_documents(
    docs,
    bm25_variant="plus",
    bm25_params={"delta": 0.5},
)
```

## 关键 API（摘要）

| API | 说明 |
|------|------|
| `retriever.invoke(query: str) -> list[Document]` | 统一调用入口，所有 retriever 都实现此方法 |
| `VectorStore.as_retriever(**kwargs)` | 将任意向量库转为 Retriever |
| `BM25Retriever.from_texts(texts, **kw)` | 从纯字符串列表构建 BM25 索引（内存） |
| `BM25Retriever.from_documents(docs, k=?, preprocess_func=?, bm25_variant=?, bm25_params=?)` | 从 `Document` 构建；`k` 控制返回数，`preprocess_func` 自定义分词 |

### 常用内置 Retriever

**自带文档索引（Bring-Your-Own Documents）**：
- `AmazonKnowledgeBasesRetriever`（langchain-aws，云）
- `AzureAISearchRetriever`（langchain-community，云）
- `ElasticsearchRetriever`（langchain-elasticsearch，自托管/云）
- `VertexAISearchRetriever`（langchain-google-community，云）

**外部知识源**：
- `ArxivRetriever` - 学术论文
- `TavilySearchAPIRetriever` - 联网搜索
- `WikipediaRetriever` - 维基百科

## RAG 架构选择

| 架构 | 控制力 | 灵活度 | 延迟 | 适用 |
|------|--------|--------|------|------|
| **2-Step RAG** | 高 | 低 | 快 | 检索是明确前置条件的场景 |
| **Agentic RAG** | 低 | 高 | 变化大 | 模糊/复合查询，由 Agent 自行决定何时检索 |
| **Hybrid** | 中 | 中 | 变化 | 需要 query 改写 + 检索校验 + 答案校验等质控环节 |

Agentic RAG 的最小条件："一个能拉取外部知识的 tool"即可。

## 注意事项

- **BM25Retriever 是内存索引**：`from_texts / from_documents` 会在进程内构建，不持久化；大语料或多进程部署需另选方案
- **BM25Plus 解决短文档偏置**：默认 BM25 对短 chunk 打分偏低，RAG 切片后的 chunk 特别适合用 `bm25_variant="plus"` + `delta≈0.5`
- **分词决定 BM25 召回质量**：中文/日文等非空格语言必须传 `preprocess_func`（如 jieba），否则基本召回不到
- **Retriever ≠ VectorStore**：Retriever 只要求"能返回文档"，不要求存储；因此可以封装远程搜索 API、SQL 查询等非向量来源
- 集成包分散在多个 namespace：`langchain-community`（通用第三方）、`langchain-aws` / `langchain-google-community` 等云厂商专用包，按需安装

## 组合提示
- 构建流程：`DocumentLoader` → `TextSplitter` → `Embeddings` → `VectorStore` → `as_retriever()` → LLM chain
- 与 LLM 组合用 `create_retrieval_chain` 或直接在 LangGraph node 里把 `retriever.invoke` 结果塞进 prompt
- 混合检索：向量 retriever + `BM25Retriever` 通过 `EnsembleRetriever` 组合，提升召回鲁棒性
- Agentic RAG：把 retriever 包成 `Tool`，交给 agent（如 LangGraph ReAct agent）自主调用
