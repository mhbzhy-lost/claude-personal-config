---
name: phaser-runtime-probe
description: "Phaser 3.90 游戏开发：Phaser Runtime：表达式求值。 在一个已激活的 Scene 上求值一个或多个 JS 表达式，把静态代码里看不见的运行时真相拿出来。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser Runtime：表达式求值

> **Runtime skill**。先读 `phaser-runtime-common` 了解统一协议。本 skill 只描述 `probe` action 的用法。

---

## 定位

在一个已激活的 Scene 上求值一个或多个 JS 表达式，把静态代码里**看不见**的运行时真相拿出来。

**核心用途**：在 agent 写 `this.anims.play('walk')` / `sprite.setFrame('idle_0')` / `scene.textures.get('atlas')` 这种**依赖字符串 key 的 API** 之前，先用 probe 确认 key 真的存在、拼写大小写对、frame 索引范围对。

> 这是本套件里**改变编码过程最有效的 skill**：它能挡住 Phaser 最常见的一类 bug —— "key 拼错了，运行时才报错"。

---

## 什么时候该用

✅ **应该**：
- 写 `anims.play('key')` 前 → 先 probe 确认 `'key'` 存在
- 写 `setFrame('name')` 前 → 先 probe 列出 atlas 的全部 frame
- 不确定 texture 原始尺寸 → probe 查 `width/height`
- 想知道 tilemap 里有哪些 layer / tileset 名 → probe 列出
- debug "我写的代码没报错但东西没出来" → probe 查 `children.length`

❌ **不该**：
- 想看视觉效果（用 snapshot）
- 想看动态变化（用 watch）
- 只是想验证资源能不能加载（用 load-check 更针对）

---

## 调用

```bash
python skills/webgame/phaser-runtime-common/runner.py probe \
  --scene /tmp/setup.js \
  --expr "scene.textures.get('player').getFrameNames()" \
  [--expr "scene.anims.exists('walk')"] \
  [--expr "scene.children.length"]
```

- `--expr` 可以传多次，结果按表达式字符串聚合成 `{expr: value}`
- 表达式环境：函数签名 `(scene, game, Phaser) => return (表达式)`
  - 用 `scene.xxx` 访问 scene
  - 用 `game.xxx` 访问 `Phaser.Game`
  - 用 `Phaser.xxx` 访问常量 / 工具函数
- 表达式结果必须是 **JSON-serializable**（普通对象/数组/字符串/数字/布尔/null）
  - 返回 Phaser 对象会被自动 toString，通常信息不够，建议取具体字段

### 输出

```json
{
  "ok": true,
  "action": "probe",
  "result": {
    "values": {
      "scene.textures.get('player').getFrameNames()": ["__BASE"],
      "scene.anims.exists('walk')": false
    },
    "page_errors": []
  },
  "errors": []
}
```

表达式抛错时对应 value 是 `{"__error": "...", "__stack": "..."}`，**不会让整个 probe 失败**。

---

## 常用 probe 表达式速查

### Texture / Atlas

```javascript
// 列 texture 的所有 frame 名（atlas 用）
scene.textures.get('atlas').getFrameNames()

// 查 texture 基础尺寸
({
  w: scene.textures.get('player').source[0].width,
  h: scene.textures.get('player').source[0].height,
  frames: scene.textures.get('player').frameTotal
})

// 所有已加载的 texture key
scene.textures.getTextureKeys().filter(k => !k.startsWith('__'))

// frame 是否存在（大小写敏感）
scene.textures.get('atlas').has('idle_0')
```

### Animation

```javascript
// 某个 anim 是否存在
scene.anims.exists('walk')

// 列所有已注册 anim
Object.keys(scene.anims.anims.entries)

// 查 anim 的帧序列
scene.anims.get('walk').frames.map(f => f.textureFrame)
```

### Physics

```javascript
// 当前 scene 里所有 Arcade body 的位置和尺寸
scene.physics.world.bodies.entries.map(b => ({
  x: b.x, y: b.y, w: b.width, h: b.height,
  vx: b.velocity.x, vy: b.velocity.y
}))

// Matter body（如果用了 Matter）
scene.matter.world.localWorld.bodies.length
```

### Tilemap

```javascript
// 列 tilemap 的 layer 名
scene.cache.tilemap.get('map').data.layers.map(l => l.name)

// 列 tileset 名
scene.cache.tilemap.get('map').data.tilesets.map(t => t.name)

// 查活跃 tilemap 的尺寸
({ w: scene.children.list.find(c => c.constructor.name === 'TilemapLayer')?.width })
```

### Cache

```javascript
// 查 json cache
scene.cache.json.get('level1')

// 查 audio cache 的 duration
Object.fromEntries(
  Object.entries(scene.cache.audio.entries.entries)
    .map(([k, v]) => [k, v && v.duration])
)
```

### Scene state

```javascript
// 当前 scene 有多少个 child（包括文字/图片/形状）
scene.children.length

// 列出 children 的类型
scene.children.list.map(c => c.constructor.name)

// scene 的 key
scene.scene.key

// 当前活跃的 scene keys（多 Scene 架构）
game.scene.getScenes(true).map(s => s.scene.key)
```

---

## 典型工作流

### 场景 1：在写 anims.play 前先探查

```javascript
// /tmp/setup.js
class extends Phaser.Scene {
  preload() {
    this.load.atlas('player', 'https://labs.phaser.io/assets/animations/brawler48x48.png',
                    'https://labs.phaser.io/assets/animations/brawler48x48.json');
  }
  create() {
    // 暂时不创建 anim，只是先让 atlas 加载进来
  }
}
```

```bash
python ... probe \
  --scene /tmp/setup.js \
  --expr "scene.textures.get('player').getFrameNames()"
```

agent 拿到 frame 名列表之后，再去写 `anims.create({ key: 'walk', frames: [...], ... })`，确保 frame 名写对。

### 场景 2：多表达式聚合

```bash
python ... probe --scene /tmp/setup.js \
  --expr "scene.textures.get('atlas').getFrameNames().slice(0, 10)" \
  --expr "scene.anims.exists('walk')" \
  --expr "scene.physics.world.bodies.entries.length" \
  --expr "scene.children.length"
```

一次调用拿到四个问题的答案，比分四次调用快。

### 场景 3：debug "东西没出来"

```bash
# agent 写完 Scene，发现截图是空的
python ... probe --scene /tmp/bad-scene.js \
  --expr "scene.children.length" \
  --expr "scene.children.list.map(c => ({ type: c.constructor.name, x: c.x, y: c.y, visible: c.visible }))"
```

一下就能看到是"根本没创建"还是"创建了但在画面外/不可见"。

---

## 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| `{"__error": "scene.xxx is undefined"}` | scene 还没 create 完 | 传 `--wait-ms 50` |
| 表达式里用 `this.xxx` 报错 | scope 是函数不是 scene | 改用 `scene.xxx` |
| 返回值是 `"[object Object]"` | 表达式返回了 Phaser 对象 | 取具体字段或 `Object.keys()` |
| frame 名列表只有 `["__BASE"]` | 这个 texture 不是 atlas，是普通 image | 用 `this.load.atlas` 而不是 `this.load.image` |
| `scene.cache.tilemap.get('map')` 返回 undefined | tilemap 还没 preload | 在 Scene 的 preload 里加 `this.load.tilemapTiledJSON` |
| 表达式里写了多行 | 只能是单一表达式 | 用 IIFE 包起来：`(() => { ... return x; })()` |
