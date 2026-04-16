---
name: phaser-runtime-common
description: "Phaser 3.90 游戏开发：Phaser Runtime Skills：共享基建与总览。 runtime skills 是 agent 编码时的\"眼睛和手\"。正确用法是边写边调用："
tech_stack: [phaser]
---

# Phaser Runtime Skills：共享基建与总览

> **这是 runtime skill，不是静态知识。** 它让 agent 在**编码过程中**通过 headless chromium 探查真实运行时状态，而不是写完再验证。适用版本：Phaser 3.90.0。

---

## 定位

| 类型 | 回答的问题 | 典型代表 |
|---|---|---|
| **静态 skill**（25 个） | "该怎么写" | `phaser-asset-loading`、`phaser-physics`、`phaser-tweens` … |
| **runtime skill**（5 个） | "写出来跑起来对不对" | `phaser-runtime-snapshot` / `-probe` / `-watch` / `-load-check` |

runtime skills 是 agent 编码时的"眼睛和手"。**正确用法是边写边调用**：
- 写 10 行 → probe 一下 → 继续写 10 行 → snapshot 一下 → 调参数 → 再 snapshot
- ❌ 错误用法：写完整个场景再一次性 snapshot 看结果（回退成"事后验证"）

---

## 前置要求

**首次使用前**，或者 `runner.py` 报疑似环境问题的错误时（`playwright is not installed` / `Executable doesn't exist` / `Host system is missing dependencies` / `timeout waiting for __ready`），调用 `phaser-runtime-setup`：

```bash
# 只检查
python skills/webgame/phaser-runtime-setup/check.py --json

# 检查 + 自动安装缺失组件（playwright 包 / chromium 二进制 / Linux 系统库）
python skills/webgame/phaser-runtime-setup/check.py --install --json
```

`check.py` 会跑 5 项检查并真跑一次 chromium smoke test。详见 `phaser-runtime-setup/SKILL.md`。

**何时不该动 setup**：runner.py 报的是 `pageerror` / `requestfailed` / scene 业务错误 —— 那是代码问题，不是环境问题。

---

## 统一调用协议

所有 runtime skill 都通过同一个脚本 `runner.py` 执行：

```bash
python skills/webgame/phaser-runtime-common/runner.py <action> [flags]
```

`<action>` ∈ `snapshot` / `probe` / `watch` / `load-check`。

### 通用 flags

| Flag | 说明 |
|---|---|
| `--scene <path>` | JS 文件，内容是一个 **Scene class 表达式**（见下方"Scene 文件格式"） |
| `--width` / `--height` | 画布尺寸（默认 800×600） |
| `--wait-ms <ms>` | Scene 进入 create 后再额外等待 N ms（默认 0） |

### 统一输出

stdout 一行 JSON：

```json
{
  "ok": true,
  "action": "snapshot",
  "result": { ... },
  "errors": [ { "type": "...", "message": "..." }, ... ]
}
```

- `ok: false` 且 `errors[]` 非空时表示失败，进程退出码 1
- **所有错误走 stdout JSON，不走 stderr**，方便 agent 统一解析
- `result` 的内容因 action 而异，参见各 action 的 skill

---

## Scene 文件格式

`--scene` 指向的文件**不是模块**，而是一个单一 JS 表达式，求值后应得到一个 Scene class 或普通对象：

### 形式 1：匿名 class（推荐）

```javascript
// /tmp/scene.js
class extends Phaser.Scene {
  preload() {
    this.load.image('logo', 'https://labs.phaser.io/assets/sprites/phaser3-logo.png');
  }
  create() {
    this.add.image(400, 300, 'logo');
  }
}
```

### 形式 2：对象字面量

```javascript
// /tmp/scene.js
({
  preload() { /* ... */ },
  create() { /* ... */ },
  update() { /* ... */ },
})
```

> runner 会在你的 class 外面再包一层，在 `create()` 末尾设置 `window.__sceneReady = true` 并记录 `window.__activeScene = this`，供 probe / watch 使用。不要自己改 `window.__sceneReady`。

---

## 运行时注入的全局钩子（scaffold 提供）

这些钩子由 `scaffold/index.html` 定义，agent 写 probe 表达式时可以引用：

| 钩子 | 作用 |
|---|---|
| `window.__activeScene` | 当前进入 create 的 Scene 实例 |
| `window.__game` | `Phaser.Game` 实例 |
| `window.__errors[]` | 脚本阶段收集的 JS 异常 |
| `window.__sceneReady` | true 表示 Scene 已进入 create |
| `window.__probe(expr)` | 在 scene 上下文求值一个表达式 |
| `window.__collectSample(exprs)` | 批量求值，返回 `{expr: value}` |
| `window.__dumpLoaded()` | 汇总已加载的 textures/audio/json/tilemap 元信息 |

**probe 表达式约定**：函数签名是 `function(scene, game, Phaser)`，所以表达式里用 `scene.xxx` 访问 scene 成员，用 `game.xxx` 访问 `Phaser.Game`，用 `Phaser.xxx` 访问常量。

示例：
```javascript
scene.textures.get('player').getFrameNames()
scene.anims.exists('walk')
scene.children.list.length
game.renderer.type  // WEBGL = 2, CANVAS = 1
```

---

## 和静态 skill 的联动

写以下代码**之前**，建议调用对应 runtime skill：

| 准备写… | 先调用 | 为什么 |
|---|---|---|
| `preload()` 加载新资源 | `phaser-runtime-load-check` | 提前捕获 404 / CORS / atlas 不匹配 |
| `this.anims.play('key')` | `phaser-runtime-probe` | 确认 key 存在，不要盲打 |
| `sprite.setFrame('name')` | `phaser-runtime-probe` | 列出 atlas 的真实 frame 名 |
| body.setSize / setOffset | `phaser-runtime-snapshot --physics-debug` | 看到 body 实际位置 |
| 自定义 tween 缓动 | `phaser-runtime-watch` | 采样 x/y/alpha 轨迹验证曲线 |

---

## 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| `timeout waiting for __sceneReady` | Scene 的 `preload` 资源加载失败卡住 | 先跑 `load-check` 定位资源 |
| 截图是黑屏 | headless WebGL 降级 + Scene 还没渲染 | 传 `--wait-ms 200` 让 Phaser 至少跑一帧 |
| probe 结果是 `{__error: "..."}` | 表达式抛错（例如访问 undefined 属性） | 先用更简单的表达式确认 scene 状态 |
| `loaderror: file://...` | `--scene` 里用了相对路径 | 资源 URL 必须是绝对 `file://` 或 `http(s)://` |
| 每次调用慢 1–2 秒 | 每次 spawn 一个 chromium | 先接受它；如果频次很高再考虑常驻 daemon |
| FX / PostFX 不生效 | WEBGL 在 headless 下某些扩展不支持 | 用 `--physics-debug` 或 sprite tint 替代验证 |
| Phaser CDN 加载慢 | 宿主页走 jsdelivr | 离线环境可改 scaffold 为本地 phaser.min.js |

---

## 目录结构

```
skills/webgame/phaser-runtime-common/
├── SKILL.md          # 本文件：总览 + 协议
├── runner.py         # 共享 playwright launcher（所有 action 入口）
└── scaffold/
    └── index.html    # Phaser 3.90 宿主页 + __runScene / __probe 钩子
```

各 action 的 skill 只有一个 SKILL.md，描述"什么时候用 + 调用示例"，不重复本文件的协议。
