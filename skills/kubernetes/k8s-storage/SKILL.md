---
name: k8s-storage
description: "Kubernetes 存储：PV/PVC、StorageClass、动态供给与 StatefulSet 有状态存储"
tech_stack: [kubernetes, backend]
capability: [orchestration, object-storage]
---

# Kubernetes 存储

> 来源：https://kubernetes.io/docs/concepts/storage/
> 版本基准：Kubernetes 1.30+

## 用途

为 Pod 提供持久化存储能力，通过 PersistentVolume（PV）和 PersistentVolumeClaim（PVC）抽象底层存储实现，支持静态供给和基于 StorageClass 的动态供给，为有状态应用（数据库、消息队列等）提供可靠的数据持久化方案。

## 何时使用

- 应用需要数据持久化（数据库、文件存储、日志归档）
- 需要跨 Pod 重启/重调度保留数据
- 有状态应用需要稳定的存储卷标识（StatefulSet）
- 需要根据不同性能需求选择存储类型（SSD/HDD/NFS）
- 需要动态按需创建存储卷，减少管理员手工操作

## PersistentVolume (PV)

PV 是集群级别的存储资源，由管理员创建或通过 StorageClass 动态供给。

### 静态供给的 PV

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv
  labels:
    type: nfs
spec:
  capacity:
    storage: 10Gi
  volumeMode: Filesystem            # Filesystem（默认）或 Block
  accessModes:
  - ReadWriteMany                   # NFS 支持多节点读写
  persistentVolumeReclaimPolicy: Retain
  storageClassName: nfs-storage
  mountOptions:
  - hard
  - nfsvers=4.1
  nfs:
    server: nfs-server.example.com
    path: /exports/data
```

### Access Modes

| 缩写 | 模式 | 说明 |
|------|------|------|
| RWO | ReadWriteOnce | 单节点读写挂载 |
| ROX | ReadOnlyMany | 多节点只读挂载 |
| RWX | ReadWriteMany | 多节点读写挂载 |
| RWOP | ReadWriteOncePod | 单 Pod 读写挂载（1.29+ GA） |

> 不同存储后端支持的 Access Mode 不同：云盘（EBS/Azure Disk）通常只支持 RWO；NFS/CephFS 支持 RWX；RWOP 比 RWO 更严格，限制到单个 Pod。

### Reclaim Policy

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| Retain | PVC 删除后 PV 保留，数据不删除，需手工清理 | 关键数据，人工审查后再删除 |
| Delete | PVC 删除后 PV 和底层存储资源一并删除 | 临时数据，动态供给的默认策略 |
| Recycle | 执行 `rm -rf /thevolume/*` 后 PV 可复用 | 已废弃，不推荐使用 |

### PV 生命周期

`Available` -> `Bound`（绑定到 PVC）-> `Released`（PVC 被删除）-> `Available`（仅 Recycle）/ 需手工处理（Retain）/ 被删除（Delete）

## PersistentVolumeClaim (PVC)

PVC 是用户对存储资源的请求声明。

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data-pvc
  namespace: default
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: fast-ssd        # 指定 StorageClass（动态供给）
  resources:
    requests:
      storage: 20Gi
  # 可选：通过 selector 绑定特定 PV
  # selector:
  #   matchLabels:
  #     type: nfs
```

### Pod 中使用 PVC

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-storage
spec:
  containers:
  - name: app
    image: myapp:latest
    volumeMounts:
    - name: data
      mountPath: /var/data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: app-data-pvc
```

## StorageClass

StorageClass 定义存储的 "类别"，为动态供给提供模板。

### 通用 StorageClass 定义

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"   # 标记为默认
provisioner: ebs.csi.aws.com       # CSI 驱动（取决于云平台）
reclaimPolicy: Delete              # Delete（默认）或 Retain
allowVolumeExpansion: true         # 允许 PVC 扩容
volumeBindingMode: WaitForFirstConsumer   # 延迟绑定到 Pod 调度时
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
```

### 常见 Provisioner

| 平台 | Provisioner | 说明 |
|------|-------------|------|
| AWS EBS | `ebs.csi.aws.com` | 块存储，RWO |
| AWS EFS | `efs.csi.aws.com` | 文件存储，RWX |
| GCE PD | `pd.csi.storage.gke.io` | 块存储，RWO |
| Azure Disk | `disk.csi.azure.com` | 块存储，RWO |
| Azure File | `file.csi.azure.com` | 文件存储，RWX |
| Ceph RBD | `rbd.csi.ceph.com` | 块存储 |
| NFS | 需外部 provisioner | 文件存储，RWX |
| Local | `kubernetes.io/no-provisioner` | 本地磁盘，无动态供给 |

### volumeBindingMode

- **Immediate**（默认）：PVC 创建后立即绑定 PV。可能导致 PV 所在节点与 Pod 调度节点不一致
- **WaitForFirstConsumer**：延迟到使用该 PVC 的 Pod 被调度时再绑定。适用于有拓扑约束的存储（local volume、zone-aware 云盘）

### 默认 StorageClass

```bash
# 查看当前默认 StorageClass
kubectl get sc -o wide

# 设置默认 StorageClass
kubectl patch sc fast-ssd -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# 取消默认
kubectl patch sc old-default -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

## 动态供给流程

1. 管理员创建 StorageClass（指定 provisioner 和参数）
2. 用户创建 PVC（指定 `storageClassName` 和容量）
3. Kubernetes 调用 provisioner 自动创建 PV 并绑定到 PVC
4. Pod 挂载 PVC 使用存储

```yaml
# 用户只需创建 PVC，PV 由 StorageClass 自动创建
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dynamic-pvc
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 50Gi
```

### PVC 扩容

StorageClass 设置 `allowVolumeExpansion: true` 后可扩容：

```bash
# 修改 PVC 的存储请求
kubectl patch pvc dynamic-pvc -p '{"spec":{"resources":{"requests":{"storage":"100Gi"}}}}'
```

> 扩容仅支持增大，不能缩小。文件系统扩容可能需要 Pod 重建（取决于 CSI 驱动是否支持在线扩容）。

## StatefulSet 与有状态存储

StatefulSet 为每个 Pod 提供稳定的网络标识和独立的持久存储。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
spec:
  clusterIP: None                   # Headless Service（StatefulSet 必需）
  selector:
    app: postgres
  ports:
  - port: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres-headless    # 关联 Headless Service
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "2"
            memory: "4Gi"
  volumeClaimTemplates:             # 每个副本自动创建独立 PVC
  - metadata:
      name: data
    spec:
      accessModes:
      - ReadWriteOnce
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi
```

### StatefulSet 存储特性

- **稳定标识**：Pod 名称固定为 `<statefulset-name>-<ordinal>`（如 `postgres-0`、`postgres-1`）
- **独立 PVC**：每个副本通过 `volumeClaimTemplates` 获得独立 PVC，名称为 `<template-name>-<pod-name>`（如 `data-postgres-0`）
- **DNS 稳定**：每个 Pod 拥有稳定的 DNS 记录 `<pod-name>.<headless-svc>.<namespace>.svc.cluster.local`
- **有序部署**：Pod 按序号 0, 1, 2... 依次创建，前一个 Ready 后才创建下一个
- **PVC 保留**：删除 StatefulSet 或缩容不会删除 PVC，数据安全保留

```bash
# 访问特定副本的 DNS
postgres-0.postgres-headless.default.svc.cluster.local
postgres-1.postgres-headless.default.svc.cluster.local
```

## 常见陷阱

- **PVC 绑定失败**：PVC 请求的 accessMode/容量/storageClassName 必须与可用 PV 或 StorageClass 匹配，否则一直 Pending
- **Immediate 绑定的拓扑问题**：默认 volumeBindingMode 可能将 PV 绑定到与 Pod 调度节点不同的 zone，使用 `WaitForFirstConsumer` 解决
- **StatefulSet PVC 不自动删除**：缩容或删除 StatefulSet 后 PVC 和数据保留，需手动清理以释放存储资源
- **存储扩容需要 CSI 支持**：并非所有 provisioner 都支持扩容，且部分仅支持离线扩容（需删除 Pod 后才能完成）
- **多 default StorageClass**：集群中存在多个默认 StorageClass 时行为不确定，确保只有一个
- **RWO 不是 Pod 级别**：ReadWriteOnce 限制的是节点，同一节点上的多个 Pod 可以同时挂载同一 RWO PV；需要 Pod 级别独占请用 RWOP
- **Local PV 无法动态供给**：local provisioner 不支持动态创建，必须手工创建 PV 并使用 `WaitForFirstConsumer`
- **PV 的 Released 状态不可自动复用**：Retain 策略的 PV 在 PVC 删除后变为 Released，不能被新 PVC 自动绑定，需手工清除 `claimRef`
- **Storage Object in Use Protection**：正在使用的 PVC/PV 无法立即删除，会处于 Terminating 状态直到不再被引用

## 组合提示

- 与 **k8s-core** 搭配：Deployment 中挂载 PVC 实现数据持久化（适合共享存储场景）
- 与 **k8s-config** 搭配：Secret 管理数据库密码，ConfigMap 管理数据库初始化脚本
- 与 **k8s-scaling** 搭配：StatefulSet 的 HPA 需谨慎，扩容会创建新 PVC 和 PV
- 与 **k8s-helm** 搭配：Helm values 中参数化 StorageClass、容量和副本数
- 备份方案：结合 Velero 实现 PV 快照备份与恢复
