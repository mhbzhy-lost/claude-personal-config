# Marketplace source 类型详细参考

`marketplace.json` 中每个 plugin 条目的 `source` 字段可以是**字符串**（简写相对路径）或**对象**（五种 source 类型之一）。

## 1. Relative path（同仓库）

monorepo 里 marketplace 与 plugin 放一块：

```json
{ "name": "my-plugin", "source": "./plugins/my-plugin" }
```

简写：字符串路径等价于 `{ "source": "path", "path": "./..." }`。路径相对于 `marketplace.json` 所在目录。

## 2. GitHub

```json
{
  "name": "github-plugin",
  "source": {
    "source": "github",
    "repo": "owner/plugin-repo"
  }
}
```

可选 pin：

```json
{
  "source": {
    "source": "github",
    "repo": "owner/plugin-repo",
    "ref": "v2.0.0",
    "sha": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  }
}
```

| 字段 | 说明 |
|------|------|
| `repo` | `owner/name` 形式，必填 |
| `ref` | 分支/tag/commit（推荐 tag） |
| `sha` | 额外 commit SHA 校验，防止 tag 被篡改 |

## 3. 任意 Git URL

GitLab / Bitbucket / 自建 Gitea 等：

```json
{
  "source": {
    "source": "url",
    "url": "https://gitlab.com/team/plugin.git"
  }
}
```

同样支持 `ref` / `sha`。

## 4. Git subdir（稀疏克隆 monorepo 子目录）

当 plugin 藏在大型 monorepo 的子目录里，不想拉整个仓库：

```json
{
  "name": "my-plugin",
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/acme-corp/monorepo.git",
    "path": "tools/claude-plugin"
  }
}
```

| 字段 | 说明 |
|------|------|
| `url` | Git 仓库 URL |
| `path` | 仓库内的子路径，该路径即 plugin 根 |
| `ref` / `sha` | 可选，同上 |

## 5. npm package

```json
{
  "name": "my-npm-plugin",
  "source": {
    "source": "npm",
    "package": "@acme/claude-plugin",
    "version": "2.1.0"
  }
}
```

| 字段 | 说明 |
|------|------|
| `package` | npm 包名 |
| `version` | 可固定版本或 semver 范围 |

适合已有 npm 发布流程的团队复用发布管线。

## 私有源鉴权

Claude Code 复用本地 Git 客户端凭据。CI 或自动更新要用环境变量：

```bash
export GITHUB_TOKEN=ghp_xxx
export GITLAB_TOKEN=glpat-xxx
export BITBUCKET_TOKEN=xxx
```

## ref / sha 选择建议

| 场景 | 推荐 |
|------|------|
| 稳定发布 | `ref: "vX.Y.Z"` + `sha: "<commit>"`（双保险） |
| 追最新 | `ref: "main"`（不推荐生产） |
| 单次审计冻结 | 仅用 `sha` |

tag 被 force push 覆盖时，有 `sha` 会直接拒绝更新，保护用户环境。
