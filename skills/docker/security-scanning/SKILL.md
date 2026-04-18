---
name: docker-security-scanning
description: 使用 Docker Scout 与 Trivy 扫描容器镜像中的 CVE、密钥与配置错误
tech_stack: [docker, trivy, docker-scout]
capability: [container]
version: "docker-scout unversioned; trivy unversioned"
collected_at: 2026-04-18
---

# 容器镜像安全扫描（Docker Scout + Trivy）

> 来源：https://docs.docker.com/scout/ · https://trivy.dev/docs/latest/

## 用途
在构建/推送/部署前识别镜像中的漏洞、泄漏凭证、配置错误，生成 SBOM 并对照策略（如禁止 root、必需 SBOM 证明）检查合规性。

## 何时使用
- 部署前对镜像执行 CVE 门禁
- 生成供应链 SBOM / provenance 证明
- 在 CI 中比较两个版本的安全性变化
- 排查 `ENV` / 镜像配置中误埋的密钥
- 对 IaC（Kubernetes YAML / Terraform）做 misconfig 检查

## 基础用法

**Docker Scout — 本地快速体检**：
```console
$ docker scout quickview <image:tag>          # 摘要
$ docker scout cves <image:tag>               # 详细 CVE
$ docker scout compare --to <old> <new>       # 两版本对比
```

**Scout — 启用仓库分析并推送带证明的镜像**：
```console
$ docker scout enroll <ORG_NAME>
$ docker scout repo enable --org <ORG_NAME> <ORG_NAME>/my-app
$ docker build --provenance=true --sbom=true --push -t <ORG_NAME>/my-app:v1 .
```

**Trivy — 镜像扫描**：
```bash
trivy image python:3.4-alpine                          # 默认扫 vuln + secret
trivy image --scanners vuln,misconfig,secret,license myimg:tag
trivy image --image-config-scanners secret,misconfig myimg:tag   # 仅扫配置
trivy image --platform linux/arm64 myimg:tag
trivy image --detection-priority comprehensive myimg:tag
```

## 关键 API（摘要）

Docker Scout：
- `docker scout quickview` — 摘要（Critical/High/Medium/Low 分级）
- `docker scout cves [--only-package <name>]` — CVE 详情与过滤
- `docker scout compare --to <ref> <ref>` — 版本差异
- `docker scout config organization <ORG>` — 本地绑定组织
- 平台最大支持 10 GB 未压缩镜像；更大需用本地 CLI 或构建期 SBOM 证明

Trivy：
- `--scanners vuln,misconfig,secret,license` — 选择文件扫描器（license 默认关）
- `--image-config-scanners misconfig,secret` — 扫镜像配置（不扫文件）
- `--detection-priority precise|comprehensive` — 精确 vs 召回
- `--pkg-types os,library` / `--pkg-relationships` — 过滤包类型
- `--max-image-size` — 拒绝扫描超大镜像
- 支持源：Docker Engine / containerd / Podman / Registry / tar / OCI Layout

## 注意事项
- **Trivy 对 OS 包仅采信发行版官方 advisory**（而非 upstream NVD），避免 backport 修复被误报为漏洞
- Trivy 针对镜像 config 的 misconfig 中 AVD-DS-0007、AVD-DS-0016 默认禁用（stage 识别限制）
- Scout 平台扫描 10 GB 上限；超限必须在构建时用 `--sbom=true --provenance=true` 生成 SBOM 证明，或用 CLI 本地扫
- 严重度映射：CVSS 0.1–3.9 Low / 4.0–6.9 Medium / 7.0–8.9 High / 9.0–10.0 Critical
- Scout 的 `scout-demo` 示例演示了从扫出 CVE → 升级依赖 → 加 `USER` 非 root → 启用 containerd image store 生成 SBOM 的完整合规流程

## 组合提示
CI 流水线中常与 `docker-image-optimization` 串联：构建 → Trivy 扫描门禁 → 推送 → Scout 持续监控 → Kubernetes 准入（如 Kyverno 校验 SBOM 证明）。
