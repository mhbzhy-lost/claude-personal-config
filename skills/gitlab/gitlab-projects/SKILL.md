---
name: gitlab-projects
description: "GitLab Projects API：项目管理、仓库文件、分支/Tag、Commits 与 Merge Requests 完整指南"
tech_stack: [gitlab, backend]
---

# GitLab Projects API

> 来源：https://docs.gitlab.com/api/projects/ / https://docs.gitlab.com/api/merge_requests/
> 版本基准：GitLab 17.x（self-managed / SaaS）

## 用途

通过 API 管理 GitLab 项目的完整生命周期，包括项目 CRUD、仓库文件操作、分支与 Tag 管理、Commit 操作，以及 Merge Request 的创建、审批、合并全流程。

## 何时使用

- 批量创建/迁移项目
- 通过 API 读写仓库文件（自动化配置管理）
- 自动创建和管理 Merge Request（CI/CD 自动化发版）
- 管理分支保护规则
- 通过 Commits API 批量提交多文件变更

## Projects API

### 创建/更新/删除

```bash
# 创建项目
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "my-project",
    "path": "my-project",
    "namespace_id": 456,
    "visibility": "private",
    "initialize_with_readme": true,
    "default_branch": "main"
  }' \
  "https://gitlab.example.com/api/v4/projects"

# 更新项目
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"description":"Updated description","default_branch":"main"}' \
  "https://gitlab.example.com/api/v4/projects/123"

# 归档项目（只读，可恢复）
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/archive"

# 取消归档
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/unarchive"

# 删除项目（不可恢复！管理员可设置延迟删除）
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123"

# Fork 项目
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "namespace_id=789" \
  "https://gitlab.example.com/api/v4/projects/123/fork"

# Star 项目
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/star"
```

```python
import gitlab
gl = gitlab.Gitlab("https://gitlab.example.com", private_token="glpat-xxx")

# 创建
project = gl.projects.create({
    "name": "my-project", "namespace_id": 456,
    "visibility": "private", "initialize_with_readme": True
})

# 更新
project.description = "Updated"
project.save()

# Fork
fork = project.forks.create({"namespace_id": 789})

# 归档/取消归档
project.archive()
project.unarchive()

# 删除
project.delete()
```

## Repository Files API

### 读取文件

```bash
# 读取文件内容（默认 base64 编码）
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/src%2Fmain.py?ref=main"
# 响应包含：file_name, file_path, size, encoding("base64"), content, content_sha256, ref, blob_id, commit_id

# 读取原始内容（纯文本）
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/src%2Fmain.py/raw?ref=main"

# 使用 HEAD 获取默认分支的文件
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/README.md?ref=HEAD"
```

### 创建/更新/删除文件

```bash
# 创建文件
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "branch": "main",
    "content": "print(\"hello world\")",
    "commit_message": "Add main.py",
    "encoding": "text"
  }' \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/src%2Fmain.py"

# 更新文件
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "branch": "main",
    "content": "print(\"hello updated\")",
    "commit_message": "Update main.py",
    "encoding": "text"
  }' \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/src%2Fmain.py"

# 上传二进制文件（base64 编码）
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "branch": "main",
    "content": "iVBORw0KGgo...(base64数据)",
    "commit_message": "Add image",
    "encoding": "base64"
  }' \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/images%2Flogo.png"

# 删除文件
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"branch":"main","commit_message":"Remove old file"}' \
  "https://gitlab.example.com/api/v4/projects/123/repository/files/old-file.txt"
```

**文件大小限制：** 单次请求最大 300 MB；超过 20 MB 的文件会被限流（3 次/30 秒）。

```python
project = gl.projects.get(123)

# 读取文件
f = project.files.get(file_path="src/main.py", ref="main")
content = f.decode()  # 自动 base64 解码

# 创建文件
project.files.create({
    "file_path": "src/new.py",
    "branch": "main",
    "content": "print('hello')",
    "commit_message": "Add new.py"
})

# 更新文件
f.content = "print('updated')"
f.save(branch="main", commit_message="Update file")

# 删除文件
f.delete(branch="main", commit_message="Remove file")
```

## Branches API

```bash
# 列出分支
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/branches"

# 创建分支
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "branch=feature/new&ref=main" \
  "https://gitlab.example.com/api/v4/projects/123/repository/branches"

# 删除分支
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/branches/feature%2Fold"
```

### 保护分支规则

```bash
# 保护分支
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "main",
    "push_access_level": 40,
    "merge_access_level": 30,
    "unprotect_access_level": 40,
    "allow_force_push": false,
    "code_owner_approval_required": true
  }' \
  "https://gitlab.example.com/api/v4/projects/123/protected_branches"

# 使用通配符保护
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "name=release/*&push_access_level=40&merge_access_level=40" \
  "https://gitlab.example.com/api/v4/projects/123/protected_branches"

# 指定用户/组的推送权限
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "main",
    "allowed_to_push": [{"user_id": 42}, {"group_id": 10}],
    "allowed_to_merge": [{"access_level": 30}]
  }' \
  "https://gitlab.example.com/api/v4/projects/123/protected_branches"

# 取消保护
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/protected_branches/main"
```

**access_level 枚举值：** `0`=No access, `30`=Developer, `40`=Maintainer, `60`=Admin

```python
project = gl.projects.get(123)

# 创建分支
branch = project.branches.create({"branch": "feature/new", "ref": "main"})

# 保护分支
project.protectedbranches.create({
    "name": "main",
    "push_access_level": 40,
    "merge_access_level": 30
})
```

## Tags API

```bash
# 创建 Tag
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "tag_name=v1.0.0&ref=main&message=Release v1.0.0&release_description=First release" \
  "https://gitlab.example.com/api/v4/projects/123/repository/tags"

# 删除 Tag
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/tags/v1.0.0"
```

## Commits API

### 列出/查看 Commits

```bash
# 列出 commits
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/commits?ref_name=main&since=2024-01-01T00:00:00Z"

# 查看单个 commit
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/repository/commits/abc123def"
```

### 创建多文件 Commit

```bash
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "branch": "main",
    "commit_message": "feat: add config files",
    "actions": [
      {"action": "create", "file_path": "config/app.yml", "content": "key: value"},
      {"action": "update", "file_path": "README.md", "content": "# Updated"},
      {"action": "delete", "file_path": "old-config.yml"},
      {"action": "move", "file_path": "new-path/file.txt", "previous_path": "old-path/file.txt"},
      {"action": "create", "file_path": "images/logo.png", "content": "base64data...", "encoding": "base64"}
    ]
  }' \
  "https://gitlab.example.com/api/v4/projects/123/repository/commits"
```

**action 类型：** `create`、`delete`、`move`、`update`、`chmod`

### Cherry-pick / Revert

```bash
# Cherry-pick
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "branch=release/1.0" \
  "https://gitlab.example.com/api/v4/projects/123/repository/commits/abc123/cherry_pick"

# Dry-run（只验证不执行）
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "branch=release/1.0&dry_run=true" \
  "https://gitlab.example.com/api/v4/projects/123/repository/commits/abc123/cherry_pick"

# Revert
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "branch=main" \
  "https://gitlab.example.com/api/v4/projects/123/repository/commits/abc123/revert"
```

```python
project = gl.projects.get(123)

# 创建多文件 commit
commit = project.commits.create({
    "branch": "main",
    "commit_message": "batch update",
    "actions": [
        {"action": "create", "file_path": "new.txt", "content": "hello"},
        {"action": "update", "file_path": "existing.txt", "content": "updated"}
    ]
})

# Cherry-pick
commit = project.commits.get("abc123")
commit.cherry_pick(branch="release/1.0")

# Revert
commit.revert(branch="main")
```

## Merge Requests API

### 创建/更新/合并

```bash
# 创建 MR
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "source_branch": "feature/new",
    "target_branch": "main",
    "title": "feat: add new feature",
    "description": "## Changes\n- Added feature X",
    "assignee_id": 42,
    "reviewer_ids": [43, 44],
    "labels": "feature,frontend",
    "squash": true,
    "remove_source_branch": true
  }' \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests"

# 更新 MR
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"title":"feat: updated title","labels":"feature,reviewed"}' \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1"

# 合并 MR
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "merge_commit_message": "Merge feature branch",
    "squash_commit_message": "feat: add new feature",
    "squash": true,
    "should_remove_source_branch": true
  }' \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/merge"

# Pipeline 成功后自动合并
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --data "merge_when_pipeline_succeeds=true" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/merge"

# 取消自动合并
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/cancel_merge_when_pipeline_succeeds"
```

### 审批（Approve/Unapprove）

```bash
# Approve MR
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/approve"

# Unapprove MR
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/unapprove"

# 查看审批状态
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/approval_state"

# 配置审批规则
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "security-review",
    "approvals_required": 2,
    "user_ids": [43, 44],
    "group_ids": [10]
  }' \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/approval_rules"
```

### Discussions / Notes

```bash
# 列出讨论
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/discussions"

# 添加评论（Note）
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "body=LGTM! :+1:" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/notes"

# 创建讨论线程（可 resolve）
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"body":"This needs refactoring","position":{"base_sha":"abc","start_sha":"def","head_sha":"ghi","position_type":"text","old_path":"file.py","new_path":"file.py","new_line":42}}' \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/discussions"

# Resolve 讨论
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --data "resolved=true" \
  "https://gitlab.example.com/api/v4/projects/123/merge_requests/1/discussions/DISCUSSION_ID"
```

```python
project = gl.projects.get(123)

# 创建 MR
mr = project.mergerequests.create({
    "source_branch": "feature/new", "target_branch": "main",
    "title": "feat: add new feature", "squash": True,
    "remove_source_branch": True
})

# Approve
mr.approve()

# 合并
mr.merge(squash=True, should_remove_source_branch=True,
         merge_when_pipeline_succeeds=True)

# 添加评论
mr.notes.create({"body": "LGTM!"})

# 列出 changes
changes = mr.changes()

# 列出 commits
commits = mr.commits()
```

## 常见陷阱

- **文件路径必须 URL 编码**：`src/main.py` -> `src%2Fmain.py`，否则 404
- **Repository Files API 每次只操作一个文件**：批量操作请使用 Commits API 的 `actions` 数组
- **`encoding` 参数**：默认 `text`，二进制文件必须指定 `base64`，否则文件损坏
- **保护分支权限传递**：`allowed_to_push`/`allowed_to_merge`/`allowed_to_unprotect` 数组中的元素只能用 `user_id`、`group_id` 或 `access_level` 之一，不能混用
- **多条保护规则最宽松优先**：当一个分支匹配多条保护规则时，取最宽松权限（但 Code Owner 审批取最严格）
- **Merge 时 `squash` 参数**：创建 MR 时的 `squash` 只是默认值，合并时可以再次指定覆盖
- **Cherry-pick 空 changeset**：如果目标分支已包含该 commit 的变更，cherry-pick 会返回 "changeset is empty"
- **`merge_when_pipeline_succeeds`**：需要项目启用了 Pipeline，且 MR 有关联的 Pipeline 正在运行
- **GitLab 17.6**：Pull mirror 配置从 Projects API 迁移到新端点 `projects/:id/mirror/pull`

## 组合提示

- 搭配 `gitlab-api-core` 了解认证和分页
- 搭配 `gitlab-ci` 了解 Pipeline/Jobs 的管理 API
- 搭配 `gitlab-graphql` 使用 GraphQL 查询 MR/Issue 的嵌套数据
- 搭配 `gitlab-admin` 管理项目成员和 Webhook
