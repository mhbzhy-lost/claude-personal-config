---
name: knowledge-retrieval
description: 两步检索 mcp__skill-catalog → resolve 拿候选 + get_skill 取正文；命中 executable_sandbox 类 skill 时改走 bash runner.sh。
---

# What

按 `tech_stack / language / capability` 标签调 `mcp__skill-catalog__resolve` 拿候选名 + 描述，再用 `get_skill` 按需取正文。命中 `execution_mode: executable_sandbox` 的工具型 skill 时**不读正文**，改 `bash <skill>/runner.sh <args>` 执行。

# When to Use

任务涉及特定框架 / 组件 / 技术域时（如 react / httpx / claude-code hook / playwright 截图）。纯逻辑、纯文档、纯配置工作不调。

# How

## 1. 选标签

从用户 prompt + 工作目录推断 `tech_stack` / `language` / `capability`，**值必须从 `<skills_base>/_tag_catalog.json` 闭集中选**，不得自造。三者至少一个非空。

不确定库里有哪些合法 tag → 调 `mcp__skill-catalog__available_tags`（`{}`）拿三维度排序去重列表。

筛选原则：

- 宁缺毋滥，只选明显相关的 tag
- `language` 对 skill 做硬过滤（排除 language-agnostic skill），仅在上下文有强语言信号时填

## 2. 调 resolve

```json
{
  "user_prompt": "<任务核心描述>",
  "cwd": "<当前工作目录>",
  "tech_stack": ["<闭集>"],
  "language": ["<闭集，可选>"],
  "capability": ["<闭集>"]
}
```

返回 `skills: [{name, description, execution_mode?}]`，按相关度排序，**不含正文**。

三者均空 → 不调（PreToolUse hook 强制；传空数组会被 block），走 [跳过路径](#跳过检索)。

## 3. 筛 1–3 条候选

按 `description` 判断是否直接相关，不无差别全取。列表顺序只作参考。

## 4. 命中类型分流

| 候选 | 动作 |
|---|---|
| 普通（无 `execution_mode` 或 = `knowledge`）| `mcp__skill-catalog__get_skill` 取 markdown 正文当上下文知识 |
| `execution_mode: executable_sandbox` | **不取正文**，改 `bash <skills_base>/<tech>/<skill>/runner.sh <args>` |

## 5. executable_sandbox 调用约定

`runner.sh` 是统一入口：

- 容器 `claude-skill-sandbox` 懒创建（首次 10–30s）
- 工具懒装入 install.sh（首次 30–120s）
- 二次调用幂等（< 2s）
- `$PWD` 在 `$HOME` 内 → bind-mount 直读；否则 docker cp 兜底
- 宿主机 HTTP proxy 透传（127.0.0.1 → host.docker.internal）

**不要绕开 runner.sh 直接 `bash install.sh` 或 `run-impl.sh`** —— 丢容器/路径/proxy 包装。

参数以 SKILL.md `## Basic Usage` 为准；管理命令：

```bash
bin/claude-skill-sandbox status        # 容器状态 + drift 警告
bin/claude-skill-sandbox shell         # 进容器调试
bin/claude-skill-sandbox validate <s>  # 重跑 4 关验证
bin/claude-skill-sandbox reset         # 推倒 sandbox 容器+volume
```

前置：docker daemon 可达（`init_claude.sh` 已加 preflight）。

# Special Cases

## 跳过检索

任务与任何 tech_stack / capability 均无合法匹配 → 不调 resolve，首次输出明示：

> 本次任务不涉及框架或组件知识，无需检索技能库。

**禁止**传空数组调 resolve 作为跳过手段。

## get_skill 内容不足

1. 候选列表挑下一条 get
2. 以不同 tag 组合再调一次 resolve
3. 结合上下文与现有知识判断

## 无匹配

resolve 返回空 / 候选全不相关 → 直接动手，首次输出明示无需检索。

# Constraints

- `tech_stack` / `language` / `capability` 至少一个非空
- 禁止调 `mcp__skill-catalog__list_skills` 获取全量清单
- 跳过检索必须在输出中明示
- executable_sandbox 类 skill 不读正文，必须走 runner.sh

> SubagentStart hook 注入 coding-expert 子 agent 时会附当前合法 tag 闭集，此时步骤 1 可跳过。
>
> 深度细节（4 关验证 / agentic loop / 已知 caveat）见 `${CLAUDE_CONFIG_HOME}/distill/README.md`。
