---
name: k8s-config
description: "Kubernetes 配置管理：ConfigMap、Secret、环境变量注入与 Volume 挂载"
tech_stack: [kubernetes, backend]
---

# Kubernetes 配置管理

> 来源：https://kubernetes.io/docs/concepts/configuration/
> 版本基准：Kubernetes 1.30+

## 用途

将应用配置（数据库连接串、功能开关、证书等）与容器镜像解耦，通过 ConfigMap 管理非敏感配置、Secret 管理敏感数据，并以环境变量或 Volume 挂载方式注入到 Pod 中。

## 何时使用

- 应用需要根据环境（dev/staging/prod）切换配置
- 需要注入数据库密码、API Key、TLS 证书等敏感信息
- 配置文件（nginx.conf、application.yaml 等）需要外部管理
- 希望修改配置时不重新构建镜像
- 需要在多个 Pod 间共享同一份配置

## ConfigMap

### 基础 ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  # 简单键值对
  DATABASE_HOST: "postgres.db.svc.cluster.local"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"

  # 文件形式的配置（多行值）
  nginx.conf: |
    server {
      listen 80;
      server_name localhost;
      location / {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
      }
    }

  application.yaml: |
    server:
      port: 8080
    spring:
      datasource:
        url: jdbc:postgresql://${DATABASE_HOST}:${DATABASE_PORT}/mydb
```

### 不可变 ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-v2
immutable: true                     # 1.19+ 支持，设置后不可修改
data:
  DATABASE_HOST: "postgres.db.svc.cluster.local"
```

不可变 ConfigMap 的优势：防止意外修改导致故障；减轻 kube-apiserver 的 watch 压力，提升集群性能。修改配置需创建新 ConfigMap 并更新 Pod 引用。

### 通过命令行创建

```bash
# 从字面值创建
kubectl create configmap app-config \
  --from-literal=DATABASE_HOST=postgres.db.svc.cluster.local \
  --from-literal=LOG_LEVEL=info

# 从文件创建
kubectl create configmap nginx-config \
  --from-file=nginx.conf=./nginx.conf

# 从目录创建（每个文件成为一个 key）
kubectl create configmap config-dir \
  --from-file=./config/
```

## Secret

### Opaque Secret（通用密钥）

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:                         # 明文输入，K8s 自动 base64 编码存储
  username: admin
  password: "s3cret!P@ssw0rd"
  connection-string: "postgresql://admin:s3cret!P@ssw0rd@postgres:5432/mydb"
```

> 注意：`data` 字段需要 base64 编码值，`stringData` 接受明文（推荐在 YAML 中使用 `stringData`）。

### TLS Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tls-secret
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>
```

```bash
# 命令行创建 TLS Secret
kubectl create secret tls tls-secret \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

### Docker Registry Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: regcred
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64-encoded-docker-config>
```

```bash
# 命令行创建
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=user@example.com
```

在 Pod 中引用：

```yaml
spec:
  imagePullSecrets:
  - name: regcred
  containers:
  - name: app
    image: registry.example.com/myapp:latest
```

## 环境变量注入

### 单个键引用（valueFrom）

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
  - name: app
    image: myapp:latest
    env:
    # 引用 ConfigMap 中的单个键
    - name: DATABASE_HOST
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: DATABASE_HOST
    # 引用 Secret 中的单个键
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: password
    # 可选引用（键不存在时不报错）
    - name: OPTIONAL_KEY
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: MAYBE_EXISTS
          optional: true
```

### 批量注入（envFrom）

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
  - name: app
    image: myapp:latest
    envFrom:
    # 注入整个 ConfigMap 的所有键值对
    - configMapRef:
        name: app-config
      prefix: CFG_                  # 可选前缀，避免命名冲突
    # 注入整个 Secret 的所有键值对
    - secretRef:
        name: db-credentials
      prefix: SECRET_
```

## Volume 挂载配置文件

### ConfigMap 作为 Volume

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
spec:
  containers:
  - name: nginx
    image: nginx:1.27
    volumeMounts:
    - name: config-volume
      mountPath: /etc/nginx/conf.d  # 整个 ConfigMap 挂载为目录
      readOnly: true
  volumes:
  - name: config-volume
    configMap:
      name: nginx-config
```

### 挂载指定键（subPath 保留目录中其他文件）

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
  - name: app
    image: myapp:latest
    volumeMounts:
    # 使用 items 选择性挂载
    - name: config-volume
      mountPath: /etc/app/config
      readOnly: true
    # 使用 subPath 挂载单个文件（不覆盖目录中已有文件）
    - name: single-file
      mountPath: /etc/app/application.yaml
      subPath: application.yaml
      readOnly: true
  volumes:
  - name: config-volume
    configMap:
      name: app-config
      items:                        # 只挂载指定的 key
      - key: nginx.conf
        path: nginx.conf            # 挂载后的文件名
      - key: application.yaml
        path: application.yaml
  - name: single-file
    configMap:
      name: app-config
```

### Secret 作为 Volume

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: tls-pod
spec:
  containers:
  - name: app
    image: myapp:latest
    volumeMounts:
    - name: tls-certs
      mountPath: /etc/tls
      readOnly: true
  volumes:
  - name: tls-certs
    secret:
      secretName: tls-secret
      defaultMode: 0400             # 限制文件权限
```

### 设置文件权限

```yaml
volumes:
- name: secret-volume
  secret:
    secretName: db-credentials
    defaultMode: 0440              # 所有文件的默认权限
    items:
    - key: password
      path: db-password
      mode: 0400                   # 单个文件的权限覆盖
```

## 常见陷阱

- **ConfigMap/Secret 大小限制**：单个 ConfigMap/Secret 最大 1 MiB，超出需拆分
- **环境变量不会热更新**：通过 `env`/`envFrom` 注入的环境变量在 Pod 启动时确定，修改 ConfigMap/Secret 后需重启 Pod 才能生效
- **Volume 挂载会覆盖目录**：将 ConfigMap 挂载到已有目录时，原目录内容被完全替换；使用 `subPath` 可避免但会失去自动更新能力
- **subPath 不会自动更新**：使用 `subPath` 挂载的文件不会随 ConfigMap/Secret 的变更自动更新
- **Secret 的 base64 不是加密**：`data` 字段仅是编码，任何人解码即可读取；需要启用 etcd 静态加密（Encryption at Rest）并配合 RBAC
- **stringData 与 data 混用**：两者可同时存在，但 `stringData` 写入后会被转为 `data` 中的 base64 值；`kubectl get secret -o yaml` 只显示 `data`
- **ConfigMap 键名限制**：键名只能包含字母、数字、`-`、`_`、`.`，不能包含路径分隔符
- **envFrom 的键名冲突**：多个 ConfigMap/Secret 通过 envFrom 注入时若有同名键，后者覆盖前者，建议使用 `prefix` 区分
- **跨 Namespace 不可引用**：Pod 只能引用同一 Namespace 下的 ConfigMap 和 Secret

## 组合提示

- 与 **k8s-core** 搭配：在 Deployment/Pod 中使用 ConfigMap 和 Secret
- 与 **k8s-networking** 搭配：TLS Secret 用于 Ingress HTTPS 配置
- 与 **k8s-helm** 搭配：Helm values.yaml 动态渲染 ConfigMap/Secret 模板
- 与 **k8s-storage** 搭配：大文件配置可考虑使用 PersistentVolume 替代 ConfigMap
- 考虑外部 Secret 管理方案：Vault + External Secrets Operator、AWS Secrets Manager、GCP Secret Manager
