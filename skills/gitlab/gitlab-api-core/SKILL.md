---
name: gitlab-api-core
description: "GitLab REST API v4 认证、分页、速率限制与 python-gitlab 基础用法"
tech_stack: [gitlab]
---

# GitLab REST API v4 核心基础

> 来源：https://docs.gitlab.com/api/rest/ / https://docs.gitlab.com/api/rest/authentication/
> 版本基准：GitLab 17.x（self-managed / SaaS）

## 用途

掌握 GitLab REST API v4 的认证方式、请求规范、分页机制、速率限制和错误处理，为所有 API 调用提供基础能力。

## 何时使用

- 首次接入 GitLab API，需要选择合适的认证方式
- 需要遍历大量数据（项目/MR/Issue 等）并正确处理分页
- 遇到 429 限流错误需要实现重试逻辑
- 使用 python-gitlab 库进行自动化开发

## 认证方式全览

### 1. Personal Access Token（PAT）

最常用的认证方式，绑定到个人用户。

**可用 Scope：**
| Scope | 说明 |
|---|---|
| `api` | 完整 API 读写权限（包含 Container/Package Registry） |
| `read_api` | 只读 API 访问 |
| `read_user` | 读取用户信息（`/user` 端点） |
| `read_repository` | Git 仓库只读（clone/pull） |
| `write_repository` | Git 仓库读写（push） |
| `read_registry` | Container Registry 只读 |
| `write_registry` | Container Registry 读写 |
| `sudo` | 管理员以其他用户身份执行操作 |
| `create_runner` | 创建 Runner |
| `manage_runner` | 管理 Runner |
| `ai_features` | AI 功能访问（GitLab 16.3+） |

```bash
# 推荐：使用 PRIVATE-TOKEN header
curl --header "PRIVATE-TOKEN: glpat-xxxxxxxxxxxx" \
  "https://gitlab.example.com/api/v4/projects"

# 也可以用 OAuth 兼容的 Bearer header
curl --header "Authorization: Bearer glpat-xxxxxxxxxxxx" \
  "https://gitlab.example.com/api/v4/projects"

# 不推荐：URL 参数（会出现在日志中）
curl "https://gitlab.example.com/api/v4/projects?private_token=glpat-xxxxxxxxxxxx"
```

### 2. Project Access Token

绑定到特定项目，由 bot 用户持有。需要 Maintainer/Owner 角色创建。

```bash
# 创建 Project Access Token（API）
curl --request POST --header "PRIVATE-TOKEN: <your_pat>" \
  --header "Content-Type: application/json" \
  --data '{"name":"deploy-bot","scopes":["api","read_repository"],"access_level":30,"expires_at":"2025-12-31"}' \
  "https://gitlab.example.com/api/v4/projects/123/access_tokens"
```

`access_level` 枚举值：`10`=Guest, `20`=Reporter, `30`=Developer, `40`=Maintainer, `50`=Owner

### 3. Group Access Token

绑定到特定 Group，对组内所有项目有效。需要 Owner 角色创建。

```bash
curl --request POST --header "PRIVATE-TOKEN: <your_pat>" \
  --header "Content-Type: application/json" \
  --data '{"name":"ci-bot","scopes":["read_api","read_registry"],"access_level":30,"expires_at":"2025-12-31"}' \
  "https://gitlab.example.com/api/v4/groups/456/access_tokens"
```

### 4. OAuth2 Token

适用于第三方应用集成。Access Token 有效期 2 小时，需用 refresh_token 续期。

**GitLab 17.2+ 新增 Device Grant Flow**（17.9 GA），适用于无浏览器的 headless 设备。

```bash
# Authorization Code Flow 获取 token
curl --request POST \
  --data "client_id=APP_ID&client_secret=APP_SECRET&code=AUTH_CODE&grant_type=authorization_code&redirect_uri=REDIRECT_URI" \
  "https://gitlab.example.com/oauth/token"

# 使用 OAuth token
curl --header "Authorization: Bearer oauth-token-here" \
  "https://gitlab.example.com/api/v4/user"
```

### 5. CI/CD Job Token（CI_JOB_TOKEN）

CI/CD 作业自动注入，权限受限且短暂有效。

**GitLab 17.x 重大变更：**
- **17.0**：新增将 Groups 加入 Job Token 允许列表；新增仓库访问权限控制
- **17.2**：UI 更名为 "Job token permissions"
- **17.3**：设置更名为 "CI/CD job token allowlist"
- **17.10**：新增细粒度权限（Fine-grained permissions），可按资源类型控制 allowlist 中的项目/组权限

```bash
# CI/CD Job 中使用（推荐 JOB-TOKEN header）
curl --header "JOB-TOKEN: $CI_JOB_TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/packages/generic/my-pkg/1.0/file.tar.gz"

# 也支持 Bearer
curl --header "Authorization: Bearer $CI_JOB_TOKEN" \
  "https://gitlab.example.com/api/v4/projects"
```

### 6. Deploy Token

专用于 CI/CD 部署场景，不能用于 REST API 的通用端点，仅支持：
- Git clone（read_repository）
- Container Registry（read/write_registry）
- Package Registry（read/write_package_registry）

```bash
# Git clone with deploy token
git clone https://deploy-token-user:deploy-token@gitlab.example.com/group/project.git

# Container Registry login
docker login -u deploy-token-user -p deploy-token registry.gitlab.example.com
```

## 请求基础

```
Base URL: https://gitlab.example.com/api/v4/
Content-Type: application/json（POST/PUT/PATCH）
编码：URL 中的项目路径需要 URL-encode，如 group/project → group%2Fproject
```

```bash
# 项目可以用 ID 或 URL-encoded 路径
curl "https://gitlab.example.com/api/v4/projects/123"
curl "https://gitlab.example.com/api/v4/projects/mygroup%2Fmyproject"
```

## 分页机制

### Offset 分页（默认）

```bash
curl --header "PRIVATE-TOKEN: xxx" \
  "https://gitlab.example.com/api/v4/projects?page=2&per_page=50"
```

**响应 Header：**
| Header | 说明 |
|---|---|
| `X-Total` | 总记录数（大数据集可能为空） |
| `X-Total-Pages` | 总页数 |
| `X-Per-Page` | 每页记录数（默认 20，最大 100） |
| `X-Page` | 当前页码 |
| `X-Next-Page` | 下一页页码 |
| `X-Prev-Page` | 上一页页码 |
| `Link` | 标准 Link header，包含 rel="next"/"prev"/"first"/"last" |

**Offset 上限：** Groups 端点最大 offset 为 50,000。Users 端点超过 50,000 条记录时强制使用 keyset 分页（GitLab 17.0+）。

### Keyset 分页（推荐大数据集）

性能不随数据量增长而退化，适合超过 10,000 条记录的场景。

```bash
# 首次请求
curl --header "PRIVATE-TOKEN: xxx" \
  "https://gitlab.example.com/api/v4/projects?pagination=keyset&per_page=50&order_by=id&sort=asc"

# 从 Link header 中提取 next 链接继续请求
# Link: <https://gitlab.example.com/api/v4/projects?...&id_after=42>; rel="next"
```

## 速率限制

**响应 Header（所有请求都包含）：**
| Header | 说明 |
|---|---|
| `RateLimit-Limit` | 时间窗口内允许的请求总数 |
| `RateLimit-Remaining` | 剩余可用请求数 |
| `RateLimit-Reset` | 限制重置的 Unix 时间戳 |
| `RateLimit-Observed` | 当前已使用的请求数 |
| `Retry-After` | 仅在 429 时返回，等待秒数 |

```python
import time, requests

def request_with_retry(url, headers, max_retries=3):
    for attempt in range(max_retries):
        resp = requests.get(url, headers=headers)
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", 60))
            time.sleep(retry_after)
            continue
        return resp
    raise Exception("Rate limit exceeded after retries")
```

## 错误响应格式

```json
// 400 Bad Request
{"error": "property_name is missing"}

// 401 Unauthorized
{"message": "401 Unauthorized"}

// 403 Forbidden
{"message": "403 Forbidden"}

// 404 Not Found
{"message": "404 Project Not Found"}

// 409 Conflict
{"message": "Branch already exists"}

// 422 Unprocessable Entity
{"message": {"base": ["Branch name is invalid"]}}
```

**注意：** GitLab 17.7 起，`/projects/:id/repository/tree` 路径不存在时返回 404（之前返回 200 + 空数组）。

## python-gitlab 基础用法

```bash
pip install python-gitlab
```

```python
import gitlab

# 认证方式一：Private Token
gl = gitlab.Gitlab("https://gitlab.example.com", private_token="glpat-xxxx")

# 认证方式二：OAuth Token
gl = gitlab.Gitlab("https://gitlab.example.com", oauth_token="oauth-token")

# 认证方式三：Job Token（CI/CD 环境）
gl = gitlab.Gitlab("https://gitlab.example.com", job_token=os.environ["CI_JOB_TOKEN"])

# 认证方式四：配置文件 ~/.python-gitlab.cfg
gl = gitlab.Gitlab.from_config("myserver")

# 验证认证
gl.auth()
print(gl.user.username)
```

### 分页遍历

```python
# 自动分页（推荐，内部使用 generator）
for project in gl.projects.list(iterator=True):
    print(project.name)

# 手动分页
page1 = gl.projects.list(page=1, per_page=50)
page2 = gl.projects.list(page=2, per_page=50)

# 获取全部（小数据集适用，大数据集慎用）
all_projects = gl.projects.list(get_all=True)
```

### 常用操作模式

```python
# 获取单个对象
project = gl.projects.get(123)
# 或者用路径
project = gl.projects.get("mygroup/myproject")

# 创建
project = gl.projects.create({"name": "new-project", "visibility": "private"})

# 更新
project.description = "Updated description"
project.save()

# 删除
project.delete()
# 或
gl.projects.delete(123)
```

## 常见陷阱

- **Token 前缀**：GitLab 17.x 的 PAT 以 `glpat-` 开头，Project Token 以 `glpat-` 开头，Group Token 以 `glpat-` 开头。旧格式 token 仍可用但建议更换
- **Deploy Token 不能调 REST API**：Deploy Token 仅限 Git clone、Registry、Package Registry 操作，不能用于 `/api/v4/` 通用端点
- **Offset 分页大量数据会超时**：超过 10,000 条记录必须使用 keyset 分页；Users 端点超过 50,000 条强制 keyset（17.0+）
- **X-Total header 可能为空**：大数据集为了性能会省略 X-Total 和 X-Total-Pages
- **URL 编码项目路径**：`group/subgroup/project` 必须编码为 `group%2Fsubgroup%2Fproject`
- **python-gitlab `list()` 默认只返回 20 条**：必须使用 `iterator=True` 或 `get_all=True` 获取全部
- **Job Token 权限收紧**：17.x 起默认只允许同项目访问，跨项目需在目标项目的 CI/CD Job Token Allowlist 中添加授权
- **OAuth Token 2 小时过期**：必须实现 refresh_token 逻辑，否则长时间任务会中断

## 组合提示

- 搭配 `gitlab-projects` 了解 Projects/MR/Commits 的具体 API 端点
- 搭配 `gitlab-ci` 了解 CI/CD 相关 API 和 Job Token 的使用场景
- 搭配 `gitlab-graphql` 对比 REST vs GraphQL 的选型
- 搭配 `gitlab-admin` 了解管理员级别的 API 操作
