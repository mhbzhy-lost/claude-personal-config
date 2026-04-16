---
name: phaser-skills-common
description: "Phaser 3.90 游戏开发：Phaser Skills 套件总览。 本套件内容基于 Phaser 3.90.0（代号 \"Tsugumi\"），发布于 2025 年 5 月 23 日。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser Skills 套件总览

## 版本锁定

**本套件内容基于 Phaser 3.90.0（代号 "Tsugumi"），发布于 2025 年 5 月 23 日。**

- 这是 Phaser v3 的最终稳定版本，此后重心转向 Phaser v4
- Phaser v4 引入全新 Beam 渲染器，Shader/PostFX API 有重大变更
- 本套件所有代码示例均针对 v3.90.x，不适用于 v4.x
- 参考来源：https://docs.phaser.io/api-documentation/api-documentation（26 个命名空间，完整覆盖）

---

## 套件结构（25 个静态 skill + 6 个 runtime skill）

### 核心系统（必读）

| Skill 文件 | 覆盖 API 命名空间 | 内容 |
|---|---|---|
| `phaser-core-scene` | `Phaser.Core` / `Phaser.Scenes` | 游戏配置、Scene 生命周期、SceneManager |
| `phaser-game-objects` | `Phaser.GameObjects`（部分）| Sprite/Image/Text/Shape/Group、对象池 |
| `phaser-physics` | `Phaser.Physics` | Arcade/Matter 物理、Body 属性、碰撞 |
| `phaser-animations` | `Phaser.Animations` | 帧动画（AnimationManager）|
| `phaser-tweens` | `Phaser.Tweens` | TweenManager、Tween、TweenChain、Counter |
| `phaser-input` | `Phaser.Input` | 键盘、鼠标/触控、手柄、Hit Area |
| `phaser-camera` | `Phaser.Cameras` | 主摄像机、跟随、多摄像机、特效 |
| `phaser-events` | `Phaser.Events` | Scene 事件、跨 Scene 通信、TimerEvent |

### 资源与数据

| Skill 文件 | 覆盖 API 命名空间 | 内容 |
|---|---|---|
| `phaser-asset-loading` | `Phaser.Loader` | Preload、进度条、动态加载 |
| `phaser-cache` | `Phaser.Cache` / `Phaser.Textures` | 缓存读写、TextureManager、内存释放 |
| `phaser-data` | `Phaser.Data` | DataManager、Registry 跨场景状态 |
| `phaser-time` | `Phaser.Time` | Clock、Timeline、TimerEvent、时间缩放 |

### 视觉与渲染

| Skill 文件 | 覆盖 API 命名空间 | 内容 |
|---|---|---|
| `phaser-fx` | `Phaser.FX` | 15 种 PostFX 特效（Glow/Blur/Bloom 等）|
| `phaser-display` | `Phaser.Display` | Color、ColorMatrix、Align、Bounds、Masks |
| `phaser-particles` | `Phaser.GameObjects.Particles` | 粒子发射器、EmitterOp、Zone |
| `phaser-renderer` | `Phaser.Renderer` | WebGL/Canvas 渲染器、Pipeline、截图 |
| `phaser-scale` | `Phaser.Scale` | ScaleManager、缩放模式、全屏、方向 |

### 游戏世界

| Skill 文件 | 覆盖 API 命名空间 | 内容 |
|---|---|---|
| `phaser-tilemaps` | `Phaser.Tilemaps` | Tiled 地图、图层、碰撞 |
| `phaser-curves` | `Phaser.Curves` | Path、Bezier、Spline、PathFollower |
| `phaser-geom` | `Phaser.Geom` | 7 种几何形状 + Intersects 碰撞检测 |
| `phaser-math` | `Phaser.Math` | 数值工具、Angle、Distance、Easing、Vector2 |

### 音频

| Skill 文件 | 覆盖 API 命名空间 | 内容 |
|---|---|---|
| `phaser-audio` | `Phaser.Sound` | 音效加载/播放、AudioSprite、浏览器解锁 |

### 扩展与系统

| Skill 文件 | 覆盖 API 命名空间 | 内容 |
|---|---|---|
| `phaser-plugins` | `Phaser.Plugins` | Global/Scene Plugin、PluginManager |
| `phaser-structs` | `Phaser.Structs` | List、Map、Set、Size、ProcessQueue |
| `phaser-dom` | `Phaser.DOM` | DOM 工具函数、DOMElement 游戏内 HTML |

---

## 运行时技能（Runtime Skills）

> 上面 25 个 skill 是**静态知识**，回答"该怎么写"。下面 6 个 **runtime skill** 是**执行能力**，回答"写出来跑起来对不对"。它们通过 **playwright + headless chromium** 让 agent 在**编码过程中**就能探查运行时真相，不是事后验证。

| Skill 文件 | 作用 | 什么时候用 |
|---|---|---|
| `phaser-runtime-setup` | **环境检查与初始化**（playwright + chromium + scaffold smoke test） | 首次使用前 / runner.py 报环境错误时 |
| `phaser-runtime-common` | 共享 runner.py + Phaser 3.90 宿主页 + 统一调用协议 | 所有 action skill 的前置文档 |
| `phaser-runtime-snapshot` | 跑 Scene 代码并截图 | 不确定视觉效果（位置/缩放/tint/粒子/camera）时 |
| `phaser-runtime-probe` | 在活跃 scene 上求值表达式 | 写 `anims.play` / `setFrame` 等依赖字符串 key 的 API 之前 |
| `phaser-runtime-watch` | 采样 N 毫秒的关键状态序列 | 调 tween 曲线 / 物理参数 / 动画时序 / 验证 callback 被触发 |
| `phaser-runtime-load-check` | 只跑 preload 验证资源 | 写 `preload()` 之前或收到新资源清单时 |

**前置要求**：项目已在 `pyproject.toml` 声明 `playwright>=1.50`，首次使用需执行 `playwright install chromium`（下载浏览器二进制）。不确定环境是否就绪时，直接跑：

```bash
python skills/webgame/phaser-runtime-setup/check.py --install --json
```

它会自动诊断 5 项检查并尝试修复缺失组件。

**定位提醒**：这些不是"测试工具"，而是 agent 编码时的**眼睛和手**。正确用法是**边写边调用** —— 每完成一小步就 probe / snapshot 一次，而不是写完整个场景后一次性验证。静态 skill 管"知道该怎么写"，runtime skill 管"知道写出来真的对"，二者互补。

**统一调用入口**：

```bash
python skills/webgame/phaser-runtime-common/runner.py <action> [flags]
# action ∈ snapshot | probe | watch | load-check
```

所有 runtime skill 共享同一个 `runner.py`，输出统一的 JSON 格式。详见 `phaser-runtime-common/SKILL.md`。

---

## 加载指引

**优先加载（几乎所有游戏都需要）：**
```
skills/webgame/phaser-core-scene/SKILL.md
skills/webgame/phaser-game-objects/SKILL.md
skills/webgame/phaser-asset-loading/SKILL.md
```

**按需加载（遇到对应需求时读取）：**

| 需求场景 | 加载的 Skill |
|---|---|
| 物理/碰撞 | `phaser-physics` |
| 帧动画 | `phaser-animations` |
| 补间动画 | `phaser-tweens` |
| 键盘鼠标手柄 | `phaser-input` |
| 摄像机控制 | `phaser-camera` |
| 定时器/时间轴 | `phaser-time` |
| Scene/对象事件 | `phaser-events` |
| Tiled 地图 | `phaser-tilemaps` |
| 音频音效 | `phaser-audio` |
| 粒子特效 | `phaser-particles` |
| PostFX 视觉效果 | `phaser-fx` |
| 颜色/对齐/遮罩 | `phaser-display` |
| 曲线/路径运动 | `phaser-curves` |
| 几何/碰撞检测 | `phaser-geom` |
| 数学工具/向量 | `phaser-math` |
| 缓存/内存管理 | `phaser-cache` |
| 数据状态管理 | `phaser-data` |
| 屏幕缩放适配 | `phaser-scale` |
| 自定义 Shader | `phaser-renderer` |
| 插件开发 | `phaser-plugins` |
| 游戏内 HTML 表单 | `phaser-dom` |
| 内部数据结构 | `phaser-structs` |

---

## 核心架构概览

```
Phaser.Game
├── SceneManager（管理多个 Scene）
│   └── Scene
│       ├── this.load   → LoaderPlugin      (phaser-asset-loading)
│       ├── this.add    → GameObjectFactory (phaser-game-objects)
│       ├── this.physics → PhysicsPlugin    (phaser-physics)
│       ├── this.anims  → AnimationManager  (phaser-animations)
│       ├── this.tweens → TweenManager      (phaser-tweens)
│       ├── this.input  → InputPlugin       (phaser-input)
│       ├── this.cameras → CameraManager    (phaser-camera)
│       ├── this.sound  → SoundManager      (phaser-audio)
│       ├── this.events → EventEmitter      (phaser-events)
│       ├── this.time   → Clock             (phaser-time)
│       ├── this.data   → DataManager       (phaser-data)
│       ├── this.cache  → CacheManager      (phaser-cache)
│       └── this.scale  → ScaleManager      (phaser-scale)
├── TextureManager      → this.textures     (phaser-cache)
├── PluginManager       → this.plugins      (phaser-plugins)
└── Renderer            → this.sys.renderer (phaser-renderer)

独立工具命名空间（不依附 Scene）：
├── Phaser.Math         → 数学工具          (phaser-math)
├── Phaser.Geom         → 几何图形          (phaser-geom)
├── Phaser.Curves       → 曲线/路径         (phaser-curves)
├── Phaser.Display      → 颜色/对齐/遮罩    (phaser-display)
├── Phaser.FX           → 视觉特效          (phaser-fx)
├── Phaser.Structs      → 数据结构          (phaser-structs)
└── Phaser.DOM          → DOM 工具          (phaser-dom)
```

---

## 常见陷阱速查

| 问题 | 原因 | 解决方案 |
|---|---|---|
| 物理对象不响应碰撞 | 用了 `this.add.sprite` | 改用 `this.physics.add.sprite` |
| 音频不播放 | 浏览器需要用户手势才能解锁 AudioContext | 监听 `sound.once('unlocked', ...)` |
| FX 特效不生效 | Canvas 渲染器不支持 FX | 确保 `type: Phaser.AUTO` 或 `WEBGL` |
| 事件监听器内存泄漏 | Scene 停止时未清理 | 在 `shutdown` 事件中统一移除 |
| 动画帧率不稳定 | frameRate 受游戏 FPS 影响 | 用 `duration`（ms）替代 `frameRate` |
| 物理体不更新 | 直接修改了 sprite 属性 | 用 setter 方法，必要时调用 `refreshBody()` |
| Tilemap 碰撞不生效 | Tiled 没设置 tile 属性 | 开启 `arcade.debug: true` 排查 |
| 全屏 API 无效 | 未由用户手势触发 | 绑定到 `pointerdown` 事件 |
| DOMElement 不显示 | 未开启 `dom.createContainer` | 在 game config 中添加 `dom: { createContainer: true }` |
| 动态加载不生效 | 非 preload 阶段忘记调用 `this.load.start()` | 手动调用 start() |

---

## 何时从静态 skill 升级为 runtime 验证

遇到以下情况，**停下来**先调一次 runtime skill，再继续写代码。这是防止"盲写一大段、运行时一堆坑"的关键分水岭：

| 如果你准备写… | 先调用 | 为什么 |
|---|---|---|
| `preload()` 里加载新资源 | `phaser-runtime-load-check` | 提前捕获 404 / CORS / atlas 不匹配 |
| `this.anims.play('key')` | `phaser-runtime-probe` 查 `scene.anims.exists('key')` | anim key 拼错运行时才报错 |
| `sprite.setFrame('name')` | `phaser-runtime-probe` 列 `scene.textures.get('atlas').getFrameNames()` | 不猜 frame 名 |
| `anims.create({ frames: [...] })` | `phaser-runtime-probe` 拿真实 frame 列表 | 避免引用不存在的帧 |
| `body.setSize` / `setOffset` | `phaser-runtime-snapshot --physics-debug` | 肉眼看 body 和贴图对齐 |
| 自定义 tween 缓动函数 | `phaser-runtime-watch` 采样目标属性 | 验证缓动曲线真的是 S 形/指数/弹性 |
| `overlap` / `collide` callback | `phaser-runtime-watch` 采样 `window.__hitCount` | 确认 callback 真的被触发 |
| 粒子发射器参数（speed/lifespan/scale） | `phaser-runtime-snapshot --wait-ms 200` | 看扩散范围和密度 |
| tilemap 加载与 layer 引用 | `phaser-runtime-probe` 列 `scene.cache.tilemap.get('map').data.layers` | 不猜 layer 名 |

**简记**：涉及"字符串 key / 视觉效果 / 时序行为 / 资源路径"的代码，**写之前先 runtime 一下**，比写完 debug 快得多。
