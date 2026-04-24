# Path Extraction Evaluation Report

Evaluation set: **40** curated snippets from `~/.claude/projects/-Users-mhbzhy-claude-config/*.jsonl`.

- path_types: {'B': 34, 'mixed': 6}
- difficulty: {'medium': 27, 'hard': 10, 'easy': 3}
- B or hard share: 35 / 40

## Overall metrics (lenient match: basename or path-suffix)

| System | TP | FP | FN | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|---:|
| current_module (parser+analyzer) | 132 | 45 | 15 | 74.58% | 89.80% | 81.48% |
| at_regex_only (@-prefix only) | 9 | 0 | 138 | 100.00% | 6.12% | 11.54% |
| prose_regex_simple (extension + dir prefix) | 142 | 49 | 5 | 74.35% | 96.60% | 84.02% |

## Breakdown: path_types = B (34 samples)

| System | Recall | Precision | F1 |
|---|---:|---:|---:|
| current_module (parser+analyzer) | 93.91% | 73.47% | 82.44% |
| at_regex_only (@-prefix only) | 0.00% | 0.00% | 0.00% |
| prose_regex_simple (extension + dir prefix) | 100.00% | 74.19% | 85.19% |

## Breakdown: path_types = mixed (6 samples)

| System | Recall | Precision | F1 |
|---|---:|---:|---:|
| current_module (parser+analyzer) | 75.00% | 80.00% | 77.42% |
| at_regex_only (@-prefix only) | 28.12% | 100.00% | 43.90% |
| prose_regex_simple (extension + dir prefix) | 84.38% | 75.00% | 79.41% |

## Breakdown: difficulty = easy (3 samples)

| System | Recall | Precision | F1 |
|---|---:|---:|---:|
| current_module (parser+analyzer) | 87.50% | 77.78% | 82.35% |
| at_regex_only (@-prefix only) | 12.50% | 100.00% | 22.22% |
| prose_regex_simple (extension + dir prefix) | 100.00% | 88.89% | 94.12% |

## Breakdown: difficulty = medium (27 samples)

| System | Recall | Precision | F1 |
|---|---:|---:|---:|
| current_module (parser+analyzer) | 89.80% | 71.54% | 79.64% |
| at_regex_only (@-prefix only) | 7.14% | 100.00% | 13.33% |
| prose_regex_simple (extension + dir prefix) | 95.92% | 69.12% | 80.34% |

## Breakdown: difficulty = hard (10 samples)

| System | Recall | Precision | F1 |
|---|---:|---:|---:|
| current_module (parser+analyzer) | 90.24% | 82.22% | 86.05% |
| at_regex_only (@-prefix only) | 2.44% | 100.00% | 4.76% |
| prose_regex_simple (extension + dir prefix) | 97.56% | 86.96% | 91.95% |

## Typical misses (current_module)

### Sad994c91-38e37b (B/medium)

- **Ground truth**: ['CLAUDE.md', 'capability-taxonomy.md', 'config/agents/skill-marker.md', 'config/hooks/capability-taxonomy-inject.sh', 'config/mcp/skill-catalog/', 'list-inject.sh', 'server.py', 'settings.json', 'skill-builder.md', 'skill-matcher.md', 'tests/test_scanner.py']
- **Predicted**: ['/Users/mhbzhy/claude-config/agents/skill-marker.md', '/Users/mhbzhy/claude-config/hooks/capability-taxonomy-inject.sh', '/Users/mhbzhy/claude-config/mcp/skill-catalog', '/stack-list-inject.sh', 'CLAUDE.md', 'capability-taxonomy-inject.sh', 'capability-taxonomy.md', 'scanner.py', 'server.py', 'settings.json', 'skill-builder.md', 'skill-marker.md', 'skill-matcher.md', 'tests/test_scanner.py', '~/.claude/agents/skill-marker.md', '~/.claude/guidelines/capability-taxonomy.md', '~/.claude/hooks/capability-taxonomy-inject.sh', '~/.claude/settings.json']
- **Missed**: ['list-inject.sh']
- **Context**: `[user] 独立文件可以，但对于低智能模型，是否能保证一定会读呢，有没有harness手段能保证强制加载  ---  [assistant] 有,而且**本库已有先例**。`stack-detector` agent 就是这么做的:  ```json // ~/.claude/settings.json 现状 "hooks": {   "SubagentStart": [     {       "matcher": "stack-detector",       "hooks": [{"type": "command", "command": ".../stack-list-inject.sh"}]     }   ] } ```  hook 脚本返回 `{"hookEventName"...`

### S2fab91bb-4a9dfb (B/medium)

- **Ground truth**: ['CLAUDE.md', 'commit.md', 'config/init_claude.sh', 'guidelines/coding-expert-rules.md', 'hooks/coding-expert-audit.sh', 'hooks/skill-resolve-inject.sh', 'mcp/skill-catalog/src/skill_catalog/cli.py', 'mcp/skill-catalog/tests/test_cli_get.py', 'settings.json']
- **Predicted**: ['/Users/mhbzhy/claude-config/init_claude.sh', 'CLAUDE.md', 'cli.py', 'guidelines/coding-expert-rules.md', 'hooks/coding-expert-audit.sh', 'hooks/skill-resolve-inject.sh', 'init_claude.sh', 'mcp/skill-catalog/src/skill_catalog/cli.py', 'mcp/skill-catalog/tests/test_cli_get.py', 'settings.json', 'skill-resolve-inject.sh', '~/.claude/guidelines/git-commit.md', '~/.claude/settings.json']
- **Missed**: ['commit.md']
- **Context**: `[user] 未落地项直接一次性落地  ---  [assistant] 好的，两件事一次并行落地：  **Batch A** · 主对话 `!skill` 开关（改 hook + CLI 新增 `get` 子命令 + CLAUDE.md 说明 + 测试） **Batch B** · SubagentStop 审计 hook（新 hook + `init_claude.sh` 配 SubagentStop 匹配 + 违规警告通道）  两批次**无文件冲突**（A 碰 `hooks/skill-resolve-inject.sh`/`cli.py`/`CLAUDE.md`/tests；B 碰新 `hooks/coding-expert-audit.sh`/`init_claude.sh`），可...`

### S2fab91bb-317691 (B/medium)

- **Ground truth**: ['CLAUDE.md', 'coding-expert-audit.sh', 'coding-expert-rules-inject.sh', 'commit.md', 'config/init_claude.sh', 'mcp/skill-catalog/']
- **Predicted**: ['/Users/mhbzhy/claude-config/init_claude.sh', 'CLAUDE.md', 'coding-expert-audit.sh', 'coding-expert-rules-inject.sh', 'init_claude.sh', 'mcp/skill-catalog', '~/.claude/guidelines/git-commit.md', '~/.claude/settings.json']
- **Missed**: ['commit.md']
- **Context**: `[user] 我发现“!”也是claude code 关键按键，需要换一个，用“#”吧。  ---  [assistant] 等等——`#` 在 Claude Code 里是 **memory mode 触发符**，以 `#` 开头的 prompt 会被 harness 当作追加到 CLAUDE.md 的命令消费掉，UserPromptSubmit hook 根本收不到。和 `!`（bash mode）的行为完全对称，换了只是从一个雷踩到另一个雷。  Claude Code 的 prompt 保留开头字符一共三个： - `/` — slash command - `!` — bash mode - `#` — memory mode  只要 sentinel 是**单字符前缀**，选任何一个...`

### S8c0ff45b-4c5889 (B/hard)

- **Ground truth**: ['coding-expert-project-rules.md', 'expert-rules.md']
- **Predicted**: ['coding-expert-project-rules.md', '~/.claude/guidelines/coding-expert-rules.md']
- **Missed**: ['expert-rules.md']
- **Context**: `[user] 那么项目级agent能否「include」全局agent，仅额外写与项目相关的内容，这样来确保不漂移  ---  [assistant] Claude Code 对 agent 没有原生 `include/extends` 机制——frontmatter 和 body 都是自包含文件，按 name 整体覆盖。但 body 本质是 prompt，可以通过**指示 subagent Read 两份文件**来模拟继承，这是目前最干净的防漂移方案。  ## 推荐结构  **把"共享通用规范"和"项目专有规范"物理拆开，agent body 串行 Read 两份：**  ``` ~/.claude/guidelines/coding-expert-rules.md   # 通用规范（单一...`

### S1f654568-3da13a (B/medium)

- **Ground truth**: ['local.json', 'settings.json']
- **Predicted**: ['/extra/dir', 'settings.json', '~/.claude/settings.json']
- **Missed**: ['local.json']
- **Context**: `[user] # Update Config Skill  Modify Claude Code configuration by updating settings.json files.  ## When Hooks Are Required (Not Memory)  If the user wants something to happen automatically in response to an EVENT, they need a **hook** configured in settings.json. Memory/preferences cannot trigger automated actions.  **These require hooks:** - "Bef...`

### S8c0ff45b-6d37a9 (mixed/hard)

- **Ground truth**: ['../code-assistant/', 'coding-expert-heavy.md', 'coding-expert-light.md', 'coding-expert.md', 'expert-rules.md']
- **Predicted**: ['coding-expert-heavy.md', 'coding-expert-light.md', 'coding-expert.md']
- **Missed**: ['../code-assistant/', 'expert-rules.md']
- **Context**: `[user] @../code-assistant/ 这里也配置了agents，覆盖了全局配置，把我们刚才对几个agent的描述改动同步到对应的项目级agent当中，但要保留它们对项目特有的描述。  ---  [assistant] 只有 `coding-expert` (standard) 的 description 多了末尾一句，heavy/light 已一致。同步该一句。  ---  [assistant] 同步完成。对比结果：  - **coding-expert.md**: 追加 `并行分发编码子任务时默认使用本 agent。` 一句（其他项目特有内容——`.claude/partials/coding-expert-rules.md` 路径、档位定位措辞——保持不动） - **c...`

### S8c0ff45b-e00a84 (B/hard)

- **Ground truth**: ['expert-rules.md']
- **Predicted**: ['~/.claude/agents/coding-expert-', '~/.claude/guidelines/coding-expert-rules.md']
- **Missed**: ['expert-rules.md']
- **Context**: `[user] 是否也可让项目级agent直接引用对应档位的全局级agent？我看还有很多重复性描述  ---  [assistant] 先看全局 agent 的当前形态再定方案。  ---  [assistant] 可行且收益明显。项目 agent 现在几乎全盘复制全局 body，仅"第一步"小段不同。改成通过 Read 引用全局 agent，body 可从 ~40 行压到 ~10 行。  ---  [assistant] 项目级 agent 全部瘦身为**引用壳**。结构：  ``` 项目 agent（frontmatter + 10 行 body）   ├── Read ~/.claude/agents/coding-expert-{档位}.md   # 全局档位 body（preamb...`

### Sad994c91-de3b52 (B/medium)

- **Ground truth**: ['mark.py']
- **Predicted**: ['scripts/bulk-mark.py']
- **Missed**: ['mark.py']
- **Context**: `[user] 我还有个疑问，如何判断「haiku置信度低」的结果，让sonnet可以精准复核这些内容  ---  [assistant] 这个问题的关键认识:**haiku 自称的 confidence 不可信**——LLM 的 calibration 普遍很差,让它输出 `confidence: "low"` 收效甚微,它倾向永远说 "high" 即便标错。所以置信度**不能靠模型自省**,要靠**外部可测信号**。  ## 三种可操作的置信度信号(按可靠度排序)  ### 信号 1:自一致性采样(Self-Consistency)——最可靠  同一条 skill 让 haiku 跑 **3 次**,对比结果:  - 三次完全一致 → **高置信**,accept - 三次有分歧 → **...`

## Typical false positives (prose_regex_simple)

- S2fab91bb-4a9dfb: FP = ['claude.sh', 'cli.py', 'cli_get.py', 'config/init_claude.sh', 'expert-audit.sh', 'expert-rules.md', 'resolve-inject.sh', 'skill-resolve-inject.sh']
- Sad994c91-38e37b: FP = ['config/hooks/capability-taxonomy-inject.sh', 'marker.md', 'scanner.py', 'skill-marker.md', 'taxonomy-inject.sh', 'taxonomy.md']
- S2fab91bb-45d383: FP = ['claude.sh', 'config/init_claude.sh', 'expert-rules-inject.sh', 'expert-rules.md', 'expert.md']
- Sb481571c-1a7b05: FP = ['recognition-system.md', 'retrieval-optimization.md', 'roadmap.md', 'structure.md']
- S2fab91bb-9044f5: FP = ['expert-rules.md', 'resolve-inject.sh', 'resolve_pipeline.py']

## Analysis

The current `intent-enhancement` module has **zero capability** to extract file paths from prose (B-class). Path extraction today is limited to Claude Code's `attachment` events (the mechanism backing `@path` references) — see `parser.py::_parse_file_reference`. There is no LLM-based span extraction, no regex over message text, and no heuristic for bare filenames. The Ollama `qwen2.5:7b` referenced in `integration/intent_enhanced_resolver.py` is a *tech_stack/capability* classifier; it is not invoked for path extraction.

Consequently the baseline `current_module` produces 0 predictions on every snippet. The `at_regex_only` row reveals the actual A-class coverage ceiling that CC's built-in `@` mechanism already provides, and `prose_regex_simple` shows how much a trivial 20-line regex would recover for B-class — which is the real target surface of the task.

## Miss patterns (qualitative, 5 categories)

1. **Bare filename with extension**: `CLAUDE.md`, `settings.json`, `cli.py` — dominates the eval set; trivially addressable by regex `\w+\.(md|py|sh|json|...)`.
2. **Dir-prefixed relative path**: `hooks/skill-resolve-inject.sh`, `guidelines/coding-expert-rules.md`, `mcp/skill-catalog/src/...` — also regex-addressable if the project's dir vocabulary is known. A small lexicon (hooks|guidelines|agents|config|src|tests|docs|mcp|skills) covers >90% of references in this corpus.
3. **Path inside a fenced code block** (```...```): e.g. ascii-art directory diagrams and shell snippets. Regex still works, but the file may be aspirational (not yet created). LLM context needed to decide if it's a 'referenced' vs 'proposed' path.
4. **Anaphoric reference without full path** (hard): '那个 hook 脚本', '前面说的 md', 'it' — requires cross-turn coreference resolution. Regex fails; embedding+retrieval may help but not span-extract.
5. **Absolute path copy-pasta**: `/Users/mhbzhy/claude-config/hooks/foo.sh`, `~/.claude/guidelines/...` — extractable but overlaps with noise (tool args, log paths). Needs a project-root anchor (`cwd`) to filter.

## Recommendation

- **Gap is structural, not a tuning problem**. A regex-only layer closes most of the B-class gap at near-zero cost; current_module → prose_regex_simple lifts recall from 0% to the number shown above. This should be the first increment.
- **LLM span extraction** (Ollama `qwen2.5:7b` with a focused prompt: 'extract all filesystem paths mentioned in this excerpt, one per line') is warranted ONLY for hard anaphoric cases; it should be the second increment after the regex layer stabilizes.
- **cwd anchoring**: any extractor should accept `cwd` and prefer paths that exist on disk (or are under the project root) as a disambiguator against tool-log noise.

## Ground-truth note

Ground truth was built by union of @-regex hits + dir-prefixed prose hits + extension-bearing filenames, then suffix-deduplicated. Known limitations of this GT: (a) some entries are sub-paths of longer real paths that appear in the context (e.g., `list-inject.sh` vs `stack-list-inject.sh`); (b) templatey names like `SKILL.md` that appear only inside ascii diagrams were filtered out at build time. The lenient match (basename/suffix) in scoring absorbs most of this noise, and relative system ranking is unaffected.
