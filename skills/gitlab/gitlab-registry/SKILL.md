---
name: gitlab-registry
description: "GitLab Container Registry、Package Registry 与 Dependency Proxy API"
tech_stack: [gitlab, backend]
---

# GitLab Registry API

> 来源：https://docs.gitlab.com/api/container_registry/ / https://docs.gitlab.com/user/packages/package_registry/
> 版本基准：GitLab 17.x（self-managed / SaaS）

## 用途

通过 API 管理 Container Registry（Docker 镜像）、Package Registry（通用包、PyPI、npm、Maven 等）和 Dependency Proxy（镜像代理缓存），实现 CI/CD 中的自动化发布与清理。

## 何时使用

- CI/CD 中自动发布 Docker 镜像并管理 Tag 清理
- 发布和下载通用包（Generic Package）
- 配置 PyPI/npm/Maven 私有仓库
- 清理旧镜像释放存储空间
- 配置 Dependency Proxy 加速 Docker Hub 拉取

## Container Registry API

### 列出 Repositories

```bash
# 列出项目的所有 container repositories
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/registry/repositories"

# 响应示例
# [{"id":1,"name":"","path":"group/project","project_id":123,"location":"registry.example.com/group/project",...}]

# 列出组内所有 repositories
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/registry/repositories"
```

### 列出/删除 Tags

```bash
# 列出某个 repository 的所有 tags
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/registry/repositories/1/tags"

# 查看特定 tag 详情（包含 size）
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/registry/repositories/1/tags/latest"
# 响应包含：name, path, location, revision, short_revision, digest, created_at, total_size

# 删除单个 tag
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/registry/repositories/1/tags/v1.0.0"

# 批量删除 tags（正则匹配）
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "name_regex_delete": "^v\\d+\\.\\d+\\.\\d+-rc",
    "name_regex_keep": "^latest$",
    "keep_n": 5,
    "older_than": "30d"
  }' \
  "https://gitlab.example.com/api/v4/projects/123/registry/repositories/1/tags"
```

**批量删除参数：**
| 参数 | 说明 |
|---|---|
| `name_regex_delete` | 匹配要删除的 tag 名（正则）；默认 `.*` |
| `name_regex_keep` | 匹配要保留的 tag 名（正则）；优先于 delete |
| `keep_n` | 保留最新的 N 个 tag（按 `created_at` 排序） |
| `older_than` | 仅删除超过此时长的 tag（如 `7d`、`1month`） |

**注意：** GitLab.com 上每次调用有删除数量上限，大量 tag 需多次调用。

### 删除 Repository

```bash
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/registry/repositories/1"
```

### python-gitlab 操作

```python
import gitlab
gl = gitlab.Gitlab("https://gitlab.example.com", private_token="glpat-xxx")
project = gl.projects.get(123)

# 列出 repositories
repos = project.repositories.list()

# 列出 tags
repo = repos[0]
tags = repo.tags.list()

# 查看 tag 详情
tag = repo.tags.get("latest")
print(f"Size: {tag.total_size}, Created: {tag.created_at}")

# 删除 tag
repo.tags.delete("v1.0.0-rc1")

# 批量删除
repo.tags.delete_in_bulk(
    name_regex_delete="^v.*-rc",
    keep_n=5,
    older_than="30d"
)
```

### 清理策略配置

通过项目设置 API 配置自动清理：

```bash
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "container_expiration_policy_attributes": {
      "enabled": true,
      "cadence": "7d",
      "name_regex_delete": ".*",
      "name_regex_keep": "^(main|latest|stable)$",
      "keep_n": 10,
      "older_than": "14d"
    }
  }' \
  "https://gitlab.example.com/api/v4/projects/123"
```

**cadence 选项：** `1d`、`7d`、`14d`、`1month`、`3month`

## Package Registry API

### Generic Package（通用包）

最灵活的包格式，适合任意文件的版本化管理。

```bash
# 上传文件
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --upload-file dist/app-1.0.0.tar.gz \
  "https://gitlab.example.com/api/v4/projects/123/packages/generic/my-app/1.0.0/app-1.0.0.tar.gz"

# 上传时指定发布状态
curl --request PUT --header "PRIVATE-TOKEN: $TOKEN" \
  --upload-file dist/app.tar.gz \
  "https://gitlab.example.com/api/v4/projects/123/packages/generic/my-app/1.0.0/app.tar.gz?status=hidden"
# status: default(默认)、hidden（不在 UI 显示）

# 下载文件
curl --header "PRIVATE-TOKEN: $TOKEN" --output app.tar.gz \
  "https://gitlab.example.com/api/v4/projects/123/packages/generic/my-app/1.0.0/app-1.0.0.tar.gz"

# CI/CD 中使用 Job Token
curl --header "JOB-TOKEN: $CI_JOB_TOKEN" --upload-file dist/app.tar.gz \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/my-app/${CI_COMMIT_TAG}/app.tar.gz"
```

**SHA256 校验：** 上传后自动计算并存储 SHA256，下载时可通过响应头验证完整性。

### PyPI 发布与安装

```bash
# 使用 twine 发布（项目级）
TWINE_PASSWORD=$TOKEN TWINE_USERNAME=__token__ \
  python3 -m twine upload \
  --repository-url "https://gitlab.example.com/api/v4/projects/123/packages/pypi" \
  dist/*

# CI/CD 中发布
TWINE_PASSWORD=$CI_JOB_TOKEN TWINE_USERNAME=gitlab-ci-token \
  python3 -m twine upload \
  --repository-url "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/pypi" \
  dist/*

# pip 安装（项目级）
pip install my-package \
  --index-url "https://__token__:${TOKEN}@gitlab.example.com/api/v4/projects/123/packages/pypi/simple"

# pip 安装（组级，搜索组内所有项目的包）
pip install my-package \
  --index-url "https://__token__:${TOKEN}@gitlab.example.com/api/v4/groups/456/-/packages/pypi/simple"
```

### npm 发布与安装

```bash
# 配置 registry（项目级）
npm config set @myscope:registry "https://gitlab.example.com/api/v4/projects/123/packages/npm/"
npm config set -- "//gitlab.example.com/api/v4/projects/123/packages/npm/:_authToken" "$TOKEN"

# 发布
npm publish

# CI/CD 中使用 .npmrc
echo "@myscope:registry=https://${CI_SERVER_HOST}/api/v4/projects/${CI_PROJECT_ID}/packages/npm/
//${CI_SERVER_HOST}/api/v4/projects/${CI_PROJECT_ID}/packages/npm/:_authToken=${CI_JOB_TOKEN}" > .npmrc
npm publish

# 安装（组级 registry，搜索组内所有包）
npm config set @myscope:registry "https://gitlab.example.com/api/v4/groups/456/-/packages/npm/"
npm install @myscope/my-package
```

### Maven 发布与安装

```xml
<!-- pom.xml - 配置 repository -->
<repositories>
  <repository>
    <id>gitlab-maven</id>
    <url>https://gitlab.example.com/api/v4/projects/123/packages/maven</url>
  </repository>
</repositories>

<distributionManagement>
  <repository>
    <id>gitlab-maven</id>
    <url>https://gitlab.example.com/api/v4/projects/123/packages/maven</url>
  </repository>
</distributionManagement>
```

```xml
<!-- settings.xml - 认证 -->
<servers>
  <server>
    <id>gitlab-maven</id>
    <configuration>
      <httpHeaders>
        <property><name>Private-Token</name><value>glpat-xxxx</value></property>
      </httpHeaders>
    </configuration>
  </server>
</servers>
```

### 包管理 API

```bash
# 列出项目的所有包
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/packages?sort=desc&order_by=version"

# 列出组内所有包
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/packages"

# 删除包
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/packages/789"

# 列出包的文件
curl --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/projects/123/packages/789/package_files"
```

```python
project = gl.projects.get(123)

# 列出包
packages = project.packages.list()

# 按名称/类型过滤
pypi_pkgs = project.packages.list(package_type="pypi", package_name="my-lib")

# 删除包
package = project.packages.get(789)
package.delete()
```

### 认证方式速查

| 方法 | Token 类型 | 用户名 |
|---|---|---|
| PAT | Private Token | `__token__` |
| Project/Group Token | Access Token | `__token__` |
| CI/CD Job Token | `$CI_JOB_TOKEN` | `gitlab-ci-token` |
| Deploy Token | Deploy Token | deploy token 用户名 |

**所需 Scope：** 读取需 `read_package_registry`，写入需 `write_package_registry`（或 `api`）。

## Dependency Proxy API

组级别的 Docker Hub 拉取代理缓存，减少外部网络依赖和被限流风险。

```bash
# 通过 Dependency Proxy 拉取镜像
docker pull gitlab.example.com/mygroup/dependency_proxy/containers/alpine:3.19

# CI/CD 中使用（推荐）
# .gitlab-ci.yml
# image: ${CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX}/alpine:3.19
```

**TTL 缓存策略：** 默认 90 天未访问的缓存自动清理。可在 Group Settings > Packages and registries > Dependency Proxy 中配置。

**Dependency Proxy Scope：** `read_virtual_registry`（拉取）、`write_virtual_registry`（填充/清理缓存）。

```bash
# 清除组的 Dependency Proxy 缓存
curl --request DELETE --header "PRIVATE-TOKEN: $TOKEN" \
  "https://gitlab.example.com/api/v4/groups/456/dependency_proxy/cache"
```

## 常见陷阱

- **Container Registry 批量删除有上限**：GitLab.com 单次执行时间有限，大量 tag 需多次调用 API
- **清理策略不会立即释放空间**：删除 tag 后需等待 Garbage Collection 实际回收存储（self-managed 需手动触发 GC）
- **Generic Package 不支持覆盖**：同名同版本同文件名会返回 403，需要先删除或用新版本号
- **PyPI 用户名差异**：PAT 使用 `__token__`，Job Token 使用 `gitlab-ci-token`，Deploy Token 使用实际 token 用户名
- **npm scope 必须匹配**：`package.json` 中的 `@scope` 必须与 npm config 配置的 scope 一致
- **组级 registry vs 项目级 registry**：发布只能到项目级，安装可以从组级（搜索组内所有项目的包）
- **`name_regex_delete` 默认 `.*`**：不传此参数等于删除所有匹配的 tag，务必设置 `name_regex_keep` 或 `keep_n`
- **镜像 size 只在获取单个 tag 详情时返回**：列出 tags 的响应中不包含 `total_size` 字段

## 组合提示

- 搭配 `gitlab-api-core` 了解 Token 认证方式
- 搭配 `gitlab-ci` 使用 CI/CD Job Token 在流水线中发布包和镜像
- 搭配 `gitlab-admin` 配置实例级 Registry 和存储管理
