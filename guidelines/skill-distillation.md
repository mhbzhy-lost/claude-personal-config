# Skill 蒸馏工作流

蒸馏新 skill 时，按以下五阶段**严格顺序**执行：

1. **规划**：调用 `source-planner` agent，输入 `tech_stack + scope + constraints`，输出结构化 `sources[] + skip[] + notes`。**主 agent 不得跳过本阶段**，即使已知 URL 清单也要走 planner
2. **采集**：把 planner 的 JSON 输出直接传给 `skill-fetcher` agent，按清单下载到 `/tmp/skill-src/<tech_stack>/<skill_name>/`，每个目录附带 `_manifest.md`。skill-fetcher **不接受**自由格式输入
3. **预处理**：对每个产出了素材的 skill 目录，调用 `skill-preprocessor` agent。**保守模式**——只去噪（删 HTML 残留 / 导航 / 重复段落）、按固定模板归档合并，**不改写原文表述**。输出到 `<skill_dir>/_processed/SOURCE.md + _meta.json`
4. **蒸馏**：调用 `skill-builder` agent，传入 `target_skill_name + material_dir`。builder **只读** `_processed/` 下的产物，禁止回退读原始素材。frontmatter 不产出 `capability`
5. **打标**：调用 `skill-marker` agent，为 SKILL.md 追加 `capability: [...]`。taxonomy 由 SubagentStart hook 自动注入。**必须一次性批量调用完成**，禁止分散多次

**批量蒸馏**：
- 同一 planner 调用可产出多个 skill 的 sources
- fetcher 支持单次处理多 skill（按 target_skill_name 分组落盘）
- preprocessor 按 skill 粒度独立跑，可并行
- builder 按 skill 粒度独立跑，可并行
- marker 最后**一次调用**覆盖全部新产 skill（target 传父目录 + glob），禁止拆成多次分批

**增量采集**：planner 的 `scope.mode=incremental` 配合 `skip_collected_within` 自动跳过新鲜度未过期的 skill。
