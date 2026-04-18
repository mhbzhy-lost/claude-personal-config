---
name: langchain-prompts-parsers
description: LangChain 提示词模板（ChatPromptTemplate / PromptTemplate / FewShotChatMessagePromptTemplate）与输出解析器（PydanticOutputParser）
tech_stack: [langchain]
language: [python]
capability: [prompt-engineering]
version: "langchain-core unversioned"
collected_at: 2026-04-18
---

# LangChain Prompts & Output Parsers

> 来源：https://reference.langchain.com/python/langchain_core/prompts/ ；/output_parsers/pydantic/PydanticOutputParser

## 用途
构建结构化 prompt 并解析 LLM 输出：
- `PromptTemplate`：单轮 completion 风格，f-string/jinja2/mustache 模板
- `ChatPromptTemplate`：多轮 chat 消息模板，支持 system/user/assistant 与 MessagesPlaceholder
- `FewShotChatMessagePromptTemplate`：在 chat 中注入固定或动态选择的 few-shot 示例
- `PydanticOutputParser`：JSON 解析 + Pydantic schema 校验，把 LLM 输出变成强类型对象

## 何时使用
- 简单单变量填充 → `PromptTemplate`
- 多角色消息 / 需要注入历史 → `ChatPromptTemplate`
- 任务依赖示例（风格模仿、分类样例）→ `FewShotChatMessagePromptTemplate`
- 需要 LLM 产出可校验的结构化对象 → `PydanticOutputParser`

## 基础用法

### PromptTemplate
```python
from langchain_core.prompts import PromptTemplate

prompt = PromptTemplate.from_template("Say {foo}")
prompt.format(foo="bar")  # "Say bar"
```

### ChatPromptTemplate
```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a {role}."),
    MessagesPlaceholder("history"),
    ("human", "{question}"),
])
messages = chat_prompt.format_messages(
    role="helpful assistant",
    history=[...],
    question="What is 2+2?",
)
```

### FewShotChatMessagePromptTemplate
```python
from langchain_core.prompts import (
    ChatPromptTemplate, FewShotChatMessagePromptTemplate,
)

example_prompt = ChatPromptTemplate.from_messages([
    ("human", "{input}"),
    ("ai", "{output}"),
])
few_shot = FewShotChatMessagePromptTemplate(
    example_prompt=example_prompt,
    examples=[{"input": "2+2", "output": "4"}, {"input": "3+3", "output": "6"}],
)
final = ChatPromptTemplate.from_messages([
    ("system", "You are a math tutor."),
    few_shot,
    ("human", "{question}"),
])
```

### PydanticOutputParser
```python
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import PromptTemplate

class Joke(BaseModel):
    setup: str = Field(description="铺垫")
    punchline: str = Field(description="抖包袱")

parser = PydanticOutputParser(pydantic_object=Joke)
prompt = PromptTemplate(
    template="讲一个笑话。\n{format_instructions}\n主题: {topic}\n",
    input_variables=["topic"],
    partial_variables={"format_instructions": parser.get_format_instructions()},
)

chain = prompt | model | parser
chain.invoke({"topic": "猫"})  # -> Joke(setup=..., punchline=...)
```

## 关键 API
- `PromptTemplate.from_template(tmpl)` / `.format(**kwargs)` / `.from_file(path)`
- `ChatPromptTemplate.from_messages([...])` / `.from_template(...)` / `.format_messages(**kwargs)` / `.partial(...)`
- 消息格式：`(role, template)` 元组、`BaseMessage`、`BaseMessagePromptTemplate`、`MessagesPlaceholder("key")`
- `FewShotChatMessagePromptTemplate(example_prompt=..., examples=[...])` 或配合 `ExampleSelector` 动态选择
- `PydanticOutputParser(pydantic_object=YourModel)`：`.parse(text)` / `.get_format_instructions()` / `.parse_result(...)`
- 所有 prompt 均为 Runnable，可直接 `|` 拼接进 LCEL 管道

## 注意事项
- **优先 f-string，避免 jinja2**：`template_format='jinja2'` 在不可信输入下可触发任意 Python 执行；即便有沙箱也不安全
- `PromptTemplate` 单变量时可直接传值而非 dict，如 `prompt.invoke("bar")`
- `MessagesPlaceholder` 是注入历史消息列表的唯一推荐方式（别把 message list 塞进字符串变量）
- `FewShotChatMessagePromptTemplate` 动态模式需搭配 `ExampleSelector`（语义相似度选择）
- `PydanticOutputParser` 继承自 `JsonOutputParser`——先解析 JSON 再 Pydantic 校验，LLM 输出不是合法 JSON 会抛异常，考虑配合 `OutputFixingParser` / `RetryOutputParser`
- Prompt 在 LCEL 管道中一般放最前：`prompt | model | parser`
- 字符串输出用 `StrOutputParser`；若需要 agent 风格的 schema 输出，直接用 `create_agent(response_format=ToolStrategy(...))` 而非手工 PydanticOutputParser

## 组合提示
- 经典 RAG / QA 管道：`ChatPromptTemplate | model | StrOutputParser`（见 `langchain-chains`）
- 结构化任务：`prompt_with_format_instructions | model | PydanticOutputParser`
- Agent 场景优先走 `create_agent` + `response_format=ToolStrategy(...)`（见 `langchain-agents`）
