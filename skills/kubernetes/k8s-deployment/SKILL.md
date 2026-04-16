---
name: k8s-deployment
description: "Kubernetes 部署策略：滚动更新、回滚、蓝绿部署、金丝雀部署与 PodDisruptionBudget"
tech_stack: [kubernetes]
---

# Kubernetes 部署策略

> 来源：https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
> 版本基准：Kubernetes 1.30+

## 用途

掌握 Kubernetes 中应用发布的核心策略：原生的滚动更新与回滚机制、通过 Service/Ingress 实现的蓝绿部署和金丝雀部署、以及通过 PodDisruptionBudget 保障可用性的方法。

## 何时使用

- 需要零停机更新应用版本
- 需要控制更新速度和失败回滚
- 需要在全量发布前对小范围用户验证新版本（金丝雀）
- 需要快速在新旧版本间切换（蓝绿）
- 在集群维护（节点升级/驱逐）时保障应用可用性

## 滚动更新（Rolling Update）

Kubernetes Deployment 的默认更新策略，逐步用新版本 Pod 替换旧版本。

### 核心配置

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 10
  selector:
    matchLabels:
      app: web-app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%                 # 更新时允许超出期望副本数的最大值
      maxUnavailable: 25%           # 更新时允许不可用的最大 Pod 数
  revisionHistoryLimit: 10          # 保留旧 ReplicaSet 的数量（用于回滚）
  minReadySeconds: 10               # Pod Ready 后等待多少秒才视为 Available
  progressDeadlineSeconds: 600      # 更新超时时间（秒），超时标记为 Failed
  template:
    metadata:
      labels:
        app: web-app
        version: v2
    spec:
      containers:
      - name: web
        image: myregistry/web-app:2.0.0
        ports:
        - containerPort: 8080
        readinessProbe:             # 必须配置！控制滚动更新节奏
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          failureThreshold: 3
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 10
        resources:
          requests:
            cpu: "200m"
            memory: "256Mi"
          limits:
            cpu: "1"
            memory: "512Mi"
      terminationGracePeriodSeconds: 30
```

### maxSurge 与 maxUnavailable 策略组合

| maxSurge | maxUnavailable | 行为 | 适用场景 |
|----------|----------------|------|----------|
| 25% | 25% | 默认值，平衡速度与资源 | 通用场景 |
| 1 | 0 | 先启动新 Pod 再终止旧 Pod，零不可用 | 高可用要求 |
| 0 | 1 | 先终止旧 Pod 再启动新 Pod，节省资源 | 资源紧张 |
| 50% | 0 | 快速更新，但需要额外 50% 资源 | 快速发布 |

### 优雅终止配置

```yaml
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60     # 给进程 60 秒完成退出
      containers:
      - name: web
        lifecycle:
          preStop:
            exec:
              command:
              - /bin/sh
              - -c
              - "sleep 10 && kill -SIGTERM 1"   # 等待 LB 摘流量后再停止
```

优雅终止流程：
1. Pod 被标记为 Terminating
2. Endpoints Controller 从 Service 中移除该 Pod
3. 执行 `preStop` hook
4. 发送 SIGTERM 到容器主进程
5. 等待 `terminationGracePeriodSeconds`
6. 若进程未退出，发送 SIGKILL 强制终止

## Rollback（回滚）

### 查看发布历史

```bash
# 查看所有 revision
kubectl rollout history deployment/web-app

# 查看特定 revision 的详情
kubectl rollout history deployment/web-app --revision=3
```

### 执行回滚

```bash
# 回滚到上一个版本
kubectl rollout undo deployment/web-app

# 回滚到指定 revision
kubectl rollout undo deployment/web-app --to-revision=2
```

### 暂停与恢复发布

```bash
# 暂停（支持在暂停期间做多次修改，最后一次性发布）
kubectl rollout pause deployment/web-app

# 修改镜像
kubectl set image deployment/web-app web=myregistry/web-app:2.1.0

# 修改资源
kubectl set resources deployment/web-app -c=web --limits=cpu=2,memory=1Gi

# 恢复（一次性应用所有暂停期间的修改）
kubectl rollout resume deployment/web-app
```

### 监控发布状态

```bash
# 等待发布完成（超时返回非零退出码，适合 CI/CD）
kubectl rollout status deployment/web-app --timeout=5m

# 查看当前 rollout 事件
kubectl describe deployment/web-app
```

## 蓝绿部署（Blue-Green）

维护两套完整环境（蓝=当前版本，绿=新版本），通过切换 Service 的 selector 实现瞬间切换。

### 实现步骤

创建两个 Deployment（`web-app-blue` 和 `web-app-green`），区别仅在 version label 和镜像版本：

```yaml
# 蓝色 Deployment（labels 含 version: blue，image: 1.0.0）
# 绿色 Deployment（labels 含 version: green，image: 2.0.0）
# 两者共享 label：app: web-app

# Service 通过 selector 指向蓝色或绿色
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app
    version: blue               # 切换到 green 即完成发布
  ports:
  - port: 80
    targetPort: 8080
```

### 切换流量

```bash
# 切换 Service 到绿色环境
kubectl patch svc web-app -p '{"spec":{"selector":{"version":"green"}}}'

# 回滚：切回蓝色环境
kubectl patch svc web-app -p '{"spec":{"selector":{"version":"blue"}}}'

# 验证通过后清理旧环境
kubectl delete deployment web-app-blue
```

### 蓝绿部署优缺点

| 优势 | 劣势 |
|------|------|
| 瞬间切换，回滚极快 | 需要双倍资源 |
| 新旧版本完全隔离 | 数据库 schema 变更需兼容两个版本 |
| 可在绿色环境充分测试后再切 | 长时间运行两套环境成本高 |

## 金丝雀部署（Canary）

将一小部分流量导向新版本，逐步验证后扩大比例。

### 原生 Kubernetes 实现（基于副本数控制流量比例）

创建两个 Deployment，共享 `app: web-app` label，通过 `track: stable/canary` 区分：
- `web-app-stable`（replicas: 9，image: 1.0.0，labels: `app: web-app, track: stable`）
- `web-app-canary`（replicas: 1，image: 2.0.0，labels: `app: web-app, track: canary`）

```yaml
# Service 只匹配 app: web-app，同时覆盖 stable 和 canary 的 Pod
apiVersion: v1
kind: Service
metadata:
  name: web-app
spec:
  selector:
    app: web-app                  # 匹配两个 Deployment 的 Pod
  ports:
  - port: 80
    targetPort: 8080
# 流量比例 = 副本比（9:1 约 90%:10%）
```

### 逐步扩大金丝雀比例

```bash
# 10% -> 30%：扩大金丝雀副本数
kubectl scale deployment web-app-canary --replicas=3
kubectl scale deployment web-app-stable --replicas=7

# 30% -> 100%：完成发布
kubectl scale deployment web-app-canary --replicas=0
kubectl set image deployment/web-app-stable web=myregistry/web-app:2.0.0
kubectl scale deployment web-app-stable --replicas=10
```

### 基于 Ingress 的精确流量分割（NGINX Ingress）

```yaml
# 稳定版 Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app-stable
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-stable
            port:
              number: 80
---
# 金丝雀 Ingress（精确按百分比分流）
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"       # 10% 流量到金丝雀
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-app-canary
            port:
              number: 80
```

### 高级金丝雀工具

对于精确的流量控制和自动化渐进式发布，考虑：
- **Argo Rollouts**：CRD 替代 Deployment，支持自动化金丝雀和蓝绿发布
- **Flagger**：配合 Istio/Linkerd/NGINX 实现自动化金丝雀分析与回滚
- **Istio VirtualService**：基于权重的精确流量分割

## PodDisruptionBudget (PDB)

PDB 保护应用在自愿中断（节点维护、集群升级、kubectl drain）期间的可用性。

### 基于最小可用数

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  minAvailable: 2                   # 至少保持 2 个 Pod 可用
  selector:
    matchLabels:
      app: web-app
```

### 基于最大不可用数

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  maxUnavailable: 1                 # 同一时间最多 1 个 Pod 不可用
  selector:
    matchLabels:
      app: web-app
```

### 百分比形式

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  minAvailable: "80%"              # 至少 80% 的 Pod 保持可用
  selector:
    matchLabels:
      app: web-app
```

### 查看 PDB 状态

```bash
kubectl get pdb
kubectl describe pdb web-app-pdb

# 输出示例
# NAME           MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS   AGE
# web-app-pdb    2               N/A               1                     5m
```

### 不健康 Pod 驱逐策略（1.31+ Beta）

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-app-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web-app
  unhealthyPodEvictionPolicy: AlwaysAllow   # 不健康 Pod 不受 PDB 保护
```

## 常见陷阱

- **未设置 readinessProbe**：没有就绪探针时，Pod 启动即接收流量，滚动更新可能导致请求失败；readinessProbe 是控制滚动更新节奏的关键
- **preStop hook 缺失**：Pod 从 Service 移除和容器收到 SIGTERM 几乎同时发生，需要 preStop 延迟以等待 LB 更新
- **PDB 阻塞节点排空**：`minAvailable` 设置为等于 replicas 数或 `maxUnavailable` 设为 0 会导致 `kubectl drain` 永远无法完成
- **金丝雀的 label 重叠**：确保 Service selector 能同时覆盖 stable 和 canary 的 Pod，但两个 Deployment 的 selector 各自独立
- **蓝绿部署的数据库兼容性**：切换前后两个版本可能同时访问数据库，schema 变更必须向前兼容
- **revisionHistoryLimit 设为 0**：会丢失所有回滚能力，建议保留至少 5-10 个 revision
- **progressDeadlineSeconds 太短**：大型应用（大镜像、慢启动）可能需要更长的超时时间
- **rollout undo 不是真正的"撤销"**：它是创建一个新的 revision，spec 与目标 revision 相同

## 组合提示

- 与 **k8s-core** 搭配：Deployment 是滚动更新的载体，Service 是蓝绿/金丝雀的流量切换点
- 与 **k8s-scaling** 搭配：HPA 与滚动更新并存时，确保 maxSurge/maxUnavailable 与副本数变化兼容
- 与 **k8s-networking** 搭配：Ingress canary 注解实现精确流量分割；Istio VirtualService 实现更灵活的流量管理
- 与 **k8s-helm** 搭配：Helm 的 `helm upgrade --wait` 等待滚动更新完成；`helm rollback` 触发回滚
- 考虑 Argo Rollouts 替代原生 Deployment 实现自动化渐进式发布
