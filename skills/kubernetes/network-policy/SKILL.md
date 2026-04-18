---
name: kubernetes-network-policy
description: 用 NetworkPolicy / CiliumNetworkPolicy / Calico (Global)NetworkPolicy 定义 Pod 入口出口流量策略
tech_stack: [kubernetes, cilium, calico]
capability: [orchestration]
version: "kubernetes networking.k8s.io/v1; cilium unversioned; calico projectcalico.org/v3"
collected_at: 2026-04-18
---

# Kubernetes 网络策略（L3/L4 + Cilium/Calico 扩展）

> 来源：kubernetes.io/docs · cilium/cilium docs · docs.tigera.io/calico

## 用途
以应用为中心（基于 Pod/Namespace label 与 CIDR）限制集群内外流量，支撑零信任与多租户隔离。

## 何时使用
- 限制命名空间间、Pod 间 L3/L4 通信
- 默认拒绝（default-deny）+ 按需放行
- L7（HTTP method/path）策略（Cilium 原生 / Calico+Istio）
- 跨所有 namespace 的集群级策略（CiliumClusterwide / Calico GlobalNetworkPolicy）
- 保护 VM、裸机 host endpoint（Calico）

## 基础用法

**标准 NetworkPolicy（入站+出站）**：
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-policy
  namespace: default
spec:
  podSelector:
    matchLabels: { role: db }
  policyTypes: [Ingress, Egress]
  ingress:
  - from:
    - ipBlock:
        cidr: 172.17.0.0/16
        except: [172.17.1.0/24]
    - namespaceSelector:
        matchLabels: { project: myproject }
    - podSelector:
        matchLabels: { role: frontend }
    ports:
    - { protocol: TCP, port: 6379 }
  egress:
  - to:
    - ipBlock: { cidr: 10.0.0.0/24 }
    ports:
    - { protocol: TCP, port: 5978 }
```

**Calico GlobalNetworkPolicy + deny 规则**：
```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata: { name: deny-blue }
spec:
  selector: color == 'red'
  ingress:
  - action: Deny
    protocol: TCP
    source:
      selector: color == 'blue'
```

**Calico NetworkPolicy（命名空间级 + CIDR 出口）**：
```yaml
apiVersion: projectcalico.org/v3
kind: NetworkPolicy
metadata: { name: allow-egress-external, namespace: production }
spec:
  selector: color == 'red'
  types: [Egress]
  egress:
  - action: Allow
    destination:
      nets: [1.2.3.0/24]
```

## 关键 API（摘要）

**K8s NetworkPolicy**（`networking.k8s.io/v1`）：
- `podSelector` — 选中被策略约束的 Pod；空选择器匹配 namespace 内全部 Pod
- `policyTypes: [Ingress, Egress]` — 未显式写 Egress 且无 egress 规则时只默认 Ingress
- `ingress.from` / `egress.to` 四类选择器：`podSelector` / `namespaceSelector` / 两者合用 / `ipBlock`（支持 `except`）
- 多策略是**并集**（additive），不存在冲突与顺序

**Cilium**：
- `CiliumNetworkPolicy` CRD — 支持 L3–L7（HTTP/Kafka/DNS/TLS SNI 等）
- `CiliumClusterwideNetworkPolicy` — 集群作用域 + 支持 `NodeSelector`
- 已知限制：`ipBlock` 不支持指向 Pod IP（#9209）

**Calico**（`projectcalico.org/v3`）：
- `NetworkPolicy`（命名空间级）/ `GlobalNetworkPolicy`（集群级）
- 规则字段：`action: Allow|Deny|Log|Pass`、`order`（低值优先）、`selector` 表达式、`source.selector`、`destination.ports|nets`、`types: [Ingress, Egress]`
- Endpoint 扩展：Pod / VM / host interface
- 前置：`calicoctl` 需与 datastore 配置一致

## 注意事项
- **NetworkPolicy 必须有实现它的 CNI 插件**（Cilium/Calico/Antrea…），否则创建了也无效果
- 连接被允许需要**源 Pod egress 放行 AND 目标 Pod ingress 放行**，任一侧拒绝即失败
- Pod 所在节点到 Pod 的流量始终允许（与 IP 无关），不受 NetworkPolicy 约束
- `namespaceSelector` + `podSelector` 写在**同一个列表项**（表示"该 namespace 中符合 label 的 Pod"）与写成两个独立列表项（表示"该 namespace 所有 Pod 或匹配 label 的同 namespace Pod"）**语义不同**，注意 YAML 缩进
- K8s Pod 默认 allow；Calico 对 VM / host 默认 deny
- 多种 Cilium 策略类型并用时，最终放行集是多策略并集，容易产生意料外的允许路径
- DNS-based policy / policy recommendation 为 Calico Cloud 独占
- 一旦出现任何选中该 Pod 且 `policyTypes` 含某方向的策略，该 Pod 在该方向转为 isolated，其余未显式放行的流量被拒

## 组合提示
与 `kubernetes-observability`（抓取时放行 scrape 端口）、`kubernetes-gitops`（把 NetworkPolicy 纳入 Git 管理）、服务网格 mTLS 层叠使用；推荐每个 namespace 先落一条 default-deny 再逐步放行。
