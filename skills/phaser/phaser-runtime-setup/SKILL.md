---
name: phaser-runtime-setup
description: "Phaser 3.90 游戏开发：Phaser Runtime：环境检查与初始化。 check.py 按顺序跑 5 项检查，每项独立报告 ok/fail + 修复建议："
tech_stack: [phaser]
---

# Phaser Runtime：环境检查与初始化

> **Runtime skill（前置）**。其他 runtime skill（snapshot / probe / watch / load-check）依赖的 playwright + chromium + scaffold 环境由本 skill 负责检查和初始化。agent 在**首次调用任何 runtime skill** 或 **runner.py 报错疑似环境问题**时应运行这里的 `check.py`。

---

## 什么时候该用

✅ **应该**：
- 首次在本机/本容器使用 runtime skill 之前
- `runner.py` 报下列错误时（典型的环境问题信号）：
  - `playwright is not installed`
  - `Executable doesn't exist at ...` / `BrowserType.launch: ...`
  - `Host system is missing dependencies to run browsers`
  - `timeout waiting for __ready === true`（scaffold 加载不起来）
- CI / 新 Docker 镜像首次运行 runtime skill 之前
- 用户说"runtime skill 不工作 / 跑不起来"时第一步排查

❌ **不该**：
- runner.py 报的是 scene 代码错误（那是业务 bug，不是环境问题）
- 资源 404 / CORS（用 `phaser-runtime-load-check` 而不是本 skill）

---

## 最小调用

```bash
# 只检查，不改动环境
python skills/webgame/phaser-runtime-setup/check.py

# 检查 + 尝试安装缺失组件
python skills/webgame/phaser-runtime-setup/check.py --install

# 机器可读 JSON（agent 解析更方便）
python skills/webgame/phaser-runtime-setup/check.py --json
```

**退出码**：
- `0` = 环境 ready
- `1` = 至少一项检查失败
- `2` = 用法错误或中断

---

## 检查项

`check.py` 按顺序跑 5 项检查，每项独立报告 ok/fail + 修复建议：

| # | 检查 | 通过标准 | 失败修复 |
|---|---|---|---|
| 1 | `python_version` | Python ≥ 3.10 | 升级 Python |
| 2 | `playwright_package` | `import playwright` 成功 | `uv pip install 'playwright>=1.50'` 或 `pip install` |
| 3 | `chromium_binary` | `p.chromium.executable_path` 存在 | `playwright install chromium` |
| 4 | `scaffold_html` | `phaser-runtime-common/scaffold/index.html` 存在 | 检查仓库完整性 |
| 5 | `smoke_launch` | 真跑一次 chromium，加载 scaffold，`window.__ready === true` | 看 detail 和 fix 字段 |

**smoke_launch 是最关键的一项** —— 它不是"检查文件存在"，而是**真的跑一遍**，覆盖所有静态检查漏掉的问题（缺系统库、GPU 不可用、CDN 被墙等）。

---

## JSON 输出 schema

```json
{
  "ok": false,
  "checks": [
    { "name": "python_version",     "ok": true,  "detail": "3.12.3", "fix": "" },
    { "name": "playwright_package", "ok": true,  "detail": "playwright==1.50.0", "fix": "" },
    { "name": "chromium_binary",    "ok": false, "detail": "executable_path=... (missing)",
      "fix": "playwright install chromium" },
    { "name": "scaffold_html",      "ok": true,  "detail": ".../scaffold/index.html", "fix": "" },
    { "name": "smoke_launch",       "ok": false, "detail": "skipped/failed", "fix": "..." }
  ],
  "actions": []
}
```

加 `--install` 时，`actions` 会填入实际执行的安装动作和结果：

```json
{
  "actions": [
    { "action": "install_chromium", "ok": true, "output": "..." }
  ]
}
```

---

## 典型工作流

### 工作流 1：agent 首次调用 runtime skill

```bash
# Step 1: 先检查环境
python skills/webgame/phaser-runtime-setup/check.py --json
# 若 ok === true → 继续正常调用 runner.py
# 若 ok === false → 进入 Step 2
```

```bash
# Step 2: 尝试自动修复
python skills/webgame/phaser-runtime-setup/check.py --install --json
# 若仍 ok === false → 读 checks[].fix 字段，按提示手动处理
#   （例如 Linux 缺系统库需要 sudo，agent 应请用户执行）
```

### 工作流 2：runner.py 报错后排查

```bash
# runner.py 失败，errors 里出现 "Executable doesn't exist" 或 "missing dependencies"
python skills/webgame/phaser-runtime-setup/check.py
# 根据输出定位是哪一项失败
python skills/webgame/phaser-runtime-setup/check.py --install
# 重新跑 runner.py
```

### 工作流 3：CI / 新容器冷启动

在 CI 脚本里把 `check.py --install` 作为 runtime skill 执行前的固定前置步骤：

```bash
python skills/webgame/phaser-runtime-setup/check.py --install || exit 1
python skills/webgame/phaser-runtime-common/runner.py snapshot ...
```

---

## 安装动作的细节

`--install` 会根据失败的检查按顺序尝试：

| 失败项 | 尝试的命令 | 备注 |
|---|---|---|
| `playwright_package` | `uv pip install 'playwright>=1.50'`（若有 uv） 或 `pip install ...` | 项目用 uv 时优先走 uv |
| `chromium_binary` | `python -m playwright install chromium` | 下载约 150MB |
| chromium 缺系统库（Linux） | `python -m playwright install-deps chromium` | **需要 sudo**；失败时 agent 应请用户手动执行 |

安装后会**重新跑一遍所有检查**，所以最终的 `ok` 字段反映的是安装后的状态。

---

## 常见失败 & 排查

| smoke_launch 的 detail | 原因 | 处理 |
|---|---|---|
| `Executable doesn't exist at ...` | chromium 没装或装到了其他 Python 环境 | `python -m playwright install chromium`（确保用的是当前 venv 的 python） |
| `Host system is missing dependencies` | Linux 缺 libnss3/libnspr4/libatk 等 | `playwright install-deps chromium`（需 sudo），或在 Dockerfile 里加依赖 |
| `Timeout waiting for __ready === true` | Phaser CDN (jsdelivr) 加载失败 | 离线环境：把 `scaffold/index.html` 里的 CDN 换成本地 `phaser.min.js` |
| `Target page, context or browser has been closed` | chromium 启动后立刻崩溃 | 通常是 sandbox 权限问题；在容器里加 `--no-sandbox`（需要改 runner.py 的 launch 参数） |
| `net::ERR_FILE_NOT_FOUND` | scaffold 路径错 | 重新 pull 仓库确认 `scaffold/index.html` 存在 |
| macOS 首次弹"无法打开"对话框 | Gatekeeper 阻止未签名二进制 | 在终端 `xattr -dr com.apple.quarantine $(python -m playwright show-browsers-path)` |

---

## 和其他 runtime skill 的关系

```
phaser-runtime-setup  ──┐
                        ├─> phaser-runtime-common/runner.py
phaser-runtime-snapshot ──┤
phaser-runtime-probe    ──┤
phaser-runtime-watch    ──┤
phaser-runtime-load-check ┘
```

`setup` 不参与实际的 Phaser 运行时探查，它只保证"下面 4 个能跑起来"。

**约定**：agent 调用任一 runtime skill 遇到**环境疑似问题**时（错误类型 = `playwright` / `python`），应立即调用 `check.py --json` 诊断；其他错误类型（`pageerror` / `requestfailed` / scene 业务错误）不需要动 setup。
