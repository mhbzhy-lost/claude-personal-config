---
name: langchain-chains
description: LangChain v1 Runnable 组合原语（RunnableParallel / RunnableBranch / LCEL 管道），用于构建并行、条件、顺序执行的链式工作流
tech_stack: [langchain]
language: [python]
capability: [agent-orchestration, llm-client]
version: "langchain 1.x"
collected_at: 2026-04-18
---

# LangChain Chains（Runnable 组合原语）

> 来源：https://docs.langchain.com/oss/python/langchain/agents ；https://reference.langchain.com/python/langchain_core/runnables/

## 用途
在 LangChain v1 中用 LCEL（LangChain Expression Language）组合 Runnable：顺序（`|`）、并行（`RunnableParallel`）、条件分支（`RunnableBranch`）构建声明式链。v1 中"传统 Chain"（LLMChain / SequentialChain 等）已迁入 `langchain-classic`，Runnable 组合是新范式。

## 何时使用
- 需要一次性并行执行多个 prompt/LLM 调用并聚合输出（`RunnableParallel`）
- 根据输入属性路由到不同子链（`RunnableBranch`）
- 将 prompt → model → parser 串成声明式管道
- 旧代码使用 `LLMChain` / `SequentialChain`，需迁移到 Runnable 风格或切换到 `langchain-classic`

## 基础用法

### 顺序组合（LCEL 管道）
```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain.chat_models import init_chat_model

prompt = ChatPromptTemplate.from_template("讲一个关于 {topic} 的笑话")
model = init_chat_model("openai:gpt-4.1-mini")
chain = prompt | model | StrOutputParser()
chain.invoke({"topic": "猫"})
```

### 并行执行
```python
from langchain_core.runnables import RunnableParallel

joke_chain = prompt_joke | model
poem_chain = prompt_poem | model

parallel = RunnableParallel(joke=joke_chain, poem=poem_chain)
# 也可用 dict 字面量： {"joke": joke_chain, "poem": poem_chain}
parallel.invoke({"topic": "熊"})
# => {"joke": AIMessage(...), "poem": AIMessage(...)}
```

三种构造方式等价：
1. `RunnableParallel({...})`
2. 在 `|` 管道中直接用 dict
3. `RunnableParallel(key1=r1, key2=r2)`

### 条件分支
```python
from langchain_core.runnables import RunnableBranch

branch = RunnableBranch(
    (lambda x: "数学" in x["topic"], math_chain),
    (lambda x: "编程" in x["topic"], code_chain),
    default_chain,  # 最后一个非元组项为 default
)
branch.invoke({"topic": "Python 编程问题"})
```
条件可以是 Runnable、同步 callable 或异步 callable，返回 bool。第一个命中的分支执行；全部不中则走 default。

## 关键 API
- `Runnable.__or__` / `|`：串联 Runnable 构成 Sequence
- `RunnableParallel(steps__=None, **kwargs)`：并行执行，输出 dict
- `RunnableBranch(*branches, default)`：条件路由
- 所有 Runnable 均支持 `invoke` / `ainvoke` / `stream` / `astream` / `batch` / `abatch` / `transform` / `atransform`
- `get_input_schema()`：推断输入 schema（Pydantic）
- `is_lc_serializable()`：序列化能力查询

## 注意事项
- **v1 迁移**：`LLMChain`、`ConversationChain`、`RetrievalQA`、`SequentialChain` 等传统 Chain 以及 retrievers / indexing API / hub / `langchain-community` 全部迁入 `langchain-classic`。若必须使用：`pip install langchain-classic` 并改为 `from langchain_classic.chains import ...`
- **优先 Runnable 组合而非传统 Chain**：v1 语义更清晰、支持流式和异步，是官方推荐路径
- Python 3.10+ 必需
- 消息 `.text()` 在 v1 中变为 property（不再是方法）
- 避免在不可信输入上使用 `jinja2` 模板（可能触发任意代码执行），优先 `f-string`

## 组合提示
- 与 `langchain-prompts-parsers`（ChatPromptTemplate / PydanticOutputParser）组成 prompt → model → parser 管道
- 需要工具调用 / 多轮推理时升级为 `create_agent`（见 `langchain-agents`）
- 需要对话记忆时配合 `RunnableWithMessageHistory` 或 checkpointer（见 `langchain-memory`）
