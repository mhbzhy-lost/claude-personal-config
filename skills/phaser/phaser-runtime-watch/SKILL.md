---
name: phaser-runtime-watch
description: "Phaser 3.90 游戏开发：Phaser Runtime：时序采样。 跑 N 毫秒，每隔一段时间采集一组表达式的值，返回时间序列。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser Runtime：时序采样

> **Runtime skill**。先读 `phaser-runtime-common` 了解统一协议。本 skill 只描述 `watch` action 的用法。

---

## 定位

跑 N 毫秒，每隔一段时间采集一组表达式的值，返回时间序列。

**用来解决"动态行为对不对"**：

- tween 的 x / y / alpha / scale 轨迹是否符合预期缓动曲线
- 物理 body 的 velocity、加速度、碰撞后反弹
- 动画切换时序（walk → idle → jump）
- overlap / collide callback 是否**真的被触发**（计数器 + 采样）
- 定时器 / delayedCall 是否在预期 tick 执行

probe 是"单点探针"，watch 是"时间序列示波器"。

---

## 什么时候该用

✅ **应该**：
- 写完 tween 想确认缓动曲线（linear vs easeOut）到底长什么样
- 调 bounce 参数想看碰撞后的 velocity 变化
- 怀疑 overlap callback 没触发 → 加计数器 + watch
- 验证动画帧率 / 持续时间是否符合设计

❌ **不该**：
- 静态字段查询（用 probe）
- 单帧视觉验证（用 snapshot）
- 只关心最终状态而不关心过程（用 probe 加 `--wait-ms`）

---

## 调用

```bash
python skills/webgame/phaser-runtime-common/runner.py watch \
  --scene /tmp/scene.js \
  --duration 500 \
  --interval 16 \
  --sample "scene.children.list[0].x,scene.children.list[0].y,scene.children.list[0].alpha"
```

| Flag | 说明 | 默认 |
|---|---|---|
| `--scene` | Scene 文件 | 必填 |
| `--duration <ms>` | 采样总时长 | 500 |
| `--interval <ms>` | 采样间隔（下限 8ms） | 16 |
| `--sample "e1,e2,..."` | 逗号分隔的表达式列表 | 空 |

表达式语法和 probe 一样：`scene.xxx` 访问 scene，`game.xxx` 访问 game，`Phaser.xxx` 访问常量。

> **注意**：采样由 Python 侧调度，`interval=16` 对应 ~60fps。实际采样间隔受 Playwright IPC 影响，会略大于 interval，不要依赖精确时序。

### 输出

```json
{
  "ok": true,
  "action": "watch",
  "result": {
    "frames": [
      { "t": 0,   "values": { "scene.children.list[0].x": 100, "scene.children.list[0].y": 300 } },
      { "t": 16,  "values": { "scene.children.list[0].x": 108, "scene.children.list[0].y": 299 } },
      { "t": 32,  "values": { "scene.children.list[0].x": 116, "scene.children.list[0].y": 298 } }
    ],
    "frame_count": 31,
    "duration_ms": 500,
    "page_errors": []
  },
  "errors": []
}
```

---

## 典型工作流

### 场景 1：验证 tween 缓动曲线

```javascript
// /tmp/tween.js
class extends Phaser.Scene {
  create() {
    const box = this.add.rectangle(100, 300, 40, 40, 0xff0000);
    this.tweens.add({
      targets: box,
      x: 700,
      duration: 500,
      ease: 'Sine.easeInOut',
    });
  }
}
```

```bash
python ... watch --scene /tmp/tween.js --duration 520 --interval 20 \
  --sample "scene.children.list[0].x"
```

看返回的 x 序列是不是 S 形曲线（中间快两头慢）。如果是线性变化，说明 ease 没生效。

### 场景 2：验证 overlap callback 被触发

```javascript
// /tmp/overlap.js
class extends Phaser.Scene {
  preload() {
    this.load.image('ball', 'https://labs.phaser.io/assets/sprites/orb-red.png');
    this.load.image('target', 'https://labs.phaser.io/assets/sprites/blue_ball.png');
  }
  create() {
    window.__hitCount = 0;
    const ball = this.physics.add.sprite(100, 300, 'ball');
    ball.setVelocity(400, 0);
    const target = this.physics.add.sprite(400, 300, 'target');
    this.physics.add.overlap(ball, target, () => { window.__hitCount++; });
  }
}
```

```bash
python ... watch --scene /tmp/overlap.js --duration 1500 --interval 50 \
  --sample "window.__hitCount,scene.children.list[0].x"
```

观察 `__hitCount` 从 0 跳到 ≥1 的那一帧，对应的 x 大约是 400。如果始终为 0，说明 overlap 没触发（常见原因：没用 `physics.add.sprite`、没设 body、scene 没开物理）。

### 场景 3：验证碰撞后 velocity 反弹

```javascript
// /tmp/bounce.js
class extends Phaser.Scene {
  create() {
    this.physics.world.setBounds(0, 0, 800, 600);
    const ball = this.physics.add.sprite(100, 300, null);
    ball.body.setSize(20, 20);
    ball.setVelocity(400, 0);
    ball.setCollideWorldBounds(true);
    ball.setBounce(0.8);
  }
}
```

```bash
python ... watch --scene /tmp/bounce.js --duration 3000 --interval 30 \
  --sample "scene.physics.world.bodies.entries[0].velocity.x"
```

看 velocity.x 从 +400 → 0（撞墙那一帧）→ -320（`400 * 0.8`），就能确认 bounce 生效。

### 场景 4：定时器触发时机

```javascript
// /tmp/timer.js
class extends Phaser.Scene {
  create() {
    window.__ticks = [];
    this.time.delayedCall(200, () => window.__ticks.push('a'));
    this.time.delayedCall(400, () => window.__ticks.push('b'));
  }
}
```

```bash
python ... watch --scene /tmp/timer.js --duration 600 --interval 50 \
  --sample "window.__ticks.length"
```

看数组长度在 t≈200 变成 1，t≈400 变成 2。

---

## 常见坑

| 现象 | 原因 | 解决 |
|---|---|---|
| 所有帧 values 都是同一个值 | Scene update 没跑（没创建 physics body 或没 velocity） | 先 probe 确认 scene 里有动态对象 |
| frame_count 比预期少很多 | Playwright IPC 延迟 | 把 interval 调大（比如 32ms），或减少 sample 数量 |
| `__error` 充斥某个表达式 | 表达式访问了未 create 的对象 | 用 `?.` 链或先 probe 确认对象存在 |
| 看不到 overlap 触发 | callback 定义在 scene 作用域里，用 `window.__xxx` 才能采样 | 把计数器写到 `window` 上 |
| duration 结束前进程没退出 | Scene preload 卡住 | 先跑 `load-check` 定位资源 |
| tween 明显没完成 | duration 设得比 tween 的 duration 小 | 把 watch 的 duration 调大一点（tween duration + 100） |

---

## 和其他 runtime skill 的关系

- `probe` = 某一瞬间的快照（单点）
- `watch` = 一段时间的序列（多点）
- `snapshot` = 某一瞬间的画面（单帧图像）

典型组合：**先 snapshot 看初始视觉是否对 → watch 看动态过程 → 最后再 snapshot 看结束状态**。
