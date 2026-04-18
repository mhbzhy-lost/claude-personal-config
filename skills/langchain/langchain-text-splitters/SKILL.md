---
name: langchain-text-splitters
description: LangChain 文本分块工具包，用于将长文档切分为适配模型上下文的语义 chunk
tech_stack: [langchain, backend]
language: [python]
capability: [rag]
version: "langchain-text-splitters unversioned"
collected_at: 2026-04-18
---

# langchain-text-splitters（文本分块工具）

> 来源：https://docs.langchain.com/oss/python/integrations/splitters
> 参考：https://reference.langchain.com/python/langchain-text-splitters

## 用途

把大文档切成小块（chunk），以适配 LLM 上下文窗口、支撑 RAG 检索与 embedding。提供多种切分策略，针对不同文档结构（纯文本 / Markdown / HTML / JSON / 代码）选择最佳保语义方案。

## 何时使用

- RAG 管道中对 loader 产出的 `Document` 做切分，再灌入 vectorstore
- 长文本需要在 token 预算内分段摘要 / 抽取
- 对结构化文档（Markdown/HTML/代码）希望沿结构边界切分以保留语义
- 需要基于 tokenizer（tiktoken / HuggingFace）精确控制 token 长度

## 安装

```bash
pip install -U langchain-text-splitters
# 或
uv add langchain-text-splitters
```

## 基础用法

### 默认首选：RecursiveCharacterTextSplitter

按 `["\n\n", "\n", " ", ""]` 递归切分，优先保留段落 → 句子 → 单词层级。文档明确推荐作为**默认选择**。

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
chunks = splitter.split_text(long_text)
# 或对 Document 列表：
docs = splitter.create_documents([long_text], metadatas=[{"source": "a.txt"}])
docs = splitter.split_documents(raw_docs)
```

### Token 预算切分（tiktoken）

```python
from langchain_text_splitters import CharacterTextSplitter

splitter = CharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base", chunk_size=500, chunk_overlap=50
)
chunks = splitter.split_text(text)
```

### Markdown 按标题切分

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter

splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "H1"), ("##", "H2"), ("###", "H3")]
)
docs = splitter.split_text(md_text)  # 每块 metadata 带层级标题
```

## 三种切分策略

| 策略 | 代表类 | 适用场景 |
|------|--------|----------|
| **Text Structure-Based** | `RecursiveCharacterTextSplitter` | 通用默认，平衡上下文与 chunk 大小 |
| **Length-Based** | `CharacterTextSplitter`、`TokenTextSplitter`、`SentenceTransformersTokenTextSplitter` | 严格 token/字符预算控制 |
| **Document Structure-Based** | `MarkdownHeaderTextSplitter`、`HTMLHeaderTextSplitter`、`RecursiveJsonSplitter`、`PythonCodeTextSplitter` | 按文档原生结构保留语义边界 |

## 关键类（摘要）

**基类与通用：**
- `TextSplitter`：所有基于字符长度切分器的抽象基类
- `RecursiveCharacterTextSplitter`：递归按分隔符切分，**推荐默认**
- `CharacterTextSplitter`：单一分隔符切分
- `TokenTextSplitter` / `split_text_on_tokens`：按 token 切分
- `Language`：枚举，`RecursiveCharacterTextSplitter.from_language(Language.PYTHON, ...)` 按语言选择分隔符

**标记语言：**
- `MarkdownHeaderTextSplitter`：按 `#` 层级切，块 metadata 携带标题路径
- `ExperimentalMarkdownSyntaxTextSplitter`：更完整的 Markdown 语法感知
- `MarkdownTextSplitter` / `LatexTextSplitter`：按 Markdown/LaTeX 分隔符的字符切分
- `HTMLHeaderTextSplitter` / `HTMLSectionSplitter` / `HTMLSemanticPreservingSplitter`
- `RecursiveJsonSplitter`：按 JSON 对象层级切

**代码 / 框架：**
- `PythonCodeTextSplitter`
- `JSFrameworkTextSplitter`（JSX 等）

**NLP 分句：**
- `NLTKTextSplitter`、`SpacyTextSplitter`、`KonlpyTextSplitter`（韩语）
- `SentenceTransformersTokenTextSplitter`：按 sentence-transformers tokenizer 切

**工具类：** `ElementType`、`LineType`、`HeaderType`、`Tokenizer`

## 常用参数

- `chunk_size`：单块目标大小（字符数或 token 数，取决于切分器）
- `chunk_overlap`：相邻块重叠量，保持跨块上下文连续性（常设为 `chunk_size` 的 10-20%）
- `separators`（Recursive 专属）：优先级从大到小的分隔符列表
- `length_function`：默认 `len`，可换成 tokenizer 计数函数
- `add_start_index=True`：在 metadata 中记录块在原文中的起始偏移

## 注意事项

- `MarkdownHeaderTextSplitter` 与 `HTMLHeaderTextSplitter` **不继承** `TextSplitter`，API 行为与其他 splitter 不完全一致（不接受 `chunk_size`，直接按结构切）
- 常用组合：先用 `MarkdownHeaderTextSplitter` 按标题粗切 → 再用 `RecursiveCharacterTextSplitter` 对每块做二次长度切分
- 官方建议**固定依赖版本**，否则新版本新增的测试可能破坏 CI；定期手动升级
- Token-based splitter 需要额外装依赖：`tiktoken`（`from_tiktoken_encoder`）、`sentence-transformers`、`nltk`、`spacy`、`konlpy`
- `chunk_overlap >= chunk_size` 会死循环/报错，务必保证 overlap 明显小于 size

## 组合提示

- 与 `langchain-community` 的 Document Loaders 配合：loader → splitter → embeddings → vectorstore
- 与 LCEL / LangGraph RAG 子图搭配，作为 ingestion 阶段的标准一环
- 切完的 `Document.metadata` 会自动继承上游 loader 的 source/页码等字段，便于检索后溯源
