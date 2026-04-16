---
name: gitlab-ci
description: "GitLab CI/CD API：Pipelines、Jobs、Variables、Triggers、Schedules 与 Components"
tech_stack: [gitlab]
---

# GitLab CI/CD API

> 来源：https://docs.gitlab.com/api/pipelines/ / https://docs.gitlab.com/ci/components/
> 版本基准：GitLab 17.x（self-managed / SaaS）

## 用途

通过 API 管理 CI/CD 流水线的完整生命周期：触发、监控、取消、重试管道和作业，管理 CI/CD 变量，配置定时调度，以及使用 CI/CD Components 构建可复用流水线。

## 何时使用

- 通过 API 或跨项目触发流水线
- 批量管理 CI/CD 变量（多环境、多项目）
- 下载构建产物（artifacts）
- 配置和管理 Pipeline Schedules
- 使用 CI/CD Components 构建模块化流水线（GitLab 17.0 GA）

## Pipelines API

### 列出/创建/查看

```bash
# 列出项目流水线
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipelines?status=success&ref=main&per_page=50"

# 查看单个流水线
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipelines/456"

# 创建流水线（指定分支 + 变量）
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"ref":"main","variables":[{"key":"DEPLOY_ENV","value":"staging"}]}' \
  "https://gitlab.example.com/api/v4/projects/123/pipeline"
```

### 取消/重试/删除

```bash
# 取消运行中的流水线
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipelines/456/cancel"

# 重试失败的流水线
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipelines/456/retry"

# 删除流水线（不可恢复！）
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipelines/456"
```

### python-gitlab 操作

```python
import gitlab
gl = gitlab.Gitlab("https://gitlab.example.com", private_token="glpat-xxx")
project = gl.projects.get(123)

# 列出流水线
pipelines = project.pipelines.list(status="success", ref="main", iterator=True)

# 创建流水线
pipeline = project.pipelines.create({"ref": "main", "variables": [
    {"key": "DEPLOY_ENV", "value": "staging"}
]})

# 取消/重试/删除
pipeline.cancel()
pipeline.retry()
pipeline.delete()
```

## Jobs API

```bash
# 列出流水线中的作业
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipelines/456/jobs"

# 查看单个作业
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789"

# 触发 manual 作业
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789/play"

# 重试失败的作业
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789/retry"

# 取消运行中的作业
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789/cancel"

# 下载 artifacts（zip 格式）
curl --header "PRIVATE-TOKEN: $TOKEN" --output artifacts.zip \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789/artifacts"

# 下载特定文件
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789/artifacts/path/to/file.txt"

# 查看作业日志
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/jobs/789/trace"
```

```python
project = gl.projects.get(123)
pipeline = project.pipelines.get(456)

# 列出作业
jobs = pipeline.jobs.list(iterator=True)

# 注意：pipeline.jobs 返回的是 ProjectPipelineJob，不支持 play/retry/cancel
# 必须通过 project.jobs.get() 获取完整的 ProjectJob 对象
job = project.jobs.get(789)
job.play()
job.retry()
job.cancel()

# 下载 artifacts
with open("artifacts.zip", "wb") as f:
    job.artifacts(streamed=True, action=f.write)

# 查看日志
log = job.trace()
```

## Pipeline Trigger（跨项目触发）

### Trigger Token 方式

```bash
# 创建 Trigger Token
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "description=cross-project-trigger" \
  "https://gitlab.example.com/api/v4/projects/123/triggers"

# 使用 Trigger Token 触发流水线
curl --request POST \
  --form "token=TRIGGER_TOKEN" \
  --form "ref=main" \
  --form "variables[DEPLOY_ENV]=production" \
  "https://gitlab.example.com/api/v4/projects/123/trigger/pipeline"
```

### CI/CD Job Token 方式（推荐，形成上下游关联）

```yaml
# .gitlab-ci.yml - 使用 trigger 关键字
trigger_downstream:
  trigger:
    project: group/downstream-project
    branch: main
    strategy: depend  # 等待下游完成
```

```bash
# 或在 CI Job 中用 API
curl --request POST \
  --form "token=$CI_JOB_TOKEN" \
  --form "ref=main" \
  "https://gitlab.example.com/api/v4/projects/789/trigger/pipeline"
```

**关键区别：** 使用 `CI_JOB_TOKEN` 触发时，下游管道会显示在 Pipeline Graph 中并形成上下游关系；使用 Trigger Token 则不会。

## CI/CD Variables API

### 项目级变量

```bash
# 列出
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/variables"

# 创建
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "key": "DB_PASSWORD",
    "value": "secret123",
    "masked": true,
    "protected": true,
    "environment_scope": "production",
    "variable_type": "env_var"
  }' \
  "https://gitlab.example.com/api/v4/projects/123/variables"

# 更新
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"value":"new-secret","masked":true}' \
  "https://gitlab.example.com/api/v4/projects/123/variables/DB_PASSWORD"

# 删除
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/variables/DB_PASSWORD"
```

**Variable 参数：**
| 参数 | 说明 |
|---|---|
| `variable_type` | `env_var`（默认）或 `file` |
| `masked` | 日志中遮蔽显示（值需 >= 8 字符，不含换行） |
| `protected` | 仅在 protected 分支/tag 的作业中可用 |
| `environment_scope` | 限定环境范围，如 `production`、`staging/*`（`*` 表示所有环境） |
| `raw` | 禁用变量展开（`$` 不会被解析） |

### 组级/实例级变量

```bash
# 组级变量
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/variables"

# 实例级变量（需要管理员权限）
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/admin/ci/variables"
```

```python
# python-gitlab
project = gl.projects.get(123)
# 列出
vars = project.variables.list()
# 创建
var = project.variables.create({
    "key": "DB_PASSWORD", "value": "secret",
    "masked": True, "protected": True,
    "environment_scope": "production"
})
# 更新
var.value = "new-secret"
var.save()
# 删除
var.delete()
```

**GitLab 17.7 变更：** `restrict_user_defined_variables` 已废弃，替换为 `ci_pipeline_variables_minimum_override_role`。设置 `ci_pipeline_variables_minimum_override_role: "developer"` 等价于之前的 `restrict_user_defined_variables: false`。

## Pipeline Schedules API

```bash
# 创建定时调度
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "description": "Nightly Build",
    "ref": "main",
    "cron": "0 2 * * *",
    "cron_timezone": "Asia/Shanghai",
    "active": true
  }' \
  "https://gitlab.example.com/api/v4/projects/123/pipeline_schedules"

# 为调度添加变量
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "key=NIGHTLY&value=true" \
  "https://gitlab.example.com/api/v4/projects/123/pipeline_schedules/10/variables"

# 立即触发一次调度
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/pipeline_schedules/10/play"
```

```python
# python-gitlab
schedules = project.pipelineschedules.list()
schedule = project.pipelineschedules.create({
    "description": "Nightly Build", "ref": "main",
    "cron": "0 2 * * *", "cron_timezone": "Asia/Shanghai", "active": True
})
schedule.variables.create({"key": "NIGHTLY", "value": "true"})
```

**权限说明：** Schedule 的 owner 决定了流水线的执行权限。创建者自动成为 owner。转移 ownership 需通过 API 的 `PUT` 请求更新。调度最多可添加 20 个 inputs。

## CI/CD Components（GitLab 17.0 GA）

可复用的流水线配置单元，可发布到 CI/CD Catalog 供跨项目引用。

### 引用语法

```yaml
# include:component 语法
include:
  - component: gitlab.example.com/my-org/security-scanner/sast@1.0.0
    inputs:
      stage: test
      scan_path: ./src

  # ~latest 指向最新语义化版本
  - component: gitlab.com/components/opentofu/apply@~latest
    inputs:
      version: 1.6.0
```

### 版本引用方式

| 格式 | 说明 |
|---|---|
| `@1.0.0` | 精确 tag 版本 |
| `@~latest` | CI/CD Catalog 中最新的语义化版本 |
| `@main` | 分支名（开发阶段使用） |
| `@sha` | 完整 commit SHA |

### 创建 Component

```yaml
# templates/sast.yml（组件目录结构：templates/<component-name>.yml）
spec:
  inputs:
    stage:
      default: test
    scan_path:
      default: "."
      type: string
---
"sast-job":
  stage: $[[ inputs.stage ]]
  image: security-scanner:latest
  script:
    - scan --path $[[ inputs.scan_path ]]
```

### Inputs（GitLab 17.11+）

比 CI/CD Variables 更安全的参数传递方式，支持类型检查和验证。

```yaml
spec:
  inputs:
    environment:
      type: string
      options: ["staging", "production"]
    debug:
      type: boolean
      default: false
```

## .gitlab-ci.yml 关键语法速查

```yaml
stages:
  - build
  - test
  - deploy

build:
  stage: build
  image: node:20
  script:
    - npm ci
    - npm run build
  artifacts:
    paths: [dist/]
    expire_in: 1 week
  cache:
    key: ${CI_COMMIT_REF_SLUG}
    paths: [node_modules/]

test:
  stage: test
  needs: [build]          # DAG：不等整个 stage，build 完成即开始
  services:
    - postgres:16
  variables:
    POSTGRES_DB: test
  rules:
    - if: $CI_MERGE_REQUEST_IID  # MR 管道
    - if: $CI_COMMIT_BRANCH == "main"
  script:
    - npm test
```

## 常见陷阱

- **`pipeline.jobs` 对象不支持操作方法**：`ProjectPipelineJob` 是只读的，必须通过 `project.jobs.get(job_id)` 获取完整的 `ProjectJob` 对象才能调用 `play()`/`retry()`/`cancel()`
- **Trigger Token vs Job Token**：Trigger Token 触发的管道不会在 Pipeline Graph 中显示上下游关系；推荐使用 `trigger:` 关键字或 `CI_JOB_TOKEN`
- **`masked` 变量要求**：值必须 >= 8 字符，不能包含换行符，否则创建会失败
- **`environment_scope` 同名冲突**：同一 key 可有多个 environment_scope，scope 最精确的优先匹配
- **Component 版本锁定**：生产环境必须用精确版本号（`@1.0.0`），不要用 `@~latest` 或分支名
- **`restrict_user_defined_variables` 已废弃**（17.7）：使用 `ci_pipeline_variables_minimum_override_role` 替代
- **Schedule 权限继承**：Schedule 使用 owner 的权限执行，owner 离职或降权会导致调度失败

## 组合提示

- 搭配 `gitlab-api-core` 了解认证方式和分页处理
- 搭配 `gitlab-projects` 了解 Merge Request 管道和 Commits API
- 搭配 `gitlab-registry` 了解 CI/CD 中推送 Container/Package 的 API
- 搭配 `gitlab-admin` 管理实例级 CI/CD 变量和 Runner
