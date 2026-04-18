---
name: phaser-animations
description: "Phaser 3.90 游戏开发：动画系统（帧动画 + Tween）。 注意：优先用 duration（ms）而非 frameRate，因为 frameRate 受游戏帧率影响。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：动画系统（帧动画 + Tween）

> 适用版本：Phaser 3.90.0

---

## 帧动画（AnimationManager）

### 加载 Spritesheet

```javascript
preload() {
  this.load.spritesheet('player', 'assets/player.png', {
    frameWidth: 32,
    frameHeight: 48
  });
}
```

### 定义动画

```javascript
create() {
  // 全局动画（多个 Sprite 可共用，节省内存）
  this.anims.create({
    key: 'walk',
    frames: this.anims.generateFrameNumbers('player', { start: 0, end: 7 }),
    frameRate: 10,   // 帧/秒
    repeat: -1       // -1 = 无限循环
  });

  this.anims.create({
    key: 'jump',
    frames: this.anims.generateFrameNumbers('player', { start: 8, end: 11 }),
    frameRate: 15,
    repeat: 0        // 播放一次
  });

  this.anims.create({
    key: 'idle',
    frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }),
    frameRate: 5,
    repeat: -1,
    yoyo: true       // 到末尾后倒放（呼吸效果）
  });
}
```

### AnimationConfig 完整参数

```javascript
this.anims.create({
  key: 'explode',
  frames: [...],
  frameRate: 15,
  repeat: 2,          // 重复次数（0=只播一次, -1=无限）
  repeatDelay: 100,   // 每次重复前等待（ms）
  delay: 0,           // 首次播放延迟（ms）
  yoyo: false,        // 到末尾后倒放
  duration: 1500,     // 总时长（ms）—覆盖 frameRate
  showOnStart: true,  // 播放前显示首帧
  hideOnComplete: true // 播完后隐藏 Sprite
});
```

**注意：优先用 `duration`（ms）而非 `frameRate`，因为 frameRate 受游戏帧率影响。**

### 播放动画

```javascript
sprite.play('walk');
sprite.play('walk', true);        // true = 忽略正在播放同名动画（不重启）
sprite.anims.play('walk');
sprite.anims.stop();
sprite.anims.pause();
sprite.anims.resume();

// 查询状态
sprite.anims.isPlaying('walk')
sprite.anims.currentAnim.key
```

### 动画事件

```javascript
sprite.on('animationstart', (anim, frame) => { });
sprite.on('animationupdate', (anim, frame) => { });
sprite.on('animationrepeat', (anim, frame) => { });
sprite.on('animationcomplete', (anim, frame) => {
  if (anim.key === 'die') {
    sprite.destroy();
  }
});
sprite.on('animationstop', (anim, frame) => { });
```

### AnimationManager（全局管理）

```javascript
// 查询/移除
this.anims.get('walk')
this.anims.exists('walk')
this.anims.remove('walk')

// 所有 Sprite 共享同一份动画数据，无需每个 Sprite 单独定义
const s1 = this.physics.add.sprite(100, 200, 'player');
const s2 = this.physics.add.sprite(300, 200, 'player');
s1.play('walk');
s2.play('walk');  // 复用同一动画定义
```

---

## Tween（属性补间动画）

Tween 可对任意数值属性做平滑插值，适合 UI 动画、相机效果、属性变化等。

### 基础用法

```javascript
this.tweens.add({
  targets: sprite,         // 目标对象（可以是数组）
  x: 700,                  // 目标值
  y: 300,
  duration: 2000,          // 时长（ms）
  ease: 'Sine.easeInOut',  // 缓动函数
  repeat: 0,               // -1 = 无限
  yoyo: false,             // 播完后倒放
  delay: 500,              // 延迟开始（ms）
  onComplete: (tween, targets) => { }
});
```

### 常用缓动函数

```javascript
ease: 'Linear'           // 匀速
ease: 'Quad.easeIn'      // 加速进入
ease: 'Quad.easeOut'     // 减速离开
ease: 'Quad.easeInOut'   // 加速再减速
ease: 'Cubic.easeOut'    // 更快的减速
ease: 'Sine.easeInOut'   // 正弦曲线（最常用，流畅自然）
ease: 'Bounce.easeOut'   // 弹跳效果
ease: 'Back.easeOut'     // 超出后回弹
ease: 'Elastic.easeOut'  // 弹性回弹
```

### 多属性与链式

```javascript
// 同时动画多个属性
this.tweens.add({
  targets: sprite,
  x: 400,
  y: 200,
  alpha: 0,
  angle: 360,
  scaleX: 2,
  duration: 1000,
  ease: 'Power2'
});

// 链式：一个接一个
this.tweens.chain({
  targets: sprite,
  tweens: [
    { x: 200, duration: 500 },
    { y: 300, duration: 500 },
    { alpha: 0, duration: 300 }
  ]
});
```

### Timeline（精确时间轴）

```javascript
const timeline = this.tweens.createTimeline();

timeline.add({ targets: sprite1, x: 200, duration: 500 });
timeline.add({ targets: sprite2, y: 400, duration: 300, offset: 200 }); // offset: 相对上一个的延迟

timeline.play();
```

### Tween 事件

```javascript
const tween = this.tweens.add({ ... });

tween.on('update', (tween, key, target, current, previous) => { });
tween.on('complete', () => { });
tween.on('loop', () => { });

// 手动控制
tween.pause();
tween.resume();
tween.stop();
tween.destroy();
```

### 淡入淡出（常用）

```javascript
// 淡出
this.tweens.add({
  targets: sprite,
  alpha: 0,
  duration: 300,
  ease: 'Linear',
  onComplete: () => sprite.destroy()
});

// 淡入
sprite.setAlpha(0);
this.tweens.add({
  targets: sprite,
  alpha: 1,
  duration: 300,
  ease: 'Linear'
});
```

---

## 动画状态机模式

```javascript
update() {
  const onGround = this.player.body.blocked.down;
  const vx = this.player.body.velocity.x;
  const vy = this.player.body.velocity.y;

  if (!onGround) {
    if (vy < 0) this.player.play('jump', true);
    else        this.player.play('fall', true);
  } else if (Math.abs(vx) > 10) {
    this.player.play('walk', true);
    this.player.setFlipX(vx < 0);  // 水平翻转朝向
  } else {
    this.player.play('idle', true);
  }
}
```
