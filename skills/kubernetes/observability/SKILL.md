---
name: kubernetes-observability
description: 用 OpenTelemetry Operator、Prometheus Operator 与 Loki 在 K8s 集群采集指标/链路/日志
tech_stack: [kubernetes, opentelemetry, prometheus, grafana-loki]
capability: [observability, orchestration]
version: "opentelemetry-operator unversioned; prometheus-operator unversioned; grafana-loki unversioned"
collected_at: 2026-04-18
---

# Kubernetes 可观测性（Metrics / Traces / Logs）

> 来源：opentelemetry.io/docs/platforms/kubernetes · prometheus-operator.dev · grafana.com/docs/loki

## 用途
在 Kubernetes 集群中以声明式 CRD 方式部署 OTel Collector、Prometheus 抓取目标和日志聚合管线，统一三信号观测栈。

## 何时使用
- 需要自动为工作负载注入 OTel instrumentation
- 基于标签自动发现 Pod/Service 抓取指标
- 聚合集群日志并通过标签索引（非全文）高效查询
- 把 K8s 事件/追踪导出到多家后端（vendor-agnostic）

## 基础用法

**安装 OTel Operator（需 cert-manager 前置）**：
```bash
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml
```

**创建 Collector 实例**：
```yaml
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: simplest
spec:
  config:
    receivers:
      otlp:
        protocols:
          grpc: { endpoint: 0.0.0.0:4317 }
          http: { endpoint: 0.0.0.0:4318 }
    processors:
      memory_limiter:
        check_interval: 1s
        limit_percentage: 75
        spike_limit_percentage: 15
    exporters:
      debug: {}
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter]
          exporters: [debug]
```

**ServiceMonitor 抓取指标**：
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: example-app
  labels: { team: frontend }
spec:
  selector:
    matchLabels: { app: example-app }
  endpoints:
  - port: web
---
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata: { name: prometheus }
spec:
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels: { team: frontend }
```

**PodMonitor（无 Service 时直接选 Pod）**：
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata: { name: example-app, labels: { team: frontend } }
spec:
  selector: { matchLabels: { app: example-app } }
  podMetricsEndpoints:
  - port: web
```

## 关键 API（摘要）
- `OpenTelemetryCollector` (opentelemetry.io/v1beta1) — 声明 receivers/processors/exporters/pipelines
- `ServiceMonitor` — 通过 Service label 发现抓取目标
- `PodMonitor` — 绕过 Service，从 Pod label 直接发现
- `Prometheus` CR — 用 `serviceMonitorSelector` / `podMonitorSelector` 绑定抓取规则
- Loki 四步上线：Helm 装 Loki (monolithic) → 部署 Grafana Alloy 采集 → Grafana 配 Loki 数据源 → Explore 用 LogQL 查询
- `helm install alloy grafana/alloy -f ./values.yaml` — 部署日志采集器

## 注意事项
- OTel Operator 依赖 **cert-manager**，安装前必须就绪
- OTel Collector < v0.86.0 的 debug exporter 名叫 `logging`；新版本改名 `debug`
- 通过 Helm 安装时 operator 默认镜像是 `opentelemetry-collector-k8s`，否则是 `opentelemetry-collector`
- Loki 按 label 索引而非全文，**务必控制 label 基数**（region/cluster/env 等低基数维度），高基数 label（如 user_id）会爆炸
- ServiceMonitor/PodMonitor 只有在 `Prometheus` CR 的 selector 能匹配到其 labels 时才会生效；常见坑：忘记加 `team: frontend` 标签导致 target 不出现

## 组合提示
OTel Collector 常作为 Prometheus remote write 源 + 链路转发器；Loki + Alloy 替代传统 EFK；与 `kubernetes-network-policy` 搭配时注意放行 scrape 端口与 OTLP 4317/4318。
