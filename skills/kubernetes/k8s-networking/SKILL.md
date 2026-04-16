---
name: k8s-networking
description: "Kubernetes 网络：Ingress、TLS 终结、NetworkPolicy 与 Service Mesh 概览"
tech_stack: [kubernetes]
---

# Kubernetes 网络

> 来源：https://kubernetes.io/docs/concepts/services-networking/
> 版本基准：Kubernetes 1.30+

## 用途

管理集群的外部流量入口（Ingress）、内部网络隔离（NetworkPolicy）、以及服务间通信治理（Service Mesh），实现安全、可控的网络架构。

## 何时使用

- 需要将 HTTP/HTTPS 流量从集群外部路由到内部 Service
- 需要基于域名或路径的流量分发（虚拟主机 / URL 路由）
- 需要为 Service 配置 TLS/SSL 终结
- 需要实施 Pod 间或 Namespace 间的网络访问控制
- 需要服务间的流量管理、可观测性和安全通信（mTLS）

## Ingress

Ingress 是管理集群外部 HTTP/HTTPS 访问的 API 对象，提供负载均衡、SSL 终结和基于名称的虚拟主机路由。

> **注意**：Kubernetes 官方推荐新项目使用 [Gateway API](https://gateway-api.sigs.k8s.io/) 替代 Ingress。Ingress API 已冻结不再新增功能，但仍保持稳定支持。

### 前提条件

必须安装 Ingress Controller 才能使 Ingress 资源生效。常见 Controller：
- **NGINX Ingress Controller**（社区版 `kubernetes/ingress-nginx`）
- **Traefik**
- **HAProxy Ingress**
- **AWS ALB Ingress Controller**
- **GCE Ingress Controller**

### IngressClass

IngressClass 指定哪个 Controller 负责处理 Ingress 资源：

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
  annotations:
    ingressclass.kubernetes.io/is-default-class: "true"   # 标记为默认
spec:
  controller: k8s.io/ingress-nginx
```

### 基础 Ingress（单 Service）

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: simple-ingress
spec:
  ingressClassName: nginx
  defaultBackend:
    service:
      name: web-app
      port:
        number: 80
```

### 基于路径的路由（Fanout）

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-based-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix            # Prefix | Exact | ImplementationSpecific
        backend:
          service:
            name: api-service
            port:
              number: 8080
      - path: /web
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

**pathType 说明**：
- `Exact`：精确匹配，`/foo` 不匹配 `/foo/`
- `Prefix`：前缀匹配，`/api` 匹配 `/api`、`/api/`、`/api/v1`
- `ImplementationSpecific`：由 Ingress Controller 决定匹配行为

### 基于域名的虚拟主机

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vhost-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
  - host: admin.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: admin-service
            port:
              number: 8080
```

### TLS 终结

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: example-tls
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tls-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - app.example.com
    - api.example.com
    secretName: example-tls         # 引用 TLS Secret
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
```

### 常用 NGINX Ingress 注解

```yaml
annotations:
  # 重写目标路径
  nginx.ingress.kubernetes.io/rewrite-target: /$1
  # 强制 HTTPS
  nginx.ingress.kubernetes.io/ssl-redirect: "true"
  # 请求体大小限制
  nginx.ingress.kubernetes.io/proxy-body-size: "50m"
  # 超时配置
  nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
  # 限流
  nginx.ingress.kubernetes.io/limit-rps: "10"
  # CORS
  nginx.ingress.kubernetes.io/enable-cors: "true"
  nginx.ingress.kubernetes.io/cors-allow-origin: "https://example.com"
  # WebSocket 支持
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  # 自定义 upstream hash（会话保持）
  nginx.ingress.kubernetes.io/upstream-hash-by: "$request_uri"
```

## NetworkPolicy

NetworkPolicy 在 Pod 级别控制网络流量（L3/L4），实施零信任网络安全策略。

### 前提条件

需要支持 NetworkPolicy 的 CNI 插件：**Calico**、**Cilium**、**Antrea**、**Weave Net**。不支持的 CNI（如 Flannel）下创建 NetworkPolicy 不会报错但也不会生效。

### 默认拒绝策略

```yaml
# 拒绝所有入站+出站（零信任基线，按需开放）
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}                   # 空选择器 = 命名空间内所有 Pod
  policyTypes:
  - Ingress
  - Egress
# 仅拒绝入站：policyTypes 只写 Ingress；仅拒绝出站：只写 Egress
```

### 精细化访问控制

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-netpol
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  # 允许来自前端 Pod 的流量
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
  # 允许来自监控命名空间的流量
  - from:
    - namespaceSelector:
        matchLabels:
          purpose: monitoring
    ports:
    - protocol: TCP
      port: 9090
  egress:
  # 允许访问数据库 Pod
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 5432
  # 允许 DNS 查询（必须！否则服务发现失败）
  - to:
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

### 基于 IP 段的控制

```yaml
ingress:
- from:
  - ipBlock:
      cidr: 172.16.0.0/16
      except:
      - 172.16.1.0/24              # 排除子网
  ports:
  - protocol: TCP
    port: 443
```

### Selector 组合逻辑

```yaml
# OR 逻辑 —— from 数组中的每个元素是 OR 关系
ingress:
- from:
  - podSelector:                   # 条件 A
      matchLabels:
        role: frontend
  - namespaceSelector:             # 条件 B（与 A 是 OR）
      matchLabels:
        env: staging

# AND 逻辑 —— 同一个元素内的多个选择器是 AND 关系
ingress:
- from:
  - podSelector:                   # 条件 A
      matchLabels:
        role: frontend
    namespaceSelector:             # AND 条件 B
      matchLabels:
        env: staging
```

## Service Mesh 概览

Service Mesh 在应用层（L7）提供服务间通信治理，通常通过 sidecar 代理实现。

### Istio

- **架构**：控制平面（istiod）+ 数据平面（Envoy sidecar）
- **核心功能**：mTLS 自动加密、流量管理（VirtualService/DestinationRule）、可观测性（分布式追踪、指标）、故障注入与熔断
- **适用场景**：大规模微服务架构，需要丰富的流量治理能力
- **代价**：资源开销较大，每个 Pod 额外运行一个 Envoy sidecar

### Linkerd

- **架构**：超轻量控制平面 + Rust 编写的微代理（linkerd2-proxy）
- **核心功能**：mTLS、负载均衡、重试与超时、可观测性
- **适用场景**：希望快速上手且资源开销小的团队
- **优势**：比 Istio 更简单，资源消耗更低

### 选型建议

| 维度 | Istio | Linkerd |
|------|-------|---------|
| 功能丰富度 | 高（流量镜像、故障注入等） | 中等（聚焦核心能力） |
| 资源开销 | 较高 | 较低 |
| 学习曲线 | 陡峭 | 平缓 |
| 社区生态 | 大、插件丰富 | 精简、CNCF 毕业项目 |

## 常见陷阱

- **无 Ingress Controller 时 Ingress 不生效**：仅创建 Ingress 资源不会有任何效果，必须先部署 Controller
- **NetworkPolicy 需要 CNI 支持**：Flannel 不支持 NetworkPolicy，使用 Calico 或 Cilium
- **忘记放行 DNS**：在 default-deny-egress 策略下，必须显式允许 UDP/TCP 53 端口到 kube-dns，否则所有服务发现失败
- **NetworkPolicy 的 OR/AND 混淆**：`from` 数组中并列的元素是 OR 关系，同一元素内的 podSelector + namespaceSelector 是 AND 关系
- **Ingress TLS Secret 必须在同一 Namespace**：TLS Secret 必须与 Ingress 资源处于相同的 Namespace
- **pathType Prefix 的尾斜杠**：`/api` 会匹配 `/api` 和 `/api/xxx`，但不同 Controller 行为可能有差异
- **Ingress 注解不可移植**：`nginx.ingress.kubernetes.io/*` 注解只对 NGINX Controller 有效，更换 Controller 需要修改
- **Service Mesh sidecar 注入失败**：确认 Namespace 已标记 `istio-injection=enabled`（Istio）或安装了 Linkerd 注入 webhook

## 组合提示

- 与 **k8s-core** 搭配：Ingress 将流量路由到 Service，NetworkPolicy 基于 Label 选择 Pod
- 与 **k8s-config** 搭配：TLS Secret 管理证书，ConfigMap 管理 Ingress Controller 全局配置
- 与 **k8s-deployment** 搭配：金丝雀部署可通过 Ingress 注解分流或 Istio VirtualService 实现
- 与 **k8s-helm** 搭配：Helm Chart 中模板化 Ingress 和 NetworkPolicy 资源
- 考虑 cert-manager 自动管理 TLS 证书（Let's Encrypt 集成）
