---
name: gitlab-graphql
description: "GitLab GraphQL API：端点、查询、Mutation、游标分页与复杂度控制"
tech_stack: [gitlab, backend]
---

# GitLab GraphQL API

> 来源：https://docs.gitlab.com/api/graphql/ / https://docs.gitlab.com/api/graphql/getting_started/
> 版本基准：GitLab 17.x（self-managed / SaaS）

## 用途

使用 GraphQL 精确查询所需数据，减少网络请求次数，在单次请求中获取跨资源的关联数据。适合需要获取嵌套关系数据的复杂场景。

## 何时使用

- 需要在一次请求中获取多层嵌套数据（如项目 -> MR -> Pipeline -> Jobs）
- REST API 需要多次请求拼凑的数据，GraphQL 一次搞定
- 需要精确控制返回字段，减少传输数据量
- 执行批量 Mutation（如批量添加 label/emoji）
- 探索 GitLab 数据模型和可用字段

## 端点与认证

```
端点：POST https://gitlab.example.com/api/graphql
Content-Type: application/json
认证方式：与 REST API 相同（PRIVATE-TOKEN / Authorization: Bearer）
```

```bash
curl --request POST \
  --header "PRIVATE-TOKEN: glpat-xxxx" \
  --header "Content-Type: application/json" \
  --data '{"query":"{ currentUser { name username } }"}' \
  "https://gitlab.example.com/api/graphql"
```

```python
import requests

GITLAB_URL = "https://gitlab.example.com/api/graphql"
HEADERS = {"PRIVATE-TOKEN": "glpat-xxxx", "Content-Type": "application/json"}

def graphql_query(query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    resp = requests.post(GITLAB_URL, headers=HEADERS, json=payload)
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise Exception(f"GraphQL errors: {data['errors']}")
    return data["data"]
```

## Schema 探索

### 内省查询

```graphql
# 查看所有可用的查询类型
{
  __schema {
    queryType {
      fields {
        name
        description
      }
    }
  }
}

# 查看特定类型的字段
{
  __type(name: "Project") {
    fields {
      name
      type {
        name
        kind
      }
    }
  }
}
```

### GraphQL Explorer

访问 `https://gitlab.example.com/-/graphql-explorer` 使用交互式 IDE，支持自动补全、文档浏览和查询执行。

## 常用查询模式

### 查询项目信息

```graphql
query GetProject($path: ID!) {
  project(fullPath: $path) {
    id
    name
    description
    visibility
    webUrl
    repository {
      rootRef
      tree {
        lastCommit {
          sha
          message
          authorName
        }
      }
    }
    statistics {
      repositorySize
      commitCount
    }
  }
}
```

```json
{"path": "mygroup/myproject"}
```

### 查询 Merge Requests

```graphql
query GetMergeRequests($path: ID!, $state: MergeRequestState) {
  project(fullPath: $path) {
    mergeRequests(state: $state, first: 20, sort: UPDATED_DESC) {
      nodes {
        iid
        title
        state
        author { username }
        createdAt
        mergedAt
        approvedBy { nodes { username } }
        headPipeline {
          status
          detailedStatus { text }
        }
        labels { nodes { title color } }
        diffStatsSummary {
          additions
          deletions
          fileCount
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

### 查询 Issues

```graphql
query GetIssues($path: ID!) {
  project(fullPath: $path) {
    issues(state: opened, first: 20, sort: CREATED_DESC) {
      nodes {
        iid
        title
        state
        author { username }
        assignees { nodes { username } }
        labels { nodes { title } }
        milestone { title }
        dueDate
        weight
        createdAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

### 查询 Pipelines

```graphql
query GetPipelines($path: ID!) {
  project(fullPath: $path) {
    pipelines(first: 10) {
      nodes {
        id
        iid
        status
        ref
        sha
        createdAt
        duration
        jobs(first: 50) {
          nodes {
            name
            status
            stage { name }
            duration
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

## Mutations

Mutations 始终需要认证，用于修改数据。

### 创建 Merge Request

```graphql
mutation CreateMR($input: MergeRequestCreateInput!) {
  mergeRequestCreate(input: $input) {
    mergeRequest {
      iid
      title
      webUrl
    }
    errors
  }
}
```

```json
{
  "input": {
    "projectPath": "mygroup/myproject",
    "title": "feat: add new feature",
    "sourceBranch": "feature/new-feature",
    "targetBranch": "main",
    "description": "## Changes\n- Added new feature",
    "labels": ["feature"]
  }
}
```

### 创建 Issue

```graphql
mutation CreateIssue($input: CreateIssueInput!) {
  createIssue(input: $input) {
    issue {
      iid
      title
      webUrl
    }
    errors
  }
}
```

```json
{
  "input": {
    "projectPath": "mygroup/myproject",
    "title": "Bug: login page error",
    "description": "Steps to reproduce...",
    "labels": ["bug", "P1"],
    "assigneeIds": ["gid://gitlab/User/42"]
  }
}
```

### 添加 Emoji 反应

```graphql
mutation AddEmoji {
  awardEmojiAdd(input: {
    awardableId: "gid://gitlab/Issue/27039960"
    name: "thumbsup"
  }) {
    awardEmoji {
      name
      emoji
      user { name }
    }
    errors
  }
}
```

### 更新 Issue

```graphql
mutation UpdateIssue($input: UpdateIssueInput!) {
  updateIssue(input: $input) {
    issue {
      iid
      title
      state
    }
    errors
  }
}
```

```json
{
  "input": {
    "projectPath": "mygroup/myproject",
    "iid": "42",
    "stateEvent": CLOSE,
    "addLabelIds": ["gid://gitlab/ProjectLabel/100"]
  }
}
```

## 游标分页

GitLab GraphQL 使用游标（cursor）分页，不支持 offset 分页。

### 分页参数

| 参数 | 说明 |
|---|---|
| `first` | 返回前 N 条（默认 100，最大 100） |
| `after` | 游标位置（从 `endCursor` 获取） |
| `last` | 返回后 N 条 |
| `before` | 游标位置（从 `startCursor` 获取） |

### PageInfo 对象

```graphql
pageInfo {
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
}
```

### 完整分页示例

```python
def paginate_query(query, variables, connection_path):
    """通用 GraphQL 分页遍历"""
    all_nodes = []
    cursor = None

    while True:
        vars = {**variables}
        if cursor:
            vars["after"] = cursor

        data = graphql_query(query, vars)

        # 沿路径导航到目标 connection
        result = data
        for key in connection_path:
            result = result[key]

        all_nodes.extend(result["nodes"])

        page_info = result["pageInfo"]
        if not page_info["hasNextPage"]:
            break
        cursor = page_info["endCursor"]

    return all_nodes

# 使用示例
query = """
query($path: ID!, $after: String) {
  project(fullPath: $path) {
    issues(first: 100, after: $after) {
      nodes { iid title }
      pageInfo { hasNextPage endCursor }
    }
  }
}
"""
all_issues = paginate_query(query, {"path": "mygroup/myproject"},
                            ["project", "issues"])
```

## 复杂度控制

### 查询复杂度

- 每个字段 +1 复杂度（部分字段更高）
- Connection 类型默认 O(N+1) 复杂度（N = `first` 参数值）
- 默认复杂度限制约为 **250**（SaaS）
- 最大查询深度约为 **15 层**

### 查询当前复杂度

```graphql
query {
  queryComplexity {
    score
    limit
  }
  project(fullPath: "mygroup/myproject") {
    issues(first: 10) {
      nodes { iid title }
    }
  }
}
```

### 降低复杂度的技巧

- 减少 `first` 参数值（如从 100 降到 20）
- 避免深层嵌套（拆分为多次查询）
- 只请求需要的字段
- 避免在一次查询中请求多个 connection 类型

## REST vs GraphQL 选型

| 场景 | 推荐 | 原因 |
|---|---|---|
| 简单 CRUD 操作 | REST | 直观，文档完善 |
| 获取单个资源的少量字段 | REST | 简单直接 |
| 获取嵌套关联数据 | GraphQL | 一次请求搞定 |
| 批量创建/更新 | REST | GraphQL Mutation 不支持批量 |
| 下载文件/Artifacts | REST | GraphQL 不支持文件下载 |
| Webhook 事件处理 | REST | Webhook payload 是 REST 格式 |
| 自动化脚本 | REST + python-gitlab | python-gitlab 只支持 REST |
| 前端 Dashboard | GraphQL | 精确控制数据量 |
| 数据探索 | GraphQL Explorer | 自动补全 + 内省 |

## 常见陷阱

- **Mutation 始终需要认证**：匿名用户无法执行任何 Mutation
- **Global ID 格式**：GitLab GraphQL 使用 `gid://gitlab/Project/123` 格式的 Global ID，不要直接传数字 ID
- **复杂度超限报错模糊**：超出复杂度限制时返回 `"Query has complexity of X, which exceeds max complexity of Y"`，需拆分查询
- **分页默认返回 100 条**：不指定 `first` 时默认返回最多 100 条，不会自动翻页
- **空 `nodes` 不表示无数据**：当 `hasNextPage` 为 true 时，当前页的 `nodes` 可能为空（极端分页情况）
- **GraphQL 不返回 HTTP 错误码**：即使查询失败，HTTP 状态码通常仍是 200，错误信息在 response body 的 `errors` 数组中
- **python-gitlab 不支持 GraphQL**：python-gitlab 库只封装了 REST API，GraphQL 需要自行用 requests 调用
- **Schema 频繁变更**：GitLab 的 GraphQL Schema 随版本演进会新增/废弃字段，建议固定版本或做好兼容处理

## 组合提示

- 搭配 `gitlab-api-core` 了解认证方式（GraphQL 认证与 REST 相同）
- 搭配 `gitlab-projects` 对比 REST API 的 MR/Issue/Pipeline 操作
- 搭配 `gitlab-admin` 使用 GraphQL 查询审计事件（Audit Event Streaming）
