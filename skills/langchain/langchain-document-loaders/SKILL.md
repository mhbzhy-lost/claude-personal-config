---
name: langchain-document-loaders
description: LangChain 文档加载器——用统一接口把 PDF、网页、云盘、CSV 等外部数据导入为 Document 对象，供 RAG / 向量检索使用
tech_stack: [langchain, backend]
language: [python]
capability: [rag]
version: "langchain-core unversioned"
collected_at: 2026-04-18
---

# LangChain Document Loaders（文档加载器）

> 来源：
> - https://docs.langchain.com/oss/python/integrations/document_loaders
> - https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/document_loaders/base.py
> - https://docs.langchain.com/oss/python/langchain/knowledge-base

## 用途

提供统一的 `BaseLoader` 抽象，把各种来源（本地文件、网页、云存储、SaaS API）的原始数据转换为带 metadata 的 `Document` 列表，作为 RAG / 语义搜索管线的数据入口。官方生态含 200+ 集成加载器。

## 何时使用

- 构建 RAG / 知识库：把 PDF / 网页 / Notion / GitHub 等内容喂给向量库
- 语义搜索引擎：配合 text splitter + embeddings + vector store 使用
- 批量 / 流式导入大规模文档时（使用 `lazy_load` / `alazy_load` 避免 OOM）
- 需要在不同来源间切换而保持上层代码不变（统一接口）

## 基础用法

```python
from langchain_community.document_loaders.csv_loader import CSVLoader

loader = CSVLoader(file_path="data.csv")

# 一次性全量加载
documents = loader.load()

# 大数据集用惰性加载（generator，逐条产出）
for document in loader.lazy_load():
    process(document)
```

PDF + 语义检索的最小管线：

```python
# pip install langchain-community pypdf langchain-text-splitters
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

docs = PyPDFLoader("report.pdf").load()
chunks = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=200
).split_documents(docs)
# chunks -> embeddings -> vector store -> retriever
```

## 关键 API（摘要）

`BaseLoader`（所有 loader 的基类）：

- `load() -> list[Document]`：全量加载；**子类不要重写**，默认就是 `list(self.lazy_load())`
- `lazy_load() -> Iterator[Document]`：**子类应实现此方法**，基于 generator，避免一次性占用全部内存
- `aload() -> list[Document]`：异步全量
- `alazy_load() -> AsyncIterator[Document]`：异步惰性流；默认用线程池包装同步 `lazy_load`
- `load_and_split(text_splitter=None)`：**已废弃**，不要重写；未传 splitter 时默认 `RecursiveCharacterTextSplitter`

`BaseBlobParser`（从 Blob 解析出 Document，可与 blob loader 组合复用）：

- `lazy_parse(blob) -> Iterator[Document]`：**抽象方法，必须实现**
- `parse(blob) -> list[Document]`：便利方法（面向交互式开发），生产代码用 `lazy_parse`

## 常见 loader 分类

| 场景 | 代表实现 |
|------|----------|
| 网页 | WebBaseLoader、RecursiveURL、Sitemap、Firecrawl、Docling |
| PDF | PyPDFLoader、PyMuPDF、PDFPlumber、Unstructured、Amazon Textract、MathPix |
| 云存储 | S3、Azure Blob、GCS、Google Drive、Dropbox、OneDrive、SharePoint |
| 生产力工具 | Notion、Slack、GitHub、Figma、Trello、Quip |
| 社交 / IM | Twitter、Reddit、Telegram、WhatsApp、Discord |
| 通用文件 | CSV、JSON、HTML、Unstructured、Docling |

## 注意事项

- **优先实现 `lazy_load` 而非 `load`**：官方注释明确 `load` 未来不会改，而 `lazy_load` 将升级为 `abstractmethod`。自定义 loader 子类重写 `lazy_load` 即可，`load` 会自动生效
- **`load_and_split` 已标记 deprecated**（源码 `!!! danger`）：应自己显式调用 text splitter 的 `split_documents`，便于解耦与自定义
- **缺少 `langchain-text-splitters`** 时调用 `load_and_split()` 不传 splitter 会抛 `ImportError`，建议 `pip install -U langchain-text-splitters`
- **`BaseBlobParser.parse`** 仅为交互便利，生产路径用 `lazy_parse` 保持流式
- **`alazy_load` 默认实现**是把同步 `lazy_load` 丢到线程池，I/O 密集型 loader 建议自己原生实现异步版本以获得真正并发
- 大多数具体 loader 位于 `langchain_community.document_loaders.*` 或独立包（如 `langchain-google-community`、`langchain-unstructured`），核心基类在 `langchain_core.document_loaders`

## 组合提示

典型 RAG 管线：`DocumentLoader` → `TextSplitter`（如 `RecursiveCharacterTextSplitter`，chunk_size≈1000 / overlap≈200）→ `Embeddings`（OpenAI / HuggingFace / Google）→ `VectorStore`（Chroma / FAISS / PGVector）→ `Retriever`（支持 similarity / MMR / score threshold）→ Chain / Agent。
