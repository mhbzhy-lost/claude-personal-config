---
name: kubernetes-gitops
description: 用 ArgoCD 的 Application/AppProject CRD 与 Flux Toolkit 以 Git 作为单一事实来源管理 K8s
tech_stack: [kubernetes, argocd, fluxcd]
capability: [orchestration, ci-cd]
version: "argo-cd unversioned; fluxcd unversioned"
collected_at: 2026-04-18
---

# Kubernetes GitOps（ArgoCD + Flux）

> 来源：argoproj/argo-cd docs · fluxcd.io/flux/concepts

## 用途
以声明式 Kubernetes 清单描述应用/项目/集群凭证，由 ArgoCD 或 Flux 控制器持续把 Git（或 OCI 注册表）中的期望状态 reconcile 到集群。

## 何时使用
- 多集群/多环境部署，需要可审计的变更轨迹
- 自举集群（bootstrap）到纯 GitOps 工作流
- 需要逻辑分组 + RBAC 隔离应用（AppProject / Tenancy）
- 需要 progressive delivery（canary / feature flag，通过 Flagger）

## 基础用法

**最小 Application（ArgoCD）**：
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io   # 级联删除必须
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: guestbook
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

**Helm 源**：在 `source` 中用 `chart: <name>` 替代 `path`，`repoURL` 指向 Helm 仓或 OCI registry（OCI 时仓库 secret 需 `enableOCI: "true"`）。

**私有仓库 Secret（HTTPS）**：
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: private-repo
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://github.com/org/private-repo
  username: my-user
  password: my-token
```
SSH 用 `sshPrivateKey`；GitHub App 用 `githubAppID` + `githubAppInstallationID` + `githubAppPrivateKey`。

## 关键 API（摘要）

**ArgoCD CRD**：
- `Application` — `source`(repoURL/path/chart/targetRevision) + `destination`(server/name+namespace)
- `AppProject` — `sourceRepos` / `destinations` / `clusterResourceWhitelist` / `namespaceResource[White|Black]list` / `roles`
- Cluster Secret — label `argocd.argoproj.io/secret-type: cluster`，字段 `name/server/namespaces/clusterResources/config`
- Repo Secret — label `argocd.argoproj.io/secret-type: repository`
- App-of-Apps 模式：一个 Application 创建其他 Applications

**ArgoCD 同步选项**（`spec.syncPolicy.syncOptions` 或资源注解 `argocd.argoproj.io/sync-options`）：
- `CreateNamespace=true` — 自动创建目标 namespace
- `ServerSideApply=true` — 启用服务端应用（管理 ArgoCD 自身时必需）
- `Prune=false` / `Prune=confirm` — 禁止或需确认剪除
- `Delete=false` / `Delete=confirm` — 保留资源不随应用删除
- `Replace=true` — 用 `kubectl replace/create` 替代 apply（破坏性）
- `Force=true,Replace=true` — 删除重建，破坏性
- `PruneLast=true` — 剪除作为最后一波
- `PrunePropagationPolicy=foreground|background|orphan`
- `ApplyOutOfSyncOnly=true` — 只同步 out-of-sync 资源
- `SkipDryRunOnMissingResource=true` — CRD 未装时跳过 dry-run
- `FailOnSharedResource=true` — 发现跨 Application 共享资源则失败
- `RespectIgnoreDifferences=true` — 同步阶段也尊重 ignoreDifferences
- `ClientSideApplyMigration=false` — 关闭字段所有权迁移
- `managedNamespaceMetadata` — 给 ArgoCD 创建的 namespace 打 label/annotation

**Flux 概念**：
- `Source`（GitRepository/OCIRepository/HelmRepository/Bucket）定期拉取产物
- `Kustomization` / `HelmRelease` reconcile（默认 5 分钟）
- Flux `bootstrap` 把 Flux 自身也以 GitOps 方式安装
- "Gitless GitOps"：OCI registry 作为唯一真相，Git 只作用户界面

## 注意事项
- 所有 `Application` / `AppProject` **必须装在 argocd namespace**（默认 `argocd`）
- 没有 `resources-finalizer.argocd.argoproj.io` finalizer，删 Application 不会级联删除资源
- 允许部署到 argocd namespace 的 Project 等同 admin，必须严控 RBAC 和 sourceRepos push 权限
- GitLab 仓库 URL **必须带 `.git` 后缀**，ArgoCD 不跟随 HTTP 301
- 管理 ArgoCD 自身（self-manage）时 **必须开 `ServerSideApply=true`**
- `Replace=true` 优先级高于 `ServerSideApply=true`；两者都可能破坏性重建资源导致停机
- 给 cluster secret 设置 `namespaces` 会为每个 namespace 各起一个 list/watch，易撑爆 kube-apiserver 空闲连接池
- `resource.respectRBAC: strict` 要求 controller 有 `SelfSubjectAccessReview` create 权限
- 添加 `resource.exclusions` 匹配已存在资源会显示 OutOfSync，需重启 controller 清理缓存
- `managedNamespaceMetadata` 生效前提是 `CreateNamespace=true`；若 Git 中已有同 namespace 的 manifest，后者覆盖前者
- Flux Kustomization 默认每 5 分钟 reconcile 一次，会还原手动改动，除非 suspend
- Secret mount 按间隔刷新（非实时），token 生命周期需长于刷新间隔
- 在 YAML 里引用 glob 时务必加引号，非法 glob 会导致整条规则被忽略

## 组合提示
与 `kubernetes-observability`（观测 ArgoCD 同步状态 metrics）、`kubernetes-network-policy`（限制 argocd-server 南北向流量）、Sealed Secrets / SOPS（加密存储 repo/cluster secret）常一起使用。
