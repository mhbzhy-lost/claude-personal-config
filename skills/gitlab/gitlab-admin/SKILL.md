---
name: gitlab-admin
description: "GitLab 管理 API：Users、Groups、Members、Webhooks、Audit Events 与应用设置"
tech_stack: [gitlab, backend]
---

# GitLab 管理 API

> 来源：https://docs.gitlab.com/api/users/ / https://docs.gitlab.com/api/groups/ / https://docs.gitlab.com/api/audit_events/
> 版本基准：GitLab 17.x（self-managed / SaaS）

## 用途

通过 API 管理 GitLab 实例的用户、组织结构、成员权限、Webhooks 事件通知、审计日志和全局应用设置，实现 GitLab 管理自动化。

## 何时使用

- 批量创建/管理用户账户（LDAP/SCIM 同步后的补充操作）
- 管理组织架构（Group/Subgroup 层级）
- 自动化成员权限管理（入职/离职/转组）
- 配置 Webhook 与外部系统集成
- 审计合规需求（查询操作日志）
- 配置全局实例设置

## Users API

### 创建/更新/搜索

```bash
# 搜索用户
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/users?search=john&per_page=20"

# 创建用户（需要管理员权限）
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "email": "john@example.com",
    "username": "john",
    "name": "John Doe",
    "password": "SecureP@ss123",
    "skip_confirmation": true,
    "projects_limit": 100,
    "can_create_group": true,
    "admin": false
  }' \
  "https://gitlab.example.com/api/v4/users"

# 更新用户
curl --request PUT --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"name":"John D. Doe","projects_limit":200}' \
  "https://gitlab.example.com/api/v4/users/42"

# 查看当前用户
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/user"
```

### 封禁/解封/删除

```bash
# 封禁用户（block）
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/users/42/block"

# 解封用户
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/users/42/unblock"

# 停用用户（deactivate，比 block 轻量，用户再次登录自动恢复）
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/users/42/deactivate"

# 激活用户
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/users/42/activate"

# 删除用户（不可恢复！会删除该用户拥有的项目）
curl --request DELETE --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/users/42"

# 删除用户但保留其贡献（hard_delete=false，迁移资源给 Ghost 用户）
curl --request DELETE --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/users/42?hard_delete=false"
```

### SSH Keys 管理

```bash
# 列出用户的 SSH keys
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/user/keys"

# 添加 SSH key
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "title": "My Laptop",
    "key": "ssh-ed25519 AAAAC3Nza... user@laptop",
    "expires_at": "2026-12-31"
  }' \
  "https://gitlab.example.com/api/v4/user/keys"

# 管理员为指定用户添加 SSH key
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  --data "title=Deploy Key&key=ssh-ed25519 AAAAC3..." \
  "https://gitlab.example.com/api/v4/users/42/keys"

# 删除 SSH key
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/user/keys/5"
```

```python
import gitlab
gl = gitlab.Gitlab("https://gitlab.example.com", private_token="glpat-xxx")

# 搜索用户
users = gl.users.list(search="john")

# 创建用户（管理员）
user = gl.users.create({
    "email": "john@example.com", "username": "john",
    "name": "John Doe", "password": "SecureP@ss123",
    "skip_confirmation": True
})

# 封禁/解封
user.block()
user.unblock()
user.deactivate()
user.activate()

# SSH Keys
keys = user.keys.list()
user.keys.create({"title": "My Key", "key": "ssh-ed25519 AAAA..."})
```

## Groups API

### 创建/更新/子组

```bash
# 创建顶级组
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Engineering",
    "path": "engineering",
    "visibility": "private",
    "description": "Engineering team"
  }' \
  "https://gitlab.example.com/api/v4/groups"

# 创建子组
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "Backend",
    "path": "backend",
    "parent_id": 456,
    "visibility": "private"
  }' \
  "https://gitlab.example.com/api/v4/groups"

# 更新组
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"description":"Updated description","visibility":"internal"}' \
  "https://gitlab.example.com/api/v4/groups/456"

# 列出子组
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/subgroups"

# 删除组
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456"
```

**GitLab 17.0 变更：** `default_branch_protection` 已废弃，使用 `default_branch_protection_defaults` 替代（提供更细粒度的控制）。

```python
# python-gitlab
group = gl.groups.create({"name": "Engineering", "path": "engineering"})

# 创建子组
subgroup = gl.groups.create({
    "name": "Backend", "path": "backend", "parent_id": group.id
})

# 列出子组
subgroups = group.subgroups.list()

# 列出组内项目
projects = group.projects.list(iterator=True)
```

### 成员管理

```bash
# 列出组成员（仅直接成员，不含继承）
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/members"

# 列出所有成员（包含继承的）
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/members/all"

# 添加成员
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "user_id=42&access_level=30&expires_at=2025-12-31" \
  "https://gitlab.example.com/api/v4/groups/456/members"

# 更新成员权限
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --data "access_level=40" \
  "https://gitlab.example.com/api/v4/groups/456/members/42"

# 移除成员
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/members/42"
```

**access_level 枚举值：**
| 值 | 角色 | 说明 |
|---|---|---|
| `10` | Guest | 查看 Issue/Wiki |
| `15` | Planner | 管理 Issue（GitLab 16.x+） |
| `20` | Reporter | 查看代码、创建 Issue |
| `30` | Developer | Push 代码、创建 MR |
| `40` | Maintainer | 管理项目设置、合并 MR |
| `50` | Owner | 完全控制（仅 Group 级别） |

### 共享项目给组

```bash
# 将组共享给项目
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "group_id=789&group_access=30" \
  "https://gitlab.example.com/api/v4/projects/123/share"

# 取消共享
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/share/789"
```

## Project Members API

```bash
# 添加项目成员
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --data "user_id=42&access_level=30" \
  "https://gitlab.example.com/api/v4/projects/123/members"

# 更新成员角色
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --data "access_level=40" \
  "https://gitlab.example.com/api/v4/projects/123/members/42"

# 删除成员
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/members/42"
```

```python
project = gl.projects.get(123)

# 添加成员
member = project.members.create({"user_id": 42, "access_level": gitlab.const.DEVELOPER_ACCESS})

# 更新
member.access_level = gitlab.const.MAINTAINER_ACCESS
member.save()

# 删除
member.delete()

# python-gitlab 常量
# gitlab.const.GUEST_ACCESS = 10
# gitlab.const.REPORTER_ACCESS = 20
# gitlab.const.DEVELOPER_ACCESS = 30
# gitlab.const.MAINTAINER_ACCESS = 40
# gitlab.const.OWNER_ACCESS = 50
```

## Webhooks API

### 项目 Webhooks

```bash
# 创建项目 webhook
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://hooks.example.com/gitlab",
    "token": "webhook-secret-token",
    "push_events": true,
    "merge_requests_events": true,
    "pipeline_events": true,
    "tag_push_events": true,
    "issues_events": false,
    "enable_ssl_verification": true
  }' \
  "https://gitlab.example.com/api/v4/projects/123/hooks"

# 列出项目 webhooks
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/hooks"

# 测试 webhook
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/hooks/1/test/push_events"

# 删除 webhook
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/hooks/1"
```

### 组 Webhooks

```bash
curl --request POST --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://hooks.example.com/group",
    "token": "secret",
    "push_events": true,
    "merge_requests_events": true
  }' \
  "https://gitlab.example.com/api/v4/groups/456/hooks"
```

**常用事件类型：**
| 参数 | 触发事件 |
|---|---|
| `push_events` | 代码推送 |
| `merge_requests_events` | MR 创建/更新/合并 |
| `pipeline_events` | Pipeline 状态变更 |
| `tag_push_events` | Tag 创建/删除 |
| `issues_events` | Issue 变更 |
| `note_events` | 评论/Discussion |
| `job_events` | Job 状态变更 |
| `deployment_events` | 部署事件 |
| `releases_events` | Release 发布 |

### Secret Token 验证

Webhook 请求会携带 `X-Gitlab-Token` header，接收端需验证：

```python
from flask import Flask, request, abort
import hmac

app = Flask(__name__)

@app.route("/webhook", methods=["POST"])
def handle_webhook():
    token = request.headers.get("X-Gitlab-Token")
    if token != "webhook-secret-token":
        abort(403)

    event = request.headers.get("X-Gitlab-Event")
    payload = request.json

    if event == "Merge Request Hook":
        mr = payload["object_attributes"]
        print(f"MR #{mr['iid']}: {mr['title']} -> {mr['action']}")

    return "OK", 200
```

### System Hooks（实例级）

```bash
# 创建 system hook（需要管理员权限）
curl --request POST --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://hooks.example.com/system",
    "token": "system-secret",
    "push_events": true,
    "merge_requests_events": true,
    "repository_update_events": true
  }' \
  "https://gitlab.example.com/api/v4/hooks"

# 列出 system hooks
curl --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/hooks"
```

**System Hook 独有事件：** `project_create`、`project_destroy`、`project_rename`、`project_transfer`、`user_create`、`user_destroy`、`group_create`、`group_destroy`、`key_create`、`key_destroy`

## Audit Events API

### 实例级（需要管理员）

```bash
curl --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/audit_events?created_after=2024-01-01&created_before=2024-12-31"
```

### 组级

```bash
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/audit_events?per_page=50"
```

### 项目级

```bash
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/audit_events"
```

**GitLab 17.8 变更：** Audit Events API 的 offset 分页已废弃（计划 19.0 移除），请使用 keyset 分页。

```python
# python-gitlab
# 项目级审计事件
events = project.audit_events.list(iterator=True)
for event in events:
    print(f"{event.created_at}: {event.author['name']} - {event.entity_type}")

# 组级审计事件
group = gl.groups.get(456)
events = group.audit_events.list(iterator=True)
```

## 应用设置 API（Application Settings）

需要实例管理员权限。

```bash
# 查看当前设置
curl --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  "https://gitlab.example.com/api/v4/application/settings"

# 更新设置
curl --request PUT --header "PRIVATE-TOKEN: $ADMIN_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "signup_enabled": false,
    "default_project_visibility": "internal",
    "max_attachment_size": 50,
    "container_registry_token_expire_delay": 30,
    "require_two_factor_authentication": true,
    "two_factor_grace_period": 48
  }' \
  "https://gitlab.example.com/api/v4/application/settings"
```

**常用设置项：**
| 设置 | 说明 |
|---|---|
| `signup_enabled` | 是否允许自助注册 |
| `default_project_visibility` | 新项目默认可见性（`private`/`internal`/`public`） |
| `max_attachment_size` | 附件大小上限（MB） |
| `require_two_factor_authentication` | 强制 2FA |
| `password_authentication_enabled_for_web` | Web 登录密码认证 |
| `container_registry_token_expire_delay` | Registry token 过期时间（分钟） |
| `throttle_authenticated_api_requests_per_period` | API 限流阈值 |

**缓存说明：** 应用设置默认缓存 60 秒，修改后可能不会立即生效。

## 常见陷阱

- **Users API 需要管理员**：创建/更新/删除/封禁用户都需要管理员权限的 Token
- **删除用户会删除其项目**：默认行为会连带删除该用户拥有的所有项目，使用 `hard_delete=false` 可保留贡献并转移给 Ghost 用户
- **`/members` vs `/members/all`**：前者仅返回直接成员，后者包含从父组继承的成员
- **组 Webhook 覆盖所有子项目**：组级 Webhook 会接收所有子项目和子组的事件。如果项目也配了相同 Webhook，会触发两次
- **System Hook 事件格式不同**：System Hook 的 payload 结构与项目/组 Webhook 不同，不能复用同一个处理逻辑
- **Audit Events offset 分页即将废弃**（17.8）：迁移到 keyset 分页，计划在 19.0 移除 offset 支持
- **`default_branch_protection` 已废弃**（17.0）：Groups API 中使用 `default_branch_protection_defaults` 替代
- **GitLab 17.0 Runner API 变更**：`ip_address` 字段返回空字符串，不再暴露 Runner IP
- **GitLab 18.0 预告**：Runner API 中 `version`、`revision`、`platform`、`architecture` 字段将返回空字符串（v5 中完全移除）
- **Application Settings 缓存 60 秒**：修改后需要等待缓存过期才能看到效果

## 组合提示

- 搭配 `gitlab-api-core` 了解认证方式和管理员 Token 的 scope 要求
- 搭配 `gitlab-projects` 管理项目级别的操作（分支保护、Merge Request 规则）
- 搭配 `gitlab-ci` 管理实例级 CI/CD 变量和 Runner
- 搭配 `gitlab-graphql` 使用 GraphQL 查询审计事件流（Audit Event Streaming）
- 搭配 `gitlab-registry` 配置实例级 Container/Package Registry 策略
