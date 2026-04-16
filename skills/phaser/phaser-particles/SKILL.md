---
name: phaser-particles
description: "Phaser 3.90 游戏开发：粒子系统。 粒子属性支持多种值类型，Phaser 会在粒子生命周期中自动插值。"
tech_stack: [phaser]
---

# Phaser：粒子系统

> 适用版本：Phaser 3.90.0

---

## 基本用法

```javascript
// 创建粒子发射器
const particles = this.add.particles(x, y, 'texture', {
  speed: { min: 50, max: 200 },
  scale: { start: 1, end: 0 },
  alpha: { start: 1, end: 0 },
  lifespan: 1000,          // 粒子生命（ms）
  gravityY: 300,
  frequency: 50,           // 每 50ms 发射一个粒子
  blendMode: 'NORMAL'
});

// 停止/恢复发射
particles.stop();
particles.start();
particles.pause();
particles.resume();

// 销毁
particles.destroy();
```

---

## EmitterOp（动态值）

粒子属性支持多种值类型，Phaser 会在粒子生命周期中自动插值。

```javascript
{
  // 固定值
  speed: 100,

  // 随机范围（每个粒子随机选一个）
  speed: { min: 50, max: 200 },

  // 随时间变化（start=出生时, end=死亡时）
  scale: { start: 1, end: 0 },
  alpha: { start: 1, end: 0 },
  tint:  { start: 0xffffff, end: 0xff0000 },

  // 带缓动函数的变化
  scale: { start: 1, end: 0, ease: 'Sine.easeIn' },

  // 随机数组（每个粒子从中随机选一个）
  tint: [ 0xff0000, 0x00ff00, 0x0000ff ],

  // 自定义函数（每个粒子调用一次）
  angle: () => Phaser.Math.Between(0, 360),
  speed: () => Math.random() * 100 + 50
}
```

---

## 完整配置选项

```javascript
this.add.particles(x, y, 'texture', {
  // 发射控制
  frequency: 100,       // 每 N ms 发射一个（-1 = 不自动发射）
  quantity: 1,          // 每次发射数量
  maxParticles: 0,      // 最大粒子数（0=无限）
  duration: 3000,       // 持续时间（ms），之后停止发射

  // 生命
  lifespan: 1000,       // 粒子生命（ms）

  // 运动
  speed: { min: 50, max: 200 },
  speedX: 0,
  speedY: 0,
  accelerationX: 0,
  accelerationY: 0,
  gravityX: 0,
  gravityY: 300,
  maxVelocityX: 500,
  maxVelocityY: 500,

  // 角度（发射方向）
  angle: { min: -30, max: 30 },  // 以 emitter 位置为中心的发射角

  // 外观
  scale: { start: 1, end: 0 },
  alpha: { start: 1, end: 0 },
  tint: 0xffffff,
  rotate: { start: 0, end: 360 },
  blendMode: 'NORMAL',    // 'ADD' 用于发光效果

  // 发射区域
  emitZone: {
    type: 'random',       // 'random' | 'edge'
    source: new Phaser.Geom.Circle(0, 0, 50)
  },

  // 死亡区域（粒子进入/离开即死亡）
  deathZone: {
    type: 'onLeave',      // 'onEnter' | 'onLeave'
    source: new Phaser.Geom.Rectangle(0, 0, 800, 600)
  },

  // 随机帧（Sprite Sheet / Atlas）
  frame: ['fire1', 'fire2', 'fire3'],
  randomFrame: true
});
```

---

## 发射模式

### 连续发射

```javascript
// frequency > 0：每 N ms 发射 quantity 个
const smoke = this.add.particles(x, y, 'smoke', {
  frequency: 200,
  quantity: 1
});
```

### 爆发（Burst）

```javascript
// frequency = -1：不自动发射，手动触发
const explosion = this.add.particles(x, y, 'spark', {
  frequency: -1,
  speed: { min: 100, max: 400 },
  lifespan: 800,
  scale: { start: 1, end: 0 }
});

// 手动发射 N 个粒子
explosion.explode(50, x, y);

// 跟随某个游戏对象
explosion.setPosition(enemy.x, enemy.y);
explosion.explode(30);
```

---

## 常用特效预设

### 爆炸效果

```javascript
function createExplosion(scene, x, y) {
  const particles = scene.add.particles(x, y, 'spark', {
    speed: { min: 100, max: 400 },
    angle: { min: 0, max: 360 },
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 600,
    blendMode: 'ADD',
    gravityY: 200,
    frequency: -1,
    maxParticles: 40
  });
  particles.explode(40, x, y);

  // 自动销毁
  scene.time.delayedCall(1000, () => particles.destroy());
}
```

### 尾迹效果

```javascript
// 跟随玩家的粒子尾迹
const trail = this.add.particles(0, 0, 'dust', {
  speed: 30,
  scale: { start: 0.5, end: 0 },
  alpha: { start: 0.6, end: 0 },
  lifespan: 400,
  frequency: 30
});

// update() 中更新位置
update() {
  trail.setPosition(player.x, player.y + 16);  // 跟脚底
}
```

### 发光粒子（ADD 混合模式）

```javascript
const glow = this.add.particles(x, y, 'glow', {
  blendMode: 'ADD',    // 叠加混合，产生发光效果
  speed: { min: 20, max: 80 },
  scale: { start: 0.5, end: 0 },
  alpha: { start: 0.8, end: 0 },
  lifespan: 800,
  frequency: 30,
  tint: 0x00ffff
});
```

---

## 引力井（Gravity Well）

```javascript
// 创建吸引粒子的引力点
const well = particles.addGravityWell({
  x: 400,
  y: 300,
  power: 50,      // 引力强度（正=吸引, 负=排斥）
  epsilon: 100,   // 防止粒子无限加速的安全距离
  gravity: 200
});

// 移除引力井
particles.removeGravityWell(well);
```

---

## 性能优化

```javascript
// 1. 预分配粒子池（避免运行时 GC）
const emitter = this.add.particles(x, y, 'key', {
  maxParticles: 200    // 硬上限，不会超出
});

// 2. 及时销毁不用的粒子系统
this.time.delayedCall(2000, () => particles.destroy());

// 3. 屏幕外不发射
if (Math.abs(enemy.x - this.cameras.main.scrollX) > 1000) {
  emitter.stop();
} else {
  emitter.start();
}

// 4. 减少粒子数量，用更大的粒子代替多粒子
// 5. ADD 混合模式在大量粒子时比 NORMAL 更慢（WebGL overdraw）
```
