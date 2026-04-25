---
name: skill-distillation
description: Claude Code Skill 蒸馏五阶段工作流——通过 source-planner / skill-fetcher / skill-preprocessor / skill-builder / skill-marker 五个子 agent 将原始知识源转化为结构化 SKILL.md 技能包，含 frontmatter 打标规范
---

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

---

## Frontmatter 打标规范

skill 的 frontmatter 四个字段（`tech_stack` / `capability` / `language` / `description`）都进入检索链路：classifier 按前两个做闭集分类过滤，embedding 模型按 `description` 做语义精排。质量不达标会直接压低召回。**打标阶段必须逐字段校验下列规则**。

### tech_stack

- 必须来自 `references/tech-stack-taxonomy.md` 闭集
- 新出现的技术栈**先在 taxonomy 新增条目再打标**，禁止先落 SKILL.md 再回补 taxonomy
- **不要标孤立子品牌 / 扩展 / 插件名**：
  - 遇 `wechat-open-platform` / `wechat-official-account` / `wechat-cloud` → 归 `wechat`
  - 遇 `starlette` / `slowapi` / `fastapi-cache2` → 归 `fastapi`
  - 遇 `django-storages` / DRF 扩展 → 归 `django`
  - 遇 `gitlab-ci` / `gitlab-runner` → 归 `gitlab`
  - 遇 `docker-scout` / `buildkit` → 归 `docker`
  - 遇 `python-socketio` → 归 `socketio`
  - 遇 `claude-agent-sdk` → 归 `claude-code`
  - 遇 `confluent` → 归 `kafka`
- **竞品 / 不同代际独立技术保留**：`kingfisher` vs `sdwebimage`、`fluxcd` vs `argocd`、`coredata` vs `swiftdata`、各家 OAuth provider 各家 DRM CDM 均不合并
- 单 skill 通常 1–3 个 tech_stack；跨栈综合 skill 可到 5 个

### capability

- 必须来自 `references/capability-taxonomy.md` 闭集（规则已在该文件声明）
- 单 skill 通常 1–3 个 capability；跨域综合组件可到 5 个

### language

- 判据：**正文代码块主语言即 language**；跨端 SDK 同主题给多语言用法的，标多个
- 命名规范：`objective-c` 一律写作 `objc`；不出现 `typescript-react` 这种复合（分别用 `typescript` + `react`）
- **协议 / 规范 / 基础设施配置类保持空**（language-agnostic）：OAuth flow、Kubernetes YAML、Nginx conf、Dockerfile 模板、Elasticsearch 运维（security / shard-tuning / ilm）、纯协议（HLS / DRM / MSE）等
- 典型例子：
  - `postgresql-*`（仅 SQL 片段）→ `[sql]`
  - `redis-*`（Python 客户端示范）→ `[python]`
  - `elasticsearch-*` 含 Python client → `[python]`
  - `tailwindcss-*` → `[html]` / `[css]`
  - 跨端支付 / 登录 SDK（如 `wechat-oauth-login`）→ `[java, javascript, objc]`

### description

- 直接被 embedding 模型（bge-m3）向量化做语义精排，是排序质量的**核心输入**
- 要求：
  - **信息密实**——避免"简介"式模糊描述（反例："关于 X 的使用技巧"）
  - **关键词显式**——技术栈官方名、核心功能动词、关键 API / 概念必须明文出现（例："在 FastAPI 中使用 Depends 实现请求级依赖注入与 Session 管理"）
  - **不重复 frontmatter 的 tag**——但可以使用同义扩展（tag 是 `fastapi`，description 可说"FastAPI / Starlette 应用"，帮助 embedding 拉近相关 query）
- 经验长度：40–100 字符（当前语料 avg 64）。过短召回偏弱，过长噪声增加

### 打标校验流程

`skill-marker` 在一次性批量打标时按上述四条逐字段校验：

1. 加载 `references/capability-taxonomy.md` + `references/tech-stack-taxonomy.md` 闭集（SubagentStart hook 自动注入）
2. 对每个 SKILL.md 逐项检查：闭集命中、language 判据、description 密度
3. 若发现闭集外 tech_stack：**中断打标**，回报主 agent 先补 taxonomy
4. 若发现 description 过短 / 全是 tag 堆砌：回报并建议改写
