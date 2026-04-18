---
name: gitlab-security-scanning
description: GitLab SAST、Pipeline Secret Detection 与漏洞报告的启用与配置实践
tech_stack: [gitlab, gitlab-ci]
capability: [ci-cd]
version: "gitlab unversioned"
collected_at: 2026-04-18
---

# GitLab 安全扫描（SAST / Secret Detection / Vulnerability Report）

> 来源：https://docs.gitlab.com/user/application_security/sast/ ； https://docs.gitlab.com/user/application_security/secret_detection/pipeline/ ； https://docs.gitlab.com/user/application_security/vulnerability_report/

## 用途
在 GitLab CI/CD 中开启静态代码安全扫描（SAST）、提交密钥泄漏扫描（Pipeline Secret Detection），并通过 Vulnerability Report 统一跟踪、筛选与处置漏洞。

## 何时使用
- 项目已启用 GitLab CI，希望在合入前发现源码漏洞与硬编码密钥
- 需要在 `.gitlab-ci.yml` 中一行启用官方模板扫描
- 离线/受限网络环境部署 SAST 分析器镜像
- Ultimate 租户需要 MR 组件显示新发现、群组安全仪表盘与漏洞管理

## 前置条件
- Maintainer / Owner 角色
- Linux runner，executor 为 Docker 或 Kubernetes（Secret Detection 仅支持 amd64）
- `.gitlab-ci.yml` 中存在 `test` 阶段

## 基础用法

### 启用 SAST
```yaml
include:
  - template: Jobs/SAST.gitlab-ci.yml
```
或用 CI/CD component：
```yaml
include:
  - component: gitlab.com/components/sast/sast@main
```

### 启用 Pipeline Secret Detection
```yaml
include:
  - template: Jobs/Secret-Detection.gitlab-ci.yml
```
启用后作业名为 `secret_detection`，产物 `gl-secret-detection-report.json`。

## SAST 语言支持

| 级别 | 语言 |
|---|---|
| Advanced SAST + 标准分析器 | C, C++, C#, Go, Java, JavaScript, PHP, Python, Ruby, TypeScript, YAML |
| 仅标准分析器 | Apex, Elixir, Groovy, Kotlin, Objective-C, Scala, Swift |

Advanced SAST（跨文件/跨函数）仅 Ultimate 可用。

## 关键 CI/CD 变量

| 变量 | 用途 |
|---|---|
| `SAST_EXCLUDED_PATHS` | 排除文件/目录 |
| `SEARCH_MAX_DEPTH` | 扫描目录深度，默认 20 |
| `SAST_ANALYZER_IMAGE_TAG` | 固定分析器版本 |
| `GITLAB_ADVANCED_SAST_ENABLED` | 开启 Advanced SAST（Ultimate） |
| `SECURE_ANALYZERS_PREFIX` | 离线部署时的镜像仓前缀 |
| `SECRET_DETECTION_HISTORIC_SCAN` | `true` 触发一次性全历史扫描 |
| `SECRET_DETECTION_IMAGE_SUFFIX` | `-fips` 切 Red Hat UBI FIPS 镜像 |
| `SECRET_DETECTION_LOG_OPTIONS` | 传给底层 git log，如 `--max-count=50` |
| `GIT_DEPTH` | 避免 missing commits 报错，建议 `0` 或 `100` |

## 常用配置示例

### 排除路径
```yaml
variables:
  SAST_EXCLUDED_PATHS: "rule-template-injection.go"
```

### 关闭特定 SAST 规则（`.gitlab/sast-ruleset.toml`）
```toml
[semgrep]
  [[semgrep.ruleset]]
    disable = true
    [semgrep.ruleset.identifier]
      type = "semgrep_id"
      value = "gosec.G107-1"
```

### 离线镜像仓
```yaml
variables:
  SECURE_ANALYZERS_PREFIX: "localhost:5000/analyzers"
```
本地需导入：`registry.gitlab.com/security-products/gitlab-advanced-sast:2`、`semgrep:6`、`spotbugs:5` 等。

### FIPS Secret Detection
```yaml
variables:
  SECRET_DETECTION_IMAGE_SUFFIX: '-fips'
include:
  - template: Jobs/Secret-Detection.gitlab-ci.yml
```

### 常见排错
```yaml
# missing commits
secret_detection:
  variables:
    GIT_DEPTH: 100  # 或 0 全量
```
```yaml
# repository ownership error
before_script:
  - git config --global --add safe.directory "$CI_PROJECT_DIR"
```

## Secret Detection 扫描范围

| 场景 | 范围 |
|---|---|
| 默认分支 | 整个工作树 |
| 新建非默认分支 | 仅最新 commit |
| 已存在非默认分支 | 上次 push 之后的 commits |
| Merge request | 分支全部 commits |

自动排除：`.git/`、`node_modules/`、`vendor/`、`target/`、`__pycache__/`、`*.png`/音视频/归档、`package-lock.json` / `poetry.lock` 等 lock 文件、`.editorconfig`、`gitleaks.toml`。

## Vulnerability Report

默认分支的累计扫描结果。需 Developer / Maintainer / Owner / Security Manager 角色。

**筛选维度**：Status（needs triage/confirmed/dismissed/resolved）、Severity（critical→info）、Report type（SAST、container fuzzing 等）、Scanner、Activity、Identifier、Reachability、Validity check、Policy violation。

**分组**：Status / Severity / Report type / Scanner / OWASP Top 10 (2017 & 2021)。

**批量操作**：关联现有 issue、创建新 issue、CSV 导出（含全部字段，忽略 UI 过滤器）、手工添加漏洞。

**Severity override**：Security Manager / Maintainer / Owner 可覆盖严重性，需填理由，历史保留 badge。

## 注意事项

- **Registration token 模式的 secret detection/SAST 不存在**；仅需 CI 模板，Runner 走 Docker/K8s executor 即可
- **Secret Detection 仅支持 amd64**，arm64/Windows 会报格式错误
- **Historic scan 只跑一次**（`SECRET_DETECTION_HISTORIC_SCAN=true`），大仓耗时显著
- **泄漏的密钥必须立即吊销**：仅从历史中 purge 不够，fork/clone 仍保留，必须在源系统 revoke
- Secret detection 重复跟踪 **按文件**；同一密钥出现在不同文件视为不同 finding
- Vulnerability Report 总数 > 1000 时显示 `1000+` 而非精确值
- GitLab.com 的漏洞在最后更新 **1 年后归档**
- Advanced Vulnerability Management（Identifier / Reachability / Validity / Policy 过滤、OWASP 2021 分组）需要实例启用 Elasticsearch 高级搜索
- Ultimate 独占：MR widget 新发现、changes 视图内联注释、自定义 ruleset、UI 配置、Duo 假阳性检测、Agentic 修复、安全策略、Security Dashboard

## 组合提示
- 依赖 `gitlab-runner-management`（Linux + Docker/K8s executor）
- SAST 与 Secret Detection 常同时启用，配合 Vulnerability Report 统一处置
- Ultimate 场景搭配 Security Policies、MR approval rules 做准入控制
