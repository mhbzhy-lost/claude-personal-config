#!/usr/bin/env node
// Workflow: Code Health Review of claude-config repo
// 真实场景端到端测试：并发 + phase-seq + DAG + 插值 + needPrompt + IPC。
// 详细规范：docs/workflow/real-scenario-code-health-review.md
//
// 用法：
//   node scripts/workflow/code-health-review.mjs \
//        [--no-dashboard] [--skip-permissions] [--model <provider/model>]
//
// 依赖（仓内相对路径）：
//   ../../vendor/opencode-dynamic-workflow/lib/runner.mjs

import { createWorkflow, resolveWorkflowConfig } from "../../vendor/opencode-dynamic-workflow/lib/runner.mjs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")

// 一行：CLI 参数解析 + 安全默认值
const config = resolveWorkflowConfig(process.argv.slice(2), { workdir: join(REPO, ".workflow") })
const wf = await createWorkflow(config)

// ── DAG: 7 节点 / 4 层 ──
const results = await wf.dag([
  // Layer 1: 并发 3 路扫描
  {
    id: "scan-dead-refs",
    type: "general",
    deps: [],
    prompt:
      `扫描 ${REPO}/userconf, ${REPO}/shared, ${REPO}/templates, ${REPO}/docs ` +
      `下所有软链（symlink），逐条验证目标是否存在。` +
      `仅输出软链死链清单（每条：链接路径 → 缺失目标）。` +
      `如果无死链，输出 "OK: 未发现死链"。` +
      `不要写文件，不要修改任何代码。`
  },
  {
    id: "scan-todos",
    type: "general",
    deps: [],
    prompt:
      `在 ${REPO}/userconf/ 与 ${REPO}/shared/ 下 grep ` +
      `TODO / FIXME / XXX 注释（排除 node_modules、.workflow）。` +
      `**排除以下白名单路径**（业务关键词合理使用，属伪阳性）：` +
      `- shared/hooks/plan-tracker.py（正则与测试数据中合理包含 TODO 字面量）` +
      `- userconf/plugins/plan-tracker.js（错误提示模板中使用 TODO）` +
      `- shared/hooks/test_plan_tracker.py（测试 fixture 数据）` +
      `- userconf/plugins/test/plan-tracker.test.mjs（测试 fixture 数据）` +
      `每条输出：文件相对路径 + 行号 + 原文。` +
      `不要写文件。`
  },
  {
    id: "scan-perm",
    type: "general",
    deps: [],
    prompt:
      `读取 ${REPO}/userconf/permission.json，列出每条 permission 规则 ` +
      `（allow / deny / 工具 / 路径 / 模式）。` +
      `逐条标注"覆盖范围"：宽（允许通配或大范围工具集）、中（特定工具）、窄（精确路径）。` +
      `输出 JSON + 简要解释。`
  },

  // Layer 2: 综合
  {
    id: "synthesis",
    type: "general",
    deps: ["scan-dead-refs", "scan-todos", "scan-perm"],
    prompt:
      `综合以下 3 份扫描报告，输出分类风险矩阵。\n` +
      `每条发现标 **P0 / P1 / P2** 优先级，并在末尾附"条目计数"。\n` +
      `若某节点失败，用其 error 字段说明失败原因。\n\n` +
      `### dead-refs (status={{scan-dead-refs.status}})\n{{scan-dead-refs.output}}\n\n` +
      `### todos (status={{scan-todos.status}})\n{{scan-todos.output}}\n\n` +
      `### perm (status={{scan-perm.status}})\n{{scan-perm.output}}\n`
  },

  // Layer 2.5: needPrompt — 主 agent 注入优先级
  {
    id: "priority-decision",
    type: "general",
    deps: ["synthesis"],
    needsPrompt: true
  },

  // Layer 3: 并发 2 路推荐
  {
    id: "recommend-quickfix",
    type: "general",
    deps: ["synthesis", "priority-decision"],
    prompt:
      `基于 synthesis 报告：\n{{synthesis.output}}\n\n` +
      `和主 agent 优先决策：\n{{priority-decision.output}}\n\n` +
      `输出 **5 条可立刻执行** 的 Bash/Node 修复命令（P0 优先）。` +
      `每条包含：命令、理由、预期效果。`
  },
  {
    id: "recommend-sop",
    type: "general",
    deps: ["synthesis", "priority-decision"],
    prompt:
      `基于 synthesis 报告：\n{{synthesis.output}}\n\n` +
      `和主代理优先决策：\n{{priority-decision.output}}\n\n` +
      `输出 **3 个** 需要沉淀为长期 SOP 的主题（P1/P2 优先）。` +
      `每条：why + 建议落文档路径 + 责任人角色。`
  },

  // Layer 4: 最终报告
  {
    id: "final-report",
    type: "general",
    deps: ["synthesis", "recommend-quickfix", "recommend-sop"],
    prompt:
      `生成本次代码健康度评审的 Markdown 报告，**写入**：` +
      `${REPO}/docs/workflow/artifacts/code-health-<ISO-ts>.md` +
      `（<ISO-ts> 用实际执行时间替换）。\n` +
      `报告结构：\n` +
      `1. Executive Summary\n` +
      `2. 扫描发现（引用 {{synthesis.output}}）\n` +
      `3. 修复命令（引用 {{recommend-quickfix.output}}）\n` +
      `4. SOP 议题（引用 {{recommend-sop.output}}）\n` +
      `5. 错误回顾：若有节点失败，列出 {{recommend-quickfix.error}} ` +
      `与 {{recommend-sop.error}}\n` +
      `6. 节点状态（status 汇总）：` +
      `synthesis={{synthesis.status}} / ` +
      `recommend-quickfix={{recommend-quickfix.status}} / ` +
      `recommend-sop={{recommend-sop.status}}\n` +
      `最终输出报告文件路径。`
  }
])

wf.shutdown()

// 主 stdout 输出结构化结果（供主 agent 解析）
const ts = new Date().toISOString().replace(/[:.]/g, "-")
console.log(JSON.stringify({
  ok: true,
  scenario: "code-health-review",
  timestamp: ts,
  nodesCompleted: Object.keys(results).length,
  resultDir: join(REPO, ".workflow"),
  artifactsDir: join(REPO, "docs/workflow/artifacts"),
  nodeStatuses: Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, v.status])
  ),
}, null, 2))
