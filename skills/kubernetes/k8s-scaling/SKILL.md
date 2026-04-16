---
name: k8s-scaling
description: "Kubernetes 弹性伸缩：HPA、VPA、资源管理、QoS 等级与配额控制"
tech_stack: [kubernetes, backend]
---

# Kubernetes 弹性伸缩与资源管理

> 来源：https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
> 版本基准：Kubernetes 1.30+

## 用途

通过 HPA（水平自动伸缩）和 VPA（垂直自动伸缩）实现工作负载的弹性调整；通过 resources requests/limits 精确管理容器资源；通过 QoS 等级、LimitRange 和 ResourceQuota 在集群和命名空间级别进行资源治理。

## 何时使用

- 应用负载有波峰波谷，需要自动扩缩 Pod 副本数
- 需要根据实际使用情况自动调整 Pod 的 CPU/内存配置
- 需要为集群中的工作负载划分资源优先级（关键服务 vs 后台任务）
- 需要在命名空间级别限制资源使用总量和单 Pod 资源上限
- 需要防止资源过度分配或某个团队/应用独占集群资源

## Resources Requests 与 Limits

### 基本概念

- **requests**：Pod 调度时保证的最低资源量，调度器据此选择节点
- **limits**：容器可使用的资源上限，超出 CPU 限制被节流（throttle），超出内存限制被 OOM Kill

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api
        image: myregistry/api:latest
        resources:
          requests:
            cpu: "250m"             # 0.25 核
            memory: "256Mi"
          limits:
            cpu: "1000m"            # 1 核
            memory: "512Mi"
```

### CPU 与内存单位

| 资源 | 单位 | 示例 | 说明 |
|------|------|------|------|
| CPU | 毫核 (millicores) | `250m` = 0.25 核 | 1000m = 1 核，可用小数如 `0.5` |
| 内存 | 字节 | `256Mi` = 256 MiB | 支持 Ki/Mi/Gi/Ti（二进制）和 K/M/G/T（十进制） |

> `256Mi`（256 * 1024 * 1024 字节）与 `256M`（256 * 1000 * 1000 字节）不同，推荐使用二进制单位（Mi/Gi）。

## QoS 等级

Kubernetes 根据 requests 和 limits 的配置自动为 Pod 分配 QoS 等级，决定资源紧张时的驱逐优先级。

### Guaranteed（最高优先级）

**条件**：Pod 中每个容器的 CPU 和内存都设置了 requests 且 requests == limits。

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "500m"                     # requests == limits
    memory: "512Mi"                 # requests == limits
```

- 资源紧张时最后被驱逐
- 适用于关键业务服务、数据库

### Burstable（中等优先级）

**条件**：至少一个容器设置了 requests 或 limits，但不满足 Guaranteed 条件。

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"                    # limits > requests
    memory: "1Gi"
```

- 可以突发使用超出 requests 的资源，但受 limits 约束
- 适用于大多数应用

### BestEffort（最低优先级）

**条件**：Pod 中所有容器都未设置 requests 和 limits。

```yaml
resources: {}                       # 无 requests 和 limits
```

- 资源紧张时最先被驱逐
- 仅适用于不重要的后台批处理任务

## HPA（Horizontal Pod Autoscaler）

### 基于 CPU 的 HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70      # 目标平均 CPU 使用率 70%
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # 缩容稳定窗口（秒），避免抖动
      policies:
      - type: Percent
        value: 10                   # 每次最多缩容 10% 的副本
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0     # 扩容无等待
      policies:
      - type: Percent
        value: 100                  # 允许翻倍扩容
        periodSeconds: 60
      - type: Pods
        value: 4                    # 每次最多增加 4 个 Pod
        periodSeconds: 60
      selectPolicy: Max             # 选择两个策略中扩容更多的
```

### 基于多指标的 HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 50
  metrics:
  # CPU 使用率
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  # 内存使用率
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 75
  # 自定义指标（需要 Prometheus Adapter 或其他 Metrics API）
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  # 外部指标（如消息队列深度）
  - type: External
    external:
      metric:
        name: queue_messages_ready
        selector:
          matchLabels:
            queue: worker-tasks
      target:
        type: AverageValue
        averageValue: "30"
```

### HPA 命令

```bash
# 查看 HPA 状态
kubectl get hpa

# 查看 HPA 详情（含当前指标值）
kubectl describe hpa api-server-hpa

# 快速创建 HPA（命令式）
kubectl autoscale deployment api-server \
  --min=2 --max=20 --cpu-percent=70

# 查看 HPA 事件
kubectl get events --field-selector involvedObject.kind=HorizontalPodAutoscaler
```

### HPA 前提条件

- 必须安装 **metrics-server**（提供 CPU/内存指标）
- 自定义指标需要安装 **Prometheus Adapter** 或 **KEDA**
- 目标 Deployment 的容器必须设置 `resources.requests`（否则 HPA 无法计算利用率百分比）

## VPA（Vertical Pod Autoscaler）

VPA 自动调整 Pod 的 requests 和 limits 值，而非调整副本数。

### VPA 安装

VPA 不是 Kubernetes 内置组件，需要额外安装：

```bash
# 克隆 VPA 仓库并安装
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh
```

### VPA 配置

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-server-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  updatePolicy:
    updateMode: "Off"               # Off | Initial | Recreate | Auto
  resourcePolicy:
    containerPolicies:
    - containerName: api
      minAllowed:
        cpu: "100m"
        memory: "128Mi"
      maxAllowed:
        cpu: "4"
        memory: "8Gi"
      controlledResources:
      - cpu
      - memory
```

### VPA updateMode

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| Off | 仅生成推荐值，不修改 Pod | 观察期、与 HPA 并存时 |
| Initial | 仅在 Pod 创建时应用推荐值 | 希望新 Pod 起始值更准确 |
| Recreate | 驱逐并重建 Pod 以应用新值 | 可接受短暂中断的应用 |
| Auto | 由 VPA 选择最佳策略（1.35+ 支持 InPlace） | 完全自动化管理 |

### HPA 与 VPA 的协同

**关键规则**：不要对同一 Deployment 使用 HPA 和 VPA 监控相同的指标。

推荐模式：
- VPA 设为 `Off` 模式，仅提供 requests 推荐值，由人工审查后应用
- HPA 基于业务指标（请求速率、队列深度）水平伸缩
- VPA 管理 CPU/内存的垂直调整（避免用 CPU/内存做 HPA 触发）

## LimitRange

LimitRange 在命名空间级别设置单个容器/Pod 的资源约束。

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: resource-limits
  namespace: production
spec:
  limits:
  # 容器级别的默认值和范围
  - type: Container
    default:                        # 未设置 limits 时的默认值
      cpu: "500m"
      memory: "256Mi"
    defaultRequest:                 # 未设置 requests 时的默认值
      cpu: "100m"
      memory: "128Mi"
    min:                            # 最小允许值
      cpu: "50m"
      memory: "64Mi"
    max:                            # 最大允许值
      cpu: "4"
      memory: "8Gi"
    maxLimitRequestRatio:           # limits/requests 的最大比率
      cpu: "10"
      memory: "4"
  # Pod 级别的总量限制
  - type: Pod
    max:
      cpu: "8"
      memory: "16Gi"
  # PVC 级别的存储限制
  - type: PersistentVolumeClaim
    min:
      storage: "1Gi"
    max:
      storage: "100Gi"
```

## ResourceQuota

ResourceQuota 在命名空间级别限制资源使用总量。

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: team-a
spec:
  hard:
    # 计算资源总量
    requests.cpu: "20"
    requests.memory: "40Gi"
    limits.cpu: "40"
    limits.memory: "80Gi"
    # 对象数量限制
    pods: "50"
    services: "20"
    services.loadbalancers: "2"
    persistentvolumeclaims: "20"
    configmaps: "50"
    secrets: "50"
    # 存储总量
    requests.storage: "500Gi"
    # 按 StorageClass 限制
    fast-ssd.storageclass.storage.k8s.io/requests.storage: "200Gi"
    fast-ssd.storageclass.storage.k8s.io/persistentvolumeclaims: "10"
```

### 按 QoS 等级的配额

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: besteffort-quota
  namespace: batch-jobs
spec:
  hard:
    pods: "100"
  scopeSelector:
    matchExpressions:
    - scopeName: PriorityClass
      operator: In
      values:
      - low-priority
```

### 查看配额使用情况

```bash
kubectl describe resourcequota team-quota -n team-a
kubectl get resourcequota -n team-a -o yaml
```

## 常见陷阱

- **未设置 requests 导致 HPA 无法工作**：HPA 利用率计算 = 实际使用 / requests，不设置 requests 则无法计算百分比
- **HPA 与 VPA 指标冲突**：同时用 CPU 做 HPA 和 VPA 会形成反馈循环导致不稳定
- **LimitRange 的 maxLimitRequestRatio 过高**：过高的 limits/requests 比率意味着过度承诺（overcommit），可能在节点资源紧张时引发大面积驱逐
- **ResourceQuota 启用后必须设置 requests**：一旦命名空间有 ResourceQuota 限制 CPU/内存，所有 Pod 必须设置 requests（否则 Pod 创建失败），建议配合 LimitRange 设置默认值
- **内存 limits 不能突发**：CPU 超出 limits 仅被节流，但内存超出 limits 会被 OOM Kill，内存 limits 要留够余量
- **HPA 的 stabilizationWindow 太短**：缩容窗口太短会导致频繁缩扩（flapping），生产环境建议至少 300 秒
- **metrics-server 未安装**：`kubectl top` 和 HPA 都依赖 metrics-server，新集群容易遗漏
- **Mi 与 M 的区别**：`128Mi` = 134,217,728 字节，`128M` = 128,000,000 字节，混用可能导致 OOM

## 组合提示

- 与 **k8s-core** 搭配：为 Deployment 的 Pod 设置 resources requests/limits
- 与 **k8s-deployment** 搭配：HPA 与滚动更新策略配合，确保扩缩过程中的可用性
- 与 **k8s-storage** 搭配：ResourceQuota 可限制命名空间的存储总量
- 与 **k8s-helm** 搭配：在 Helm values 中参数化 HPA 配置和资源 requests/limits
- 考虑 KEDA（Kubernetes Event-Driven Autoscaler）替代原生 HPA，支持更多事件源
