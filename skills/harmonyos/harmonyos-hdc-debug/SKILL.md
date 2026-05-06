---
name: harmonyos-hdc-debug
description: HarmonyOS hdc 调试命令全集：应用安装/卸载、hilog 日志过滤与持久化、崩溃抓取与 hstack 符号化、文件推拉、shell 与性能采样
tech_stack: [harmonyos]
capability: [observability, ci-cd]
version: "OpenHarmony unversioned"
collected_at: 2025-01-01
---

# hdc — HarmonyOS 设备调试工具

> Source: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/hdc, https://github.com/openharmony/developtools_hdc_standard, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/napi-faq-about-stability

## Purpose
HDC（OpenHarmony Device Connector）是 HarmonyOS/OpenHarmony 的调试命令行工具，对标 Android adb。架构为三层：hdc client（CLI）、hdc server（开发机后台进程，管理连接复用）、hdc daemon（设备端守护进程）。提供应用部署、日志抓取、崩溃分析、文件传输、shell 访问、性能采样等全套设备调试能力。

## When to Use
- 将编译好的 HAP 安装到测试设备/模拟器
- 抓取应用运行时日志并持久化到本地分析
- 应用崩溃后获取堆栈并符号化定位到源码行
- 从设备拉取数据库/日志/截图等文件
- 向设备推送测试资源或配置
- 进入设备 shell 执行诊断命令
- CI 流水线中自动部署 HAP 并采集日志
- 性能采样（CPU/内存）与 trace 抓取

## Basic Usage

```bash
# ── 设备连接 ──
hdc list targets                      # 列出已连接设备
hdc -t <deviceId> <cmd>               # 多设备时指定目标
hdc kill && hdc start                 # 重启 server（连接异常时）
hdc tmode port 5555                   # 开启 TCP/IP 调试

# ── 应用安装 ──
hdc install entry-default-signed.hap  # 安装 HAP
hdc install -r entry-signed.hap       # 覆盖安装（保留数据）
hdc uninstall com.example.myapp       # 卸载
hdc uninstall -k com.example.myapp    # 卸载但保留数据

# ── 文件传输 ──
hdc file send ./test.db /data/app/el2/100/database/com.example.myapp/entry/test.db
hdc file recv /data/app/el2/100/database/com.example.myapp/entry/test.db ./local.db

# ── Shell ──
hdc shell                             # 交互式 shell
hdc shell ls /data/log                # 单条命令
```

## Key APIs (Summary)

**hilog 日志过滤**：

| 参数 | 作用 |
|------|------|
| `hilog -t APP/CORE/INIT` | 按类型过滤（CORE 含崩溃堆栈） |
| `hilog -L D/I/W/E/F` | 按级别过滤 |
| `hilog --pid <pid>` | 按进程过滤 |
| `hilog -f <domain>` | 按 domain 过滤 |
| `hilog -d` | dump 缓冲区后退出 |
| `hilog > local.log` | 持久化到本地文件 |

**崩溃分析流程**：
1. `hdc shell hilog -t CORE -d` 抓取崩溃日志
2. `hdc shell cat /data/log/faultlog` 查看崩溃详情
3. `hstack <crash_log>` 堆栈符号化（需要与设备版本匹配的 .sym 符号表）

**性能采样**：`hdc shell hidumper --cpu` / `hdc shell hidumper --mem` / `hdc shell hiprofiler`

## Caveats
- **二进制名**: 开发机上实际二进制为 `hdc_std`，文档简写为 `hdc`；确保 PATH 包含正确的 SDK toolchain 目录
- **server 问题**: 连接异常时先 `hdc kill && hdc start`；首次执行 hdc 命令会自动启动 server
- **多设备**: 连接多个设备时大部分命令必须 `-t <deviceId>` 指定目标，否则报错
- **hilog 缓冲区**: 环形缓冲区，高频日志会覆盖旧数据；崩溃后立即抓取，不要延迟
- **符号化**: hstack 要求 .sym 符号表与设备运行版本**完全匹配**；版本不一致则符号化失败，显示 `??` 地址
- **权限**: shell 以受限权限运行，/data 部分路径受 SELinux 限制
- **TCP/IP**: `hdc tmode port <port>` 需先通过 USB 执行；设备重启后失效需重新设置
- **NAPI 崩溃归属**: 结合 `hilog -t CORE` + hstack 符号化判断崩溃在 ArkTS 侧还是 C++ 侧；关注 napi_threadsafe_function 死锁模式

## Composition Hints
- 与 **harmonyos-hvigor-build** 配合：hvigorw 构建产出 HAP → hdc install 部署到设备
- 与 **harmonyos-napi-debug** 协同：hdc 抓取崩溃日志后，NAPI 排障技能指导如何分析跨边界调用栈
- 与 **harmonyos-cpp-cmake** 关联：native 构建需带调试符号（`-g`，不 strip），否则 hstack 符号化无意义
- CI 典型流程：`hvigorw assembleHap → hdc install -r → hdc shell hilog > ci.log`
