---
name: k8s-core
description: "Kubernetes 核心资源：Pod、Deployment、Service、Namespace、Label 与 kubectl 命令速查"
tech_stack: [kubernetes, backend]
capability: [orchestration, container]
---

# Kubernetes 核心资源

> 来源：https://kubernetes.io/docs/concepts/
> 版本基准：Kubernetes 1.30+

## 用途

掌握 Kubernetes 最基础的资源对象（Pod、Deployment、ReplicaSet、Service、Namespace）及其协作方式，能够完成应用的声明式部署、服务发现与流量路由。

## 何时使用

- 首次将容器化应用部署到 Kubernetes 集群
- 需要对无状态应用进行副本管理与自愈
- 需要为 Pod 提供稳定的网络访问入口
- 需要对集群资源进行逻辑隔离（多团队/多环境）
- 通过 Label/Selector 实现灵活的资源分组与筛选

## Pod

Pod 是 Kubernetes 最小的可调度单元，包含一个或多个共享网络和存储的容器。

### 基础 Pod 定义

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  labels:
    app: nginx
    env: production
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    ports:
    - containerPort: 80
    resources:
      requests:
        cpu: "100m"
        memory: "128Mi"
      limits:
        cpu: "250m"
        memory: "256Mi"
    livenessProbe:
      httpGet:
        path: /healthz
        port: 80
      initialDelaySeconds: 10
      periodSeconds: 15
    readinessProbe:
      httpGet:
        path: /ready
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 10
  restartPolicy: Always
```

### 多容器 Pod（Sidecar 模式）

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  containers:
  - name: app
    image: myapp:latest
    ports:
    - containerPort: 8080
    volumeMounts:
    - name: shared-logs
      mountPath: /var/log/app
  - name: log-collector
    image: fluentd:latest
    volumeMounts:
    - name: shared-logs
      mountPath: /var/log/app
      readOnly: true
  volumes:
  - name: shared-logs
    emptyDir: {}
```

## Deployment / ReplicaSet

Deployment 是管理无状态应用的标准方式，通过 ReplicaSet 维护期望副本数并支持滚动更新与回滚。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  labels:
    app: web-app
spec:
  replicas: 3
  revisionHistoryLimit: 10          # 保留的旧 ReplicaSet 数量，默认 10
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
        version: v1
    spec:
      containers:
      - name: web
        image: myregistry/web-app:1.2.0
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            cpu: "200m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1                   # 滚动更新时允许超出期望副本数的最大 Pod 数
      maxUnavailable: 0             # 更新过程中不可用 Pod 的最大数
```

## Service

Service 为一组 Pod 提供稳定的网络入口和负载均衡。

### ClusterIP（默认，集群内部访问）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app-svc
spec:
  type: ClusterIP                   # 默认类型，可省略
  selector:
    app: web-app
  ports:
  - name: http
    port: 80                        # Service 端口
    targetPort: 8080                # Pod 端口
    protocol: TCP
```

### NodePort（通过节点端口暴露到集群外）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app-nodeport
spec:
  type: NodePort
  selector:
    app: web-app
  ports:
  - port: 80
    targetPort: 8080
    nodePort: 30080                 # 范围 30000-32767，不指定则自动分配
```

### LoadBalancer（云平台外部负载均衡器）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app-lb
spec:
  type: LoadBalancer
  selector:
    app: web-app
  ports:
  - port: 443
    targetPort: 8443
```

### Headless Service（无 ClusterIP，用于 StatefulSet）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: db-headless
spec:
  clusterIP: None                   # Headless Service
  selector:
    app: database
  ports:
  - port: 5432
    targetPort: 5432
```

## Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: staging
  labels:
    env: staging
```

常见内置 Namespace：`default`、`kube-system`、`kube-public`、`kube-node-lease`。

## Label 与 Selector

Label 是附加到资源上的键值对，Selector 用于筛选匹配的资源。

```yaml
# 等值选择器
selector:
  matchLabels:
    app: web-app
    env: production

# 集合选择器
selector:
  matchExpressions:
  - key: tier
    operator: In
    values: [frontend, backend]
  - key: env
    operator: NotIn
    values: [test]
```

推荐 Label 约定：`app.kubernetes.io/name`、`app.kubernetes.io/version`、`app.kubernetes.io/component`、`app.kubernetes.io/part-of`、`app.kubernetes.io/managed-by`。

## kubectl 常用命令速查

### 查看资源

```bash
kubectl get pods -n <namespace>                       # 列出 Pod
kubectl get pods -o wide                              # 显示 IP、节点等详情
kubectl get pods -l app=web-app                       # 按 Label 筛选
kubectl get deploy,svc,pod                            # 同时查看多种资源
kubectl get all -n <namespace>                        # 查看命名空间下所有资源
kubectl describe pod <pod-name>                       # 详细信息（Events 很有用）
kubectl get pod <pod-name> -o yaml                    # 输出完整 YAML
```

### 创建与修改

```bash
kubectl apply -f manifest.yaml                        # 声明式创建/更新
kubectl create deployment nginx --image=nginx:1.27    # 命令式创建
kubectl scale deployment web-app --replicas=5         # 扩缩容
kubectl set image deploy/web-app web=myapp:v2         # 更新镜像
kubectl label pod <pod-name> env=production           # 添加 Label
kubectl annotate pod <pod-name> desc="my pod"         # 添加 Annotation
```

### 调试与排查

```bash
kubectl logs <pod-name>                               # 查看日志
kubectl logs <pod-name> -c <container-name>           # 多容器 Pod 指定容器
kubectl logs <pod-name> --previous                    # 查看崩溃前的日志
kubectl logs -f <pod-name>                            # 实时跟踪日志
kubectl exec -it <pod-name> -- /bin/sh                # 进入容器
kubectl port-forward svc/web-app-svc 8080:80          # 端口转发
kubectl top pods                                      # 查看资源使用（需 metrics-server）
kubectl get events --sort-by='.lastTimestamp'          # 按时间排序查看事件
```

### 删除资源

```bash
kubectl delete -f manifest.yaml                       # 按文件删除
kubectl delete pod <pod-name> --grace-period=0 --force # 强制删除（慎用）
kubectl delete namespace <ns>                         # 删除整个命名空间（级联删除所有资源）
```

### 上下文管理

```bash
kubectl config get-contexts                           # 列出上下文
kubectl config use-context <context-name>             # 切换上下文
kubectl config set-context --current --namespace=dev  # 设置默认命名空间
```

## 常见陷阱

- **selector 不可变**：Deployment 创建后 `.spec.selector` 不能修改，需删除重建
- **Pod 不会自动重建**：裸 Pod（不由 Deployment 管理）崩溃后不会重新调度，生产环境必须用 Deployment
- **Service selector 无匹配**：Service 的 selector 必须与 Pod 的 labels 精确匹配，大小写敏感
- **port vs targetPort 混淆**：`port` 是 Service 暴露的端口，`targetPort` 是 Pod 容器端口，两者可以不同
- **NodePort 端口冲突**：手动指定 nodePort 时注意范围（30000-32767）和集群内唯一性
- **Namespace 删除是级联的**：删除 Namespace 会删除其中所有资源，不可恢复
- **readinessProbe 未配置**：未设置就绪探针时，Pod 启动即接收流量，可能导致请求失败
- **resources 未设置**：不设置 requests/limits 的 Pod 为 BestEffort QoS，资源紧张时最先被驱逐

## 组合提示

- 与 **k8s-config** 搭配：通过 ConfigMap/Secret 向 Pod 注入配置
- 与 **k8s-scaling** 搭配：为 Deployment 配置 HPA 实现自动扩缩容
- 与 **k8s-deployment** 搭配：定制滚动更新策略与蓝绿/金丝雀部署
- 与 **k8s-networking** 搭配：通过 Ingress 暴露 Service 到集群外部
- 与 **k8s-helm** 搭配：用 Helm Chart 模板化管理上述所有资源
