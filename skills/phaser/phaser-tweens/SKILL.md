---
name: phaser-tweens
description: "Phaser 3.90 游戏开发：Tweens（补间动画系统）。 不作用于游戏对象，单纯对数值做补间，适合颜色插值等场景。"
tech_stack: [phaser]
---

# Phaser：Tweens（补间动画系统）

> 适用版本：Phaser 3.90.0
> 注：基础 Tween 用法在 phaser-animations.md 中已有概述，本文覆盖完整 API 和高级功能。

---

## TweenManager（`this.tweens`）

```javascript
// 添加补间
const tween = this.tweens.add(config);

// 添加数值计数器（无目标对象）
const counter = this.tweens.addCounter(config);

// 批量添加
const tweens = this.tweens.addMultiple([config1, config2]);

// 链式（顺序执行）
const chain = this.tweens.chain({ tweens: [config1, config2] });

// 检查目标是否正在补间
this.tweens.isTweening(sprite)   // → boolean
this.tweens.getTweensOf(sprite)  // → Tween[]

// 全局控制
this.tweens.pauseAll();
this.tweens.resumeAll();
this.tweens.killAll();
this.tweens.killTweensOf(sprite);

// 时间缩放
this.tweens.setGlobalTimeScale(0.5);   // 全局半速
this.tweens.getGlobalTimeScale()

// 帧率（影响精度与性能）
this.tweens.setFps(60);

// 滞后平滑（防止大 delta 时跳帧）
this.tweens.setLagSmooth(500, 33);  // limit=500ms, skip=33ms

// stagger（为多目标设置错位延迟）
this.tweens.add({
  targets: group.getChildren(),
  alpha: 0,
  duration: 300,
  delay: this.tweens.stagger(100)   // 每个对象延迟 100ms
});
```

---

## Tween 配置（完整参数）

```javascript
this.tweens.add({
  targets: sprite,              // 目标（单个 / 数组 / Group）

  // 目标属性（可以是任何数值属性）
  x: 400,
  y: 300,
  alpha: 0,
  scaleX: 2,
  rotation: Math.PI,

  // 时间配置
  duration: 1000,              // 单次时长（ms）
  delay: 0,                    // 开始前延迟（ms）
  hold: 0,                     // 到达终值后停留时长（ms）

  // 循环配置
  repeat: 0,                   // 重复次数（-1=无限）
  repeatDelay: 0,              // 每次重复前等待（ms）
  yoyo: false,                 // 到终值后倒回

  // 缓动
  ease: 'Sine.easeInOut',      // 字符串或函数

  // 翻转（每次循环切换）
  flipX: false,
  flipY: false,

  // 时间缩放
  timeScale: 1,

  // 持久化（TweenManager 清空时保留）
  persist: false,

  // 回调
  onStart:    (tween, targets, param) => { },
  onUpdate:   (tween, target, key, current, previous, param) => { },
  onRepeat:   (tween, targets, param) => { },
  onYoyo:     (tween, targets, param) => { },
  onComplete: (tween, targets, param) => { },
  onStop:     (tween, targets, param) => { },

  // 回调参数
  onStartParams:    [...],
  onUpdateParams:   [...],
  onCompleteParams: [...],

  // 回调 this 上下文
  callbackScope: this,

  // 初始暂停
  paused: false
});
```

---

## 属性高级配置

### 每个属性独立配置

```javascript
this.tweens.add({
  targets: sprite,
  x: {
    value: 400,
    duration: 800,
    ease: 'Back.easeOut',
    delay: 0,
    yoyo: true,
    repeat: 2
  },
  y: {
    value: 300,
    duration: 1200,
    ease: 'Sine.easeInOut'
  },
  alpha: { value: 0, duration: 400, delay: 600 }
});
```

### getStart / getEnd（动态起止值）

```javascript
this.tweens.add({
  targets: enemies,
  x: {
    getStart: (target) => target.x,         // 从当前位置开始
    getEnd: (target) => target.x + Phaser.Math.Between(-100, 100)
  },
  duration: 500
});
```

### 插值（多值序列）

```javascript
this.tweens.add({
  targets: sprite,
  x: [100, 300, 200, 400],   // 依次经过这些值
  duration: 2000,
  // interpolation: 'linear' | 'bezier' | 'catmull'
});
```

---

## Tween 控制方法

```javascript
const tween = this.tweens.add({ ... });

// 生命周期
tween.play()
tween.pause()
tween.resume()
tween.stop()        // 停止并从 TweenManager 移除
tween.remove()      // 仅从 TweenManager 移除

// 跳跃
tween.seek(amount)     // amount=0~1，跳到进度
tween.forward(ms)      // 向前跳 N ms
tween.rewind(ms)       // 向后退 N ms
tween.restart()        // 重新开始

// 更新目标值（动态修改终值）
tween.updateTo('x', 500)           // 修改 x 的终值
tween.updateTo('x', 500, true)     // true=从当前值重新开始

// 状态查询
tween.isActive()
tween.isPlaying()
tween.isPaused()
tween.isFinished()
tween.hasTarget(sprite)   // → boolean

// 属性
tween.targets
tween.totalTargets
tween.duration
tween.progress       // 当前进度 0~1
tween.totalDuration  // 含 repeat 的总时长
tween.totalProgress  // 含 repeat 的总进度
tween.elapsed        // 当前循环已过时间
tween.totalElapsed   // 总已过时间
tween.timeScale
```

---

## Tween 事件

```javascript
tween.on('start',    (tween, targets) => { });
tween.on('update',   (tween, key, target, current, previous) => { });
tween.on('repeat',   (tween, targets) => { });
tween.on('yoyo',     (tween, targets) => { });
tween.on('complete', (tween, targets) => { });
tween.on('stop',     (tween, targets) => { });
tween.on('pause',    (tween) => { });
tween.on('resume',   (tween) => { });

// 事件字符串常量
Phaser.Tweens.Events.TWEEN_START
Phaser.Tweens.Events.TWEEN_UPDATE
Phaser.Tweens.Events.TWEEN_COMPLETE
Phaser.Tweens.Events.TWEEN_LOOP
Phaser.Tweens.Events.TWEEN_REPEAT
Phaser.Tweens.Events.TWEEN_YOYO
Phaser.Tweens.Events.TWEEN_PAUSE
Phaser.Tweens.Events.TWEEN_RESUME
Phaser.Tweens.Events.TWEEN_STOP
```

---

## TweenChain（链式顺序执行）

```javascript
const chain = this.tweens.chain({
  tweens: [
    { targets: sprite, x: 200, duration: 500 },
    { targets: sprite, y: 300, duration: 300 },
    { targets: sprite, alpha: 0, duration: 200 }
  ],
  repeat: -1,   // 整个链无限循环
  paused: false
});

chain.pause();
chain.resume();
chain.stop();
chain.nextTween();      // 跳到下一段
chain.setCurrentTween(index);  // 跳到第 N 段
```

---

## addCounter（数值计数器）

不作用于游戏对象，单纯对数值做补间，适合颜色插值等场景。

```javascript
this.tweens.addCounter({
  from: 0,
  to: 100,
  duration: 2000,
  ease: 'Linear',
  repeat: -1,
  yoyo: true,
  onUpdate: (tween) => {
    const v = tween.getValue();   // 当前值（0~100）
    this.updateUI(v);
  }
});
```

---

## 常用模式

### 弹出 UI（Back 缓动）

```javascript
panel.setScale(0);
this.tweens.add({
  targets: panel,
  scaleX: 1, scaleY: 1,
  duration: 400,
  ease: 'Back.easeOut'
});
```

### 跟随鼠标平滑移动

```javascript
update() {
  this.tweens.killTweensOf(cursor);
  this.tweens.add({
    targets: cursor,
    x: this.input.x,
    y: this.input.y,
    duration: 100,
    ease: 'Linear'
  });
}
```

### 序列等待完成

```javascript
async playSequence() {
  await new Promise(resolve => {
    this.tweens.add({ targets: obj, x: 400, duration: 500, onComplete: resolve });
  });
  await new Promise(resolve => {
    this.tweens.add({ targets: obj, alpha: 0, duration: 300, onComplete: resolve });
  });
  obj.destroy();
}
```
