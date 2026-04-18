---
name: elasticsearch-security
description: 配置 Elasticsearch 的 RBAC、DLS/FLS 与 API Key，管控数据访问
tech_stack: [elasticsearch]
capability: [auth, permission]
version: "elasticsearch unversioned"
collected_at: 2026-04-18
---

# Elasticsearch 安全与访问控制

> 来源：https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/user-roles

## 用途
通过 realm 认证用户、RBAC 授权、Document/Field Level Security 限制数据可见性、API Key 下发受限凭证。

## 何时使用
- 多租户或分部门的数据隔离（按 category / username 限制文档可见）
- 脱敏：对普通用户屏蔽敏感字段（如 `customer.handle`）
- 外部服务 / 跨集群访问，用 API Key 而非用户密码
- 集成 LDAP / AD / SAML / OIDC / JWT / Kerberos / PKI 的企业身份体系

## 核心模型
- **Realm**：认证服务（native、file、LDAP、AD、SAML、OIDC、JWT、PKI、Kerberos、custom）
- **Privilege**：对资源的一组动作集合，如 `read`、`manage`
- **Role**：命名的 privilege 集合（绑定 index / cluster / app）
- **User / Group**：多 role 的最终权限是并集
- **DLS**：限制可读文档（role 内 `query`）
- **FLS**：限制可读字段（role 内 `field_security`）

## 基础用法

### DLS：仅允许读 category=click 的文档
```json
{
  "indices": [{
    "names": ["events-*"],
    "privileges": ["read"],
    "query": { "match": { "category": "click" } }
  }]
}
```

### DLS：基于当前登录用户的模板查询
```json
{
  "indices": [{
    "names": ["my-index-000001"],
    "privileges": ["read"],
    "query": {
      "template": { "source": { "term": { "acl.username": "{{_user.username}}" } } }
    }
  }]
}
```
可用变量：`_user.username`、`_user.full_name`、`_user.email`、`_user.roles`、`_user.metadata`。

### FLS：grant 白名单
```json
{
  "indices": [{
    "names": ["events-*"],
    "privileges": ["read"],
    "field_security": { "grant": ["category", "@timestamp", "message"] }
  }]
}
```

### FLS：grant 全部但排除敏感字段
```json
{
  "indices": [{
    "names": ["*"],
    "privileges": ["read"],
    "field_security": { "grant": ["*"], "except": ["customer.handle"] }
  }]
}
```
通配符支持 `event_*`、`customer.*`。`_id / _index / _routing` 等元数据字段始终可见。

## API Key 三类
| 类型 | 用途 | 创建权限 |
|------|------|----------|
| User API key | 外部服务代表用户访问 ES/Kibana | `manage_api_key` / `manage_own_api_key` |
| Cross-cluster API key | 跨集群互联 | `manage_security` + Enterprise license |
| Managed API key | Kibana 后台任务自管 | 自动 |

- 个人 API Key 默认 90 天过期
- Key 创建后不可修改 name 和 type，仅可改权限 / metadata
- 只读查看需 `read_security`

## 多 role 合并规则（陷阱）
- **DLS 是 OR**：任一 role 的 query 命中即放行 → 赋予"无限制 role" 等于拆掉限制
- **FLS 是 union**：所有 role 可见字段并集
- 如果同时需要限文档和限字段，**按 index 物理拆分**数据，而不是叠 role

## 注意事项
- DLS/FLS 仅为**只读**场景设计，不要对开启 DLS/FLS 的 index 做写入
- DLS 不支持：`has_child` / `has_parent`、`now` 日期、terms lookup、suggester、profile、terms enum、`multi_match` 通配
- FLS/DLS 下禁用：update API、clone / shrink / split / alias 操作；模板化 stored script 无法完全缓存
- Token Service 仅在 HTTP TLS 启用时默认开启；API Key Service 默认开启

## 组合提示
- RBAC + DLS/FLS 组合做多租户，复杂场景用 index-per-tenant 替代单 index 多 role
- 跨集群搜索 / CCR 搭配 cross-cluster API key
- 外部系统集成走 service account + API key，避免使用用户密码
