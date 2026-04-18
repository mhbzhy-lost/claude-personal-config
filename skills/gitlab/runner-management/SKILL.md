---
name: gitlab-runner-management
description: GitLab Runner 注册、执行器选型、自动伸缩与多级作用域管理实践
tech_stack: [gitlab, gitlab-runner]
capability: [ci-cd]
version: "gitlab-runner unversioned"
collected_at: 2026-04-18
---

# GitLab Runner 管理

> 来源：https://docs.gitlab.com/runner/executors/ ； https://docs.gitlab.com/runner/register/ ； https://docs.gitlab.com/runner/runner_autoscale/ ； https://docs.gitlab.com/ci/runners/runners_scope/

## 用途
在独立主机上安装并注册 GitLab Runner 以执行 CI/CD 作业，选择合适的 executor、作用域（instance/group/project）和自动伸缩策略，支撑不同隔离级别与弹性需求。

## 何时使用
- 为 GitLab 实例、群组或项目配置专用 Runner
- 在 Linux/macOS/Windows/FreeBSD/Docker/K8s 环境注册 Runner
- 需要在云上按需伸缩 CI 作业容量（Docker Autoscaler / Instance / K8s）
- 迁移废弃的 registration token 到 authentication token（`glrt-` 前缀）
- 排查 Runner 401/410/注册被拒等问题

## 基础用法

非交互式注册（推荐，Linux + Docker executor）：
```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "$RUNNER_TOKEN" \
  --executor "docker" \
  --docker-image alpine:latest \
  --description "docker-runner"
```

交互式：`sudo gitlab-runner register`，依次输入 GitLab URL、authentication token、描述、tags、维护注释、executor。

Docker 容器中注册（配置持久化到 volume）：
```bash
docker run --rm -it -v /srv/gitlab-runner/config:/etc/gitlab-runner \
  gitlab/gitlab-runner register
```

## Executor 选型

| Executor | 特点 | 适用场景 |
|---|---|---|
| Kubernetes | 云原生，伸缩能力最佳 | 已有 K8s 集群 |
| Docker | 容器化隔离，干净环境 | 大多数通用 CI 作业 |
| Docker Autoscaler | Docker + fleeting 插件弹性伸缩 | 动态负载 |
| Instance | 按需创建整机，作业可获完整主机权限 | 需要特权/完整 VM |
| Shell | 本地执行，最简单但几乎无隔离 | 受控环境/简单脚本 |
| SSH | 连接外部服务器，支持度最弱 | 遗留系统 |

Legacy（仅安全更新）：Parallels、VirtualBox、Docker Machine、Custom。

## 作用域（Runner Scope）

- **Instance runner**：全实例共享，采用 "fair usage" 队列（按项目当前运行任务数分配）
- **Group runner**：群组内全部项目/子群组可用，FIFO 队列
- **Project runner**：绑定特定项目，FIFO；首个关联项目为所有者，所有者删除时所有权转移到最早关联的项目

## 关键 CLI 参数

- `--url`：GitLab 实例地址
- `--token "$RUNNER_TOKEN"`：authentication token（`glrt-` 前缀）
- `--executor`：`docker` / `docker-windows` / `kubernetes` / `shell` / `instance` 等
- `--docker-image`：默认镜像
- `--tag-list "docker,aws"`：作业标签
- `--run-untagged=true|false`：是否接受无标签作业
- `--locked=true|false`：锁定到单一项目
- `--access-level="ref_protected" | "not_protected"`：受保护分支隔离
- `--maintenance-note`：≤255 字符
- `--template-config /path/file.toml`：使用 TOML 模板注入 `register` 命令不支持的字段

## 配置模板示例（K8s + 自定义 volume）

```toml
[[runners]]
  [runners.kubernetes]
  [runners.kubernetes.volumes]
    [[runners.kubernetes.volumes.empty_dir]]
      name = "empty_dir"
      mount_path = "/path/to/empty_dir"
      medium = "Memory"
```

注册时：
```bash
sudo gitlab-runner register \
  --template-config /tmp/test-config.template.toml \
  --non-interactive --url "https://gitlab.com" \
  --token "$RUNNER_TOKEN" --name test-runner --executor kubernetes
```

**合并优先级**：命令行参数 / 环境变量 > 模板文件。

## Docker Machine 自动伸缩（AWS 示例，legacy）

```toml
[runners.machine]
  IdleCount = 1
  IdleTime = 1800
  MaxBuilds = 10
  MachineDriver = "amazonec2"
  MachineName = "gitlab-docker-machine-%s"
  MachineOptions = [
    "amazonec2-region=eu-central-1",
    "amazonec2-vpc-id=vpc-xxxxx",
    "amazonec2-subnet-id=subnet-xxxxx",
    "amazonec2-use-private-address=true",
    "amazonec2-security-group=xxxxx",
  ]
```

推荐使用 IAM instance profile 代替 access key。新建议优先选 **Instance Executor** 或 **Docker Autoscaler** 替代 Docker Machine。

## Runner 状态

- `online`：2 小时内有心跳
- `offline`：超 2 小时无心跳
- `stale`：超 7 天无心跳
- `never_contacted`：从未连接

## 注意事项

- **Registration token 已废弃**，GitLab 20.0 将移除，新建必须用 authentication token（`glrt-` 前缀），由 UI 创建 Runner 时生成
- 非 Docker executor 要求目标机器已安装 Git 并加入 PATH；Git LFS 需 `git lfs install`
- Docker 容器中运行 `gitlab-runner restart` 只会启动新进程，必须重启容器才生效
- 高可用：至少部署 **两个** 相同 tags 的 runner manager 避免单点
- `--access-level=ref_protected` 后的 Runner 仅能跑受保护分支作业
- Runner manager 必须独立主机（Ubuntu/Debian/CentOS/RHEL），与 GitLab 主机分离
- Group runner 清理 3+ 月不活跃（stale）功能需 Ultimate + GitLab 15.1+
- 常见报错：`Check registration token` / `410 Gone - runner registration disallowed`，通常为 token 失效或实例/群组/项目级禁用了 token 注册

## 组合提示
- 与 `.gitlab-ci.yml` 作业的 `tags:` 字段配合做作业路由
- K8s executor 常与 `gitlab-security-scanning`（Docker/K8s executor 是前置依赖）配合
- 多 runner manager + fair usage 队列是 GitLab.com 的标准部署模式
