# Knowledge Update Guide

本指南用于帮助 agent 在提交代码前判断：这次变更是否需要更新项目知识文档。

知识文档不是变更日志，也不是复述代码。它只记录会影响未来工程判断的稳定信息：下一个 agent 读完后，应当能更快知道该怎么改、怎么测、哪里容易出错。

## 提交前必须判断

在 `git commit` 前，先查看 staged diff，并回答：

> 这次变更是否改变了未来 agent 需要知道的项目事实、约定、流程、风险或验证方式？

如果答案是“是”，必须更新 `docs/knowledge/` 下的相关文档。

如果答案是“否”，按提交 hook 的提示处理；本文档不定义提交放行方式。

## 知识库入口必须接入 agent 指令

`docs/knowledge/` 不能只作为普通文档目录存在。项目必须在 agent 启动时会自动读取的入口文件里显式链接知识库，否则新会话不会自然感知它的存在。

推荐规则：

- 仓库根目录维护 `AGENTS.md`，作为 Codex、OpenCode 和其他支持 AGENTS 约定的 agent 的公共入口。
- Claude Code 需要仓库根目录 `CLAUDE.md` 或 `.claude/CLAUDE.md`。如果项目已经有 `AGENTS.md`，`CLAUDE.md` 应导入或链接到它，避免两份规则漂移。
- OpenCode 优先读取项目 `AGENTS.md`。如果同时存在 `AGENTS.md` 和 `CLAUDE.md`，不要依赖 OpenCode 的 Claude fallback；必须确保 `AGENTS.md` 自身包含知识库入口。
- 如果项目使用 `opencode.json` 的 `instructions` 字段管理规则，也应把 `docs/knowledge/README.md` 或一个包含该入口的规则文件加入 instructions，而不是只放在普通 docs 目录里。

`AGENTS.md` 中建议保留一个短入口，不要复制整份知识库：

```markdown
## Project Knowledge

Before coding, debugging, planning, or reviewing, check whether the task touches
durable project knowledge.

- Knowledge guide: `docs/knowledge/README.md`
- Knowledge index: `docs/knowledge/INDEX.md`
- Project map: `docs/knowledge/project-map.md`

When a change affects architecture, contracts, workflows, testing strategy,
integrations, or recurring pitfalls, update `docs/knowledge/` before committing.
If no knowledge update is needed, follow the commit hook instructions.
```

`CLAUDE.md` 建议只做导入和 Claude 专属补充：

```markdown
@AGENTS.md

## Claude Code

Follow the shared project knowledge rules in `AGENTS.md`.
```

如果不能使用导入语法或 symlink，至少在 `CLAUDE.md` 中保留同样的 `Project Knowledge` 短入口。不要把知识库规则复制成两套完整正文。

## 需要更新知识文档的情况

出现以下任一情况，应更新知识文档：

- 改变了模块职责、架构边界、数据流或调用链
- 新增或修改了对外 API、内部契约、数据结构、配置项、环境变量
- 改变了构建、测试、发布、部署、本地开发流程
- 新增了项目约定，例如错误处理、命名、目录组织、测试写法
- 修复了非显然 bug，尤其是未来可能再次踩到的坑
- 接入、替换或升级了第三方服务、SDK、协议、数据库、队列、中间件
- 发现了稳定的排错路径、调试方法或验证命令
- 代码中的隐含知识变成了多人或多 agent 都需要遵守的规则

## 不需要更新的情况

以下情况通常不需要更新知识文档：

- 纯格式化、拼写、文案、注释调整
- 局部变量名、函数名、文件名的小范围重命名，且不改变职责
- 已有知识文档准确覆盖本次变化
- 生成文件、锁文件、快照文件的机械变化
- 一次性实现细节，不影响未来修改方式
- 删除死代码，且没有改变对外行为或项目约定

如果不确定，优先更新一条短知识。知识文档可以短，但不能含糊。

## 写作原则

知识文档面向未来 agent，而不是面向历史审计。

应该写：

- 现在项目中什么是真的
- 什么时候这条知识适用
- 下次修改时应该怎么做
- 哪些做法应该避免
- 如何验证没有破坏相关路径

不要写：

- “我这次改了什么”的流水账
- 已经能从代码直接看出的实现细节
- 没有行动价值的背景描述
- 没有适用范围的宽泛原则
- 过期、不确定、未经验证的猜测

## 推荐文档结构

每篇知识文档建议使用以下结构：

```markdown
---
title: 简短标题
kind: architecture | convention | decision | integration | pitfall
status: active
applies_to:
  - path/or/module
last_verified: YYYY-MM-DD
source: commit / issue / incident / manual
---

# 一句话结论

直接说明未来 agent 应该知道什么。

## 适用场景

什么情况下需要读这篇文档。

## 项目事实 / 约定

记录稳定事实、规则或约束。

## 原因

说明为什么这样设计，避免未来重复争论。

## 修改时注意

列出相关文件、影响路径、容易踩的坑。

## 验证方式

列出推荐测试命令、检查点或人工验证方式。

## 相关资料

链接到代码、issue、PR、外部文档或其他知识文档。
```

## 内容质量标准

一条合格的知识应满足：

- 可检索：标题、关键词、路径名清晰
- 可执行：读完知道该怎么做
- 有边界：说明适用和不适用场景
- 可验证：包含测试、命令或检查方式
- 不重复：优先更新已有文档，避免散落多份相同知识
- 不过度：只沉淀长期有效的信息

## 好坏示例

不推荐：

```markdown
修复了 auth 测试失败。
```

推荐：

```markdown
修改 session shape 时，必须同时检查 API 层的 `/me` 返回值。

`src/auth/session.ts` 的 session 字段会被 `src/api/me.ts` 直接读取。
如果新增、删除或重命名 session 字段，需要同时更新：
- session 单测
- `/me` API 契约测试
- 前端当前用户信息解析逻辑

验证命令：
`npm test -- session me`
```

不推荐：

```markdown
项目使用 Redis。
```

推荐：

```markdown
业务代码不要直接访问 Redis client。

用户 session 必须通过 `SessionStore` 读写。测试环境会替换为 in-memory store，
直接调用 Redis client 会绕过测试隔离，并导致本地测试依赖外部服务。
```

## 推荐目录

```text
docs/knowledge/
  README.md
  INDEX.md
  project-map.md
  architecture/
  conventions/
  decisions/
  integrations/
  pitfalls/
```

目录用途：

- `project-map.md`：项目入口、模块职责、主要调用链
- `architecture/`：架构边界、数据流、跨模块设计
- `conventions/`：编码、测试、错误处理、命名等长期约定
- `decisions/`：重要技术决策及原因
- `integrations/`：第三方服务、SDK、外部系统
- `pitfalls/`：已踩过且未来可能复现的问题

## 维护规则

更新知识文档时，优先修改已有文档；只有已有文档没有合适位置时，才新增文档。

如果发现旧知识已过期，应同时更新 `status`、`last_verified` 和正文，不要留下互相矛盾的规则。

如果知识来自一次 bugfix，应链接对应 bug 分析、测试或提交，确保未来 agent 能追溯原因。
