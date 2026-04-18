---
name: phaser-runtime-snapshot
description: "Phaser 3.90 游戏开发：Phaser Runtime：Scene 截图。 跑一段 Scene 代码，截一帧 PNG，返回图片路径 + 场景元信息。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser Runtime：Scene 截图

> **Runtime skill**。先读 `phaser-runtime-common` 了解统一协议。本 skill 只描述 `snapshot` action 的用法。

---

## 定位

跑一段 Scene 代码，截一帧 PNG，返回图片路径 + 场景元信息。

**用来解决"视觉效果对不对"**：

- sprite 是否显示在了预期位置
- `setScale` / `setOrigin` / `setRotation` 的实际视觉
- tint / alpha / blendMode 是否符合预期
- 粒子发射器的位置、颜色、扩散范围
- camera viewport / zoom / scroll
- tilemap layer 的绘制是否正确
- body 和贴图的对齐（配 `--physics-debug`）

---

## 什么时候该用

✅ **应该**：
- 写完 sprite 布局的第一版 → 截图看对不对
- 调 particle emitter 参数 → 截图看视觉
- 不确定 body.setSize / setOffset 的对齐 → `--physics-debug` 截图
- tween 到中间帧想看静止状态 → `--wait-ms` 定到那一帧再截

❌ **不该**：
- 只是想查一个字段的值（用 `phaser-runtime-probe`）
- 想看动态变化过程（用 `phaser-runtime-watch`）
- 只想验证资源能不能加载（用 `phaser-runtime-load-check`）

---

## 调用

```bash
python skills/webgame/phaser-runtime-common/runner.py snapshot \
  --scene /tmp/my-scene.js \
  --out /tmp/shot.png \
  [--width 800] [--height 600] \
  [--wait-ms 100] \
  [--physics-debug]
```

| Flag | 说明 |
|---|---|
| `--scene` | Scene 文件（格式见 runtime-common） |
| `--out` | 输出 PNG 路径，目录不存在会自动创建 |
| `--wait-ms` | Scene create 后再等 N ms 再截图（让动画/物理跑几帧） |
| `--physics-debug` | 叠加 Arcade body 可视化（绿框 = 动态体，蓝框 = 静态体） |

### 输出

```json
{
  "ok": true,
  "action": "snapshot",
  "result": {
    "screenshot": "/tmp/shot.png",
    "meta": { "width": 800, "height": 600, "renderer": 2, "children": 3 },
    "page_errors": []
  },
  "errors": []
}
```

`renderer: 2` = WEBGL，`1` = CANVAS。headless 下大概率是 WEBGL。

---

## 典型工作流

### 场景 1：调 body 和贴图对齐

```javascript
// /tmp/scene.js
class extends Phaser.Scene {
  preload() {
    this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
  }
  create() {
    const p = this.physics.add.sprite(400, 300, 'player');
    p.body.setSize(20, 40);
    p.body.setOffset(6, 4);
  }
}
```

```bash
python ... snapshot --scene /tmp/scene.js --out /tmp/body.png --physics-debug
```

看 PNG 里绿框（body）是否贴合人物脚下，不对就改 offset 再截。

### 场景 2：调粒子发射器

```javascript
// /tmp/particles.js
class extends Phaser.Scene {
  preload() {
    this.load.image('spark', 'https://labs.phaser.io/assets/particles/white.png');
  }
  create() {
    this.add.particles(400, 300, 'spark', {
      speed: 100,
      lifespan: 600,
      scale: { start: 1, end: 0 },
      blendMode: 'ADD',
    });
  }
}
```

```bash
python ... snapshot --scene /tmp/particles.js --out /tmp/p0.png --wait-ms 200
# 等 200ms 让粒子扩散出来
```

看扩散范围、密度、颜色是否符合预期，不对就改参数再截。

### 场景 3：验证 camera follow + zoom

```javascript
class extends Phaser.Scene {
  create() {
    const target = this.add.rectangle(600, 400, 40, 40, 0xff0000);
    this.cameras.main.startFollow(target);
    this.cameras.main.setZoom(1.5);
  }
}
```

```bash
python ... snapshot --scene /tmp/cam.js --out /tmp/cam.png --wait-ms 50
```

---

## 迭代式调参

snapshot 最大的价值是**快速闭环**。同一个 Scene 改几行参数再截一次，成本极低：

```bash
# 改 Scene 文件的一个数字
sed -i '' 's/speed: 100/speed: 300/' /tmp/particles.js
python ... snapshot --scene /tmp/particles.js --out /tmp/p1.png --wait-ms 200
# 对比 p0.png 和 p1.png
```

agent 在写代码时应该**每改一个视觉相关参数就截一次**，而不是攒一大堆参数再一次验证。

---

## 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| 截图全黑 | create 后立刻截图，还没渲染任何帧 | 加 `--wait-ms 50` |
| 看不到物理 body | 没加 `--physics-debug` | 加上 |
| 粒子空荡荡 | 发射器刚启动，粒子还没出来 | `--wait-ms 200~500` |
| 截图只截到左上一角 | 没传 `--width/--height`，默认 800×600 | 显式指定匹配 Scene 的尺寸 |
| `renderer: 1` 降级到 Canvas | headless chromium 缺 GPU | 大多数情况无影响；FX/Shader 会失效 |
