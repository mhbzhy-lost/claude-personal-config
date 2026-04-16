---
name: k8s-helm
description: "Helm 3 包管理：Chart 结构、模板语法、依赖管理、Hooks 与发布管理"
tech_stack: [kubernetes, backend]
---

# Helm 3 包管理

> 来源：https://helm.sh/docs/
> 版本基准：Helm 3.x（无 Tiller）

## 用途

Helm 是 Kubernetes 的包管理器，将多个 Kubernetes 资源定义（Deployment、Service、ConfigMap 等）打包为可复用、可版本化、可参数化的 Chart，简化应用的安装、升级、回滚和分发。

## 何时使用

- 需要将一组 Kubernetes 资源作为一个整体部署和管理
- 需要在不同环境（dev/staging/prod）使用不同参数部署同一应用
- 需要复用社区维护的应用包（如 nginx、postgresql、prometheus）
- 需要管理多个微服务间的依赖关系
- 需要应用的版本化发布与回滚

## Helm 3 架构

Helm 3 移除了服务端组件 Tiller，直接通过 kubeconfig 与 Kubernetes API 交互。

核心概念：
- **Chart**：Helm 包，包含一组 Kubernetes 资源模板和默认配置
- **Release**：Chart 的一次部署实例，同一 Chart 可创建多个 Release
- **Repository**：Chart 的存储仓库（HTTP 服务器或 OCI 注册表）
- **Values**：覆盖 Chart 默认配置的参数

## Chart 目录结构

```
mychart/
  Chart.yaml              # Chart 元数据（必须）
  Chart.lock              # 依赖版本锁定（自动生成）
  values.yaml             # 默认配置值（必须）
  values.schema.json      # values 的 JSON Schema 校验（可选）
  charts/                 # 依赖 Chart 的 .tgz 文件（自动管理）
  crds/                   # Custom Resource Definitions
  templates/              # Kubernetes manifest 模板
    deployment.yaml
    service.yaml
    ingress.yaml
    configmap.yaml
    hpa.yaml
    pdb.yaml
    serviceaccount.yaml
    _helpers.tpl          # 模板辅助函数（以 _ 开头不生成 manifest）
    NOTES.txt             # 安装后的提示信息
    tests/                # 测试模板
      test-connection.yaml
  .helmignore             # 打包时忽略的文件
```

## Chart.yaml

```yaml
apiVersion: v2                      # Helm 3 必须为 v2
name: myapp
version: 1.2.0                     # Chart 版本（SemVer）
appVersion: "2.0.0"                # 应用版本（展示用，不影响逻辑）
description: A web application chart
type: application                   # application（默认）或 library
kubeVersion: ">=1.26.0"            # 兼容的 K8s 版本范围
keywords:
  - web
  - api
home: https://github.com/org/myapp
sources:
  - https://github.com/org/myapp
maintainers:
  - name: DevOps Team
    email: devops@example.com

# 依赖管理
dependencies:
  - name: postgresql
    version: "~13.0"               # SemVer 范围
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled   # 由 values 控制是否启用
    alias: db                       # 别名，values 中用 db.* 引用
  - name: redis
    version: ">=18.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
    tags:
      - cache                       # 按 tag 分组启停
```

## values.yaml

```yaml
replicaCount: 3
image:
  repository: myregistry/myapp
  tag: "2.0.0"
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: app.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: app-tls
      hosts: [app.example.com]
resources:
  requests: { cpu: "200m", memory: "256Mi" }
  limits: { cpu: "1", memory: "512Mi" }
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
# 依赖配置（key 与 Chart.yaml 中 dependency name/alias 对应）
postgresql:
  enabled: true
  auth: { postgresPassword: "changeme", database: myapp }
redis:
  enabled: false
```

## 模板语法

Helm 使用 Go template 引擎，通过内置对象和函数渲染 Kubernetes manifest。

### 内置对象

| 对象 | 说明 | 示例 |
|------|------|------|
| `.Values` | values.yaml 或 --set 提供的值 | `{{ .Values.image.tag }}` |
| `.Release` | 发布信息 | `{{ .Release.Name }}`, `{{ .Release.Namespace }}` |
| `.Chart` | Chart.yaml 中的元数据 | `{{ .Chart.Name }}`, `{{ .Chart.Version }}` |
| `.Template` | 当前模板文件信息 | `{{ .Template.Name }}` |
| `.Capabilities` | 集群能力信息 | `{{ .Capabilities.KubeVersion }}` |
| `.Files` | 非模板文件访问 | `{{ .Files.Get "config.ini" }}` |

### templates/deployment.yaml 示例

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 8080
          protocol: TCP
        {{- if .Values.resources }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        {{- end }}
        envFrom:
        - configMapRef:
            name: {{ include "myapp.fullname" . }}
        {{- range .Values.extraEnvVars }}
        env:
        - name: {{ .name }}
          value: {{ .value | quote }}
        {{- end }}
```

### templates/_helpers.tpl（辅助模板）

以 `_` 开头的文件不生成 manifest，用于定义可复用的命名模板。常见模式：

```yaml
{{/* 生成完整名称（截断到 63 字符以符合 DNS 规范） */}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (default .Chart.Name .Values.nameOverride) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/* Selector labels（Deployment selector 与 Pod label 共用） */}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* 通用 labels（在 selectorLabels 基础上增加 chart 版本信息） */}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 }}
{{ include "myapp.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

### 常用模板技巧

```yaml
# 条件判断
{{- if .Values.ingress.enabled }}
  ...
{{- end }}

# 循环
{{- range .Values.ingress.hosts }}
- host: {{ .host | quote }}
  http:
    paths:
    {{- range .paths }}
    - path: {{ .path }}
      pathType: {{ .pathType }}
    {{- end }}
{{- end }}

# with 切换作用域
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 8 }}
{{- end }}

# default 函数（提供默认值）
image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default "latest" }}"

# quote 确保字符串类型
value: {{ .Values.port | quote }}

# toYaml + nindent 嵌入复杂结构
resources:
  {{- toYaml .Values.resources | nindent 2 }}

# required 强制必填
{{ required "image.repository is required" .Values.image.repository }}

# lookup 查询集群现有资源
{{- $secret := lookup "v1" "Secret" .Release.Namespace "my-secret" }}
{{- if $secret }}
  # Secret 已存在
{{- end }}

# tpl 渲染字符串中的模板
{{ tpl .Values.dynamicAnnotation . }}
```

## 依赖管理

### 管理依赖

```bash
# 下载依赖到 charts/ 目录
helm dependency update ./mychart

# 查看依赖列表
helm dependency list ./mychart

# 重建 Chart.lock
helm dependency build ./mychart
```

### 依赖的条件与标签

```yaml
# Chart.yaml
dependencies:
  - name: postgresql
    version: "~13.0"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled       # values.yaml 中控制
  - name: redis
    version: ">=18.0.0"
    repository: https://charts.bitnami.com/bitnami
    tags:
      - cache
```

```yaml
# values.yaml
postgresql:
  enabled: true                         # condition 控制

tags:
  cache: false                          # tag 控制（批量启停）
```

### 覆盖依赖的 values

```yaml
# values.yaml 中用依赖名（或 alias）作为 key
postgresql:
  enabled: true
  auth:
    postgresPassword: "mypassword"
    database: "mydb"
  primary:
    persistence:
      size: 50Gi
```

## Helm Hooks

Hooks 是带有特殊注解的模板，在 Release 生命周期的特定时间点执行。

### Hook 类型

| Hook | 触发时机 |
|------|----------|
| pre-install | install 前，模板渲染后 |
| post-install | 所有资源加载到 K8s 后 |
| pre-delete | delete 前 |
| post-delete | delete 后 |
| pre-upgrade | upgrade 前，模板渲染后 |
| post-upgrade | 所有资源更新后 |
| pre-rollback | rollback 前 |
| post-rollback | rollback 后 |
| test | `helm test` 时执行 |

### Hook 示例：数据库迁移

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "myapp.fullname" . }}-db-migrate
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"              # 权重越小越先执行
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        command: ["./migrate", "up"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "myapp.fullname" . }}-db
              key: url
```

### Hook 删除策略

| 策略 | 行为 |
|------|------|
| before-hook-creation | 新 hook 运行前删除旧的 hook 资源 |
| hook-succeeded | hook 成功后删除 |
| hook-failed | hook 失败后删除 |

## 发布管理

### 常用命令

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update
helm search repo postgresql                                 # 搜索本地仓库

# install-or-upgrade（幂等，推荐 CI/CD 使用）
helm upgrade --install myapp ./mychart -n production \
  --create-namespace -f values-prod.yaml --set image.tag=2.1.0 --wait --timeout 10m

helm list -n production                                     # 查看 Release 列表
helm history myapp -n production                            # 查看发布历史
helm rollback myapp 3 -n production                         # 回滚到 revision 3
helm template myapp ./mychart -f values-prod.yaml           # 渲染 manifest（调试）
helm upgrade --install myapp ./mychart --dry-run --debug     # dry-run 验证
helm get values myapp -n production --all                   # 查看当前 values
helm uninstall myapp -n production                          # 卸载
helm package ./mychart                                      # 打包
helm push mychart-1.2.0.tgz oci://registry.example.com/charts  # 推送 OCI
```

### Values 优先级（从低到高）

1. Chart 内的 `values.yaml`（最低）
2. 父 Chart 的 `values.yaml`
3. `-f` / `--values` 指定的文件（多个文件按顺序，后者覆盖前者）
4. `--set` / `--set-string` / `--set-json` / `--set-file`（最高）

## 常见陷阱

- **`{{-` 与 `{{` 的空白控制**：`{{-` 会吃掉左侧空白（包括换行），不当使用会破坏 YAML 缩进
- **nindent vs indent**：`nindent` 先换行再缩进，`indent` 不换行；管道中使用 `| nindent N` 是最常见写法
- **toYaml 的缩进问题**：`toYaml .Values.resources` 不带缩进，必须配合 `nindent` 使用
- **字符串类型的数字**：YAML 中 `port: 80` 是整数，`port: "80"` 是字符串；需要字符串时用 `{{ .Values.port | quote }}`
- **依赖 condition 默认值**：如果 values.yaml 中未设置 `postgresql.enabled`，condition 判定为 false（依赖不启用）
- **Hook 资源不受 `helm uninstall` 管理**：未设置 `hook-delete-policy` 的 Hook 资源不会被 `helm uninstall` 清理
- **`--wait` 不等待 Hook**：`--wait` 只等待常规资源 Ready，不等待 Hook Job 完成
- **Chart.lock 未提交**：`Chart.lock` 应提交到版本控制，确保团队成员使用相同的依赖版本
- **OCI 仓库 URL 格式**：OCI 引用使用 `oci://` 前缀，不需要 `helm repo add`
- **Release 名称全局唯一性**：Helm 3 中 Release 名称在 Namespace 级别唯一（不同 Namespace 可同名），但建议保持全局唯一以避免混淆

## 组合提示

- 与 **k8s-core** 搭配：Chart 模板化 Deployment、Service 等核心资源
- 与 **k8s-config** 搭配：通过 values.yaml 渲染 ConfigMap 和 Secret 模板
- 与 **k8s-networking** 搭配：模板化 Ingress 资源，通过 values 控制域名和 TLS 配置
- 与 **k8s-scaling** 搭配：HPA 配置参数化，通过 values 控制是否启用自动伸缩
- 与 **k8s-deployment** 搭配：`helm upgrade --wait` 等待滚动更新完成，`helm rollback` 触发版本回退
- 与 **k8s-storage** 搭配：volumeClaimTemplates 参数化存储类型和容量
- 结合 ArgoCD / Flux 实现 GitOps 自动化部署
