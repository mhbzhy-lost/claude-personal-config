---
name: langgraph-js
description: "LangGraph JS/TS API：Annotation 状态定义、MessagesAnnotation、图构建与执行、与 Python 版差异对照。"
tech_stack: [langgraph, backend]
language: [typescript]
---

# LangGraph JS/TS（JavaScript / TypeScript API）

> 版本：@langchain/langgraph 1.2.x | 来源：https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateGraph.html, https://docs.langchain.com/oss/javascript/langgraph/overview

## 用途

在 Node.js / Edge Runtime / 浏览器环境中使用 LangGraph 构建有状态、可持久化的 AI agent 图。

## 何时使用

- 项目技术栈为 TypeScript / JavaScript
- 需要与 Next.js、Express 等 JS 后端集成
- 已熟悉 Python 版 LangGraph，需要快速迁移到 JS/TS
- 需要在前端或 Edge Function 中运行轻量 agent

---

## 安装

```bash
npm install @langchain/langgraph @langchain/core

# 配合具体 LLM 提供者
npm install @langchain/openai
# 或
npm install @langchain/anthropic
```

---

## 核心导入

```typescript
import {
  StateGraph,
  START,
  END,
  MessagesAnnotation,
  Annotation,
} from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
```

---

## 状态定义 -- Annotation API

Annotation API 是 JS/TS 定义状态的唯一方式，对应 Python 中的 `TypedDict + Annotated`。

### 自定义状态

```typescript
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { messagesStateReducer } from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  // 消息列表，使用内置 reducer（等同 Python 的 add_messages）
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // 简单覆盖：新值直接替换旧值
  currentStep: Annotation<string>({
    reducer: (_, newVal) => newVal,
    default: () => "",
  }),
  // 追加模式：新数组拼接到旧数组后
  results: Annotation<string[]>({
    reducer: (existing, newVal) => [...existing, ...newVal],
    default: () => [],
  }),
});
```

### 预置 MessagesAnnotation

```typescript
import { MessagesAnnotation } from "@langchain/langgraph";
// 等同于只有 messages 字段的状态，开箱即用
// 内部已配置 messagesStateReducer
```

### Annotation 要点

- 每个字段必须提供 `reducer` 函数，定义多次更新如何合并。
- `default` 提供初始值工厂函数。
- `messagesStateReducer` 提供与 Python `add_messages` 相同的去重逻辑（按 message ID 合并）。

---

## 构建图

```typescript
const graph = new StateGraph(StateAnnotation)
  .addNode("chatbot", chatbotNode)
  .addNode("tools", toolNode)
  .addEdge(START, "chatbot")
  .addConditionalEdges("chatbot", routeFunction)
  .addEdge("tools", "chatbot");

const app = graph.compile({
  checkpointer: new MemorySaver(), // 开发用内存持久化
});
```

---

## 节点函数

```typescript
// 节点函数接收状态，返回部分更新
async function chatbotNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}
```

- 使用 `typeof StateAnnotation.State` 获取类型推导。
- 返回 `Partial<...>` -- 只需返回要更新的字段。
- 节点函数通常为 `async`。

---

## 执行

### invoke

```typescript
const config = { configurable: { thread_id: "my-thread" } };

const result = await app.invoke(
  { messages: [{ role: "user", content: "hello" }] },
  config
);
console.log(result.messages.at(-1)?.content);
```

### stream

```typescript
for await (const chunk of await app.stream(
  { messages: [{ role: "user", content: "hello" }] },
  { ...config, streamMode: "updates" }
)) {
  console.log(chunk);
}
```

### streamMode 选项

| 值 | 说明 |
|---|---|
| `"values"` | 每步输出完整状态 |
| `"updates"` | 每步输出增量更新 |
| `"messages"` | 流式输出 LLM token |
| `"debug"` | 最详细的调试信息 |

---

## addSequence -- 顺序链接多节点

JS 版独有的便捷方法，快速构建线性流水线：

```typescript
graph.addSequence([
  { name: "step1", fn: step1Fn },
  { name: "step2", fn: step2Fn },
  { name: "step3", fn: step3Fn },
]);
// 等价于：
// graph.addNode("step1", step1Fn)
// graph.addNode("step2", step2Fn)
// graph.addNode("step3", step3Fn)
// graph.addEdge("step1", "step2")
// graph.addEdge("step2", "step3")
```

Python 版无此方法。

---

## Prebuilt Agent

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const agent = createReactAgent({
  llm,
  tools: [searchTool, calcTool],
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "What is 2+2?" }],
});
```

---

## Python vs JS/TS 差异对照

| 概念 | Python | JS/TS |
|------|--------|-------|
| 状态定义 | `TypedDict + Annotated` | `Annotation.Root({})` |
| 消息 reducer | `add_messages` | `messagesStateReducer` |
| 预置消息状态 | `MessagesState` | `MessagesAnnotation` |
| Checkpointer | `InMemorySaver` from `langgraph.checkpoint.memory` | `MemorySaver` from `@langchain/langgraph` |
| 函数式 API | `@entrypoint` / `@task` | **不支持** |
| addSequence | 不支持 | 支持 |
| stream 参数 | `stream_mode="updates"` | `streamMode: "updates"` (camelCase) |
| 包名 | `langgraph` | `@langchain/langgraph` |
| RetryPolicy | `langgraph.types.RetryPolicy` | 尚无对等 API |
| CachePolicy | `langgraph.types.CachePolicy` | 尚无对等 API |
| Store | `BaseStore` keyword arg | 类似，但生态不如 Python 丰富 |

---

## 完整最小示例

```typescript
import { StateGraph, START, END, MessagesAnnotation } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({ model: "gpt-4o" });

async function chatbot(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("chatbot", chatbot)
  .addEdge(START, "chatbot")
  .addEdge("chatbot", END);

const app = graph.compile({ checkpointer: new MemorySaver() });

// 使用
const result = await app.invoke(
  { messages: [{ role: "user", content: "Hi there!" }] },
  { configurable: { thread_id: "demo" } }
);

console.log(result.messages.at(-1)?.content);
```

---

## 注意事项

- **Annotation API 是唯一方式**：JS/TS 没有 TypedDict 等价物，必须用 `Annotation.Root`。
- **命名风格**：JS 版全部使用 camelCase（`streamMode`、`addConditionalEdges` 等）。
- **函数式 API 不可用**：Python 的 `@entrypoint` / `@task` 在 JS 版中不支持。
- **MemorySaver 仅限开发**：生产环境需要使用持久化 checkpointer（如数据库后端）。
- **`messagesStateReducer` 去重逻辑**：按 message ID 匹配，ID 相同则更新而非追加，与 Python 的 `add_messages` 行为一致。
- **checkpointer 生态**：JS 版不如 Python 丰富，生产部署前需确认可用的持久化方案。
