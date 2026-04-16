---
name: phaser-runtime-load-check
description: "Phaser 3.90 游戏开发：Phaser Runtime：资源预检。 给定一份资源清单（JSON 数组），构造一个只有 preload() 的空 Scene，实际跑一次加载，报告每个资源是成功还是失败，并对成功的资源返回元信息（texture 尺寸、atlas frame 数、audio 时长、json 内容概要）。"
tech_stack: [phaser]
---

# Phaser Runtime：资源预检

> **Runtime skill**。先读 `phaser-runtime-common` 了解统一协议。本 skill 只描述 `load-check` action 的用法。

---

## 定位

给定一份资源清单（JSON 数组），构造一个只有 `preload()` 的空 Scene，**实际跑一次加载**，报告每个资源是成功还是失败，并对成功的资源返回元信息（texture 尺寸、atlas frame 数、audio 时长、json 内容概要）。

**用来解决"代码看起来没错但游戏黑屏"**：

- 资源 URL 拼错、404
- 大小写敏感的文件名
- atlas 的 json 和 png 不匹配
- tilemap 引用的 tileset 找不到
- CORS 被拦
- 本地文件协议路径错

这些问题在静态代码里**完全看不出来**，只有加载时才暴露。

---

## 什么时候该用

✅ **应该**：
- 刚写 `preload()` 之前 → 先 load-check 一次资源清单
- 刚收到设计师发来的新资源包 → 批量 load-check 验证没丢文件
- debug "游戏加载后空白" → 跑 load-check 看哪个资源出错
- 写 atlas 前 → 验证 json 和 png 都能加载且 frame 数正确

❌ **不该**：
- 已经加载成功的资源，只是想查运行时状态（用 probe）
- 调试加载**之后**的逻辑（用 snapshot / watch）

---

## 调用

```bash
python skills/webgame/phaser-runtime-common/runner.py load-check \
  --config /tmp/assets.json
```

### assets.json 格式

一个数组，每项描述一个加载请求。**两种写法二选一**：

#### 写法 1：type + key + url（推荐，简洁）

```json
[
  { "type": "image",  "key": "sky",    "url": "https://labs.phaser.io/assets/skies/space3.png" },
  { "type": "image",  "key": "logo",   "url": "https://labs.phaser.io/assets/sprites/phaser3-logo.png" },
  { "type": "audio",  "key": "shoot",  "url": "https://labs.phaser.io/assets/audio/SoundEffects/blaster.mp3" },
  { "type": "json",   "key": "config", "url": "https://labs.phaser.io/assets/loader-tests/test.json" }
]
```

`type` 是 `this.load.<type>` 方法名，常用：
- `image` / `spritesheet` / `atlas` / `multiatlas`
- `audio` / `audioSprite`
- `json` / `xml` / `html` / `text` / `binary`
- `tilemapTiledJSON` / `tilemapCSV`
- `bitmapFont` / `glsl` / `video`

#### 写法 2：显式 args（需要 atlas 等多参数 API 时）

```json
[
  {
    "type": "atlas",
    "key": "player",
    "args": [
      "player",
      "https://labs.phaser.io/assets/animations/brawler48x48.png",
      "https://labs.phaser.io/assets/animations/brawler48x48.json"
    ]
  },
  {
    "type": "spritesheet",
    "key": "dude",
    "args": [
      "dude",
      "https://labs.phaser.io/assets/sprites/dude.png",
      { "frameWidth": 32, "frameHeight": 48 }
    ]
  }
]
```

`args` 是直接传给 `this.load.<type>(...)` 的参数数组。

### 输出

```json
{
  "ok": true,
  "action": "load-check",
  "result": {
    "report": [
      {
        "key": "sky",
        "type": "image",
        "ok": true,
        "metadata": { "key": "sky", "width": 800, "height": 600, "frameNames": [], "frameCount": 1 }
      },
      {
        "key": "missing",
        "type": "image",
        "ok": false,
        "error": "loaderror: https://example.com/404.png"
      }
    ],
    "loaded": {
      "textures": [ ... ],
      "audio":    [ ... ],
      "json":     [ ... ],
      "tilemap":  [ ... ]
    },
    "page_errors": []
  },
  "errors": []
}
```

- `report[]` 每项对应 assets.json 里的一项，标记 ok 或 error
- `loaded` 是整体 dump，按类型列出实际进入缓存的资源（可用来交叉验证）
- 对 texture / audio 成功项，`metadata` 里有尺寸 / 时长等真实数据

---

## 典型工作流

### 场景 1：preload 前预检

agent 准备写：

```javascript
preload() {
  this.load.image('sky', 'assets/sky.png');
  this.load.image('ground', 'assets/platform.png');
  this.load.atlas('player', 'assets/player.png', 'assets/player.json');
  this.load.audio('music', 'assets/bgm.mp3');
}
```

**先别急着写**，先做 load-check：

```bash
cat > /tmp/assets.json <<EOF
[
  { "type": "image", "key": "sky",    "url": "file:///Users/me/game/assets/sky.png" },
  { "type": "image", "key": "ground", "url": "file:///Users/me/game/assets/platform.png" },
  { "type": "atlas", "key": "player", "args": ["player", "file:///Users/me/game/assets/player.png", "file:///Users/me/game/assets/player.json"] },
  { "type": "audio", "key": "music",  "url": "file:///Users/me/game/assets/bgm.mp3" }
]
EOF

python skills/webgame/phaser-runtime-common/runner.py load-check --config /tmp/assets.json
```

看输出：
- 全部 ok ✅ → 放心写 preload
- 某个失败 → 先修文件路径 / 文件名大小写 / CORS

### 场景 2：验证 atlas 的 frame 数

```json
[
  {
    "type": "atlas",
    "key": "brawler",
    "args": [
      "brawler",
      "https://labs.phaser.io/assets/animations/brawler48x48.png",
      "https://labs.phaser.io/assets/animations/brawler48x48.json"
    ]
  }
]
```

```bash
python ... load-check --config /tmp/atlas.json
```

`metadata.frameCount` 和 `metadata.frameNames` 会告诉你 atlas 里到底有多少帧、叫什么名字。这些信息 agent 接下来就可以直接用在 `anims.create({ frames: [...] })` 里，不用猜。

### 场景 3：批量验证一个资源目录

写个小脚本把 `assets/**/*.png` 展开成 JSON 数组，一次性 load-check 全部文件，快速找出坏文件。

---

## 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| 所有 `file://` 资源都失败 | chromium 对 `file://` 跨目录访问有限制 | 起个本地 http server（`python -m http.server`），用 `http://localhost:8000/...` |
| atlas 报 "Texture JSON Error" | json 和 png 不匹配（可能是两份不同版本） | 用正确的配对 json |
| audio key 成功但 duration 为 null | 有些浏览器在 headless 下音频解码失败 | 能通过 `ok: true` 确认文件存在就够了；运行时会正常解码 |
| tilemapTiledJSON 成功但没 tileset 信息 | tileset 需要单独 `load.image` | 清单里补上 tileset 对应的 image |
| `"unsupported type"` | type 名拼错（例如 `Audio` 而不是 `audio`） | 小写开头，对齐 `this.load.*` 方法名 |
| filecomplete 没触发 | 某些 loader 不触发标准事件 | 结合 `loaded` 段的整体 dump 二次确认 |
| 本地路径报 CORS | file:// 访问 http 资源 | 清单里统一用 http(s) 或统一用 file:// |

---

## 和其他 runtime skill 的关系

- `load-check` = **写 preload 之前**就跑一次，低成本预检
- `probe` = preload **之后**查运行时真相（frame 名、anim key 等）
- `snapshot` / `watch` = preload **之后**验证视觉 / 动态

正确顺序：**load-check → 写 preload → probe → 写 create → snapshot → 写 update → watch**。
