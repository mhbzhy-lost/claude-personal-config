---
name: phaser-time
description: "Phaser 3.90 游戏开发：时间与定时器系统。 Timeline 用于编排一系列按时序触发的事件，比多个 delayedCall 更结构化。"
tech_stack: [phaser]
---

# Phaser：时间与定时器系统

> 适用版本：Phaser 3.90.0

---

## 访问时间系统

```javascript
// 在 Scene 中通过 this.time 访问 Clock
this.time        // Clock 实例
this.time.now    // 当前时间（ms，相对游戏启动）
this.time.paused // 是否暂停

// update() 参数
update(time, delta) {
  // time  = 当前时间（ms）
  // delta = 上帧到本帧的时间差（ms，理想值约 16.67ms）
}
```

---

## Clock（定时器管理器）

### 延迟执行

```javascript
// 一次性延迟
this.time.delayedCall(
  2000,                          // 延迟（ms）
  () => { this.scene.start('GameOver'); }, // 回调
  [],                            // 回调参数数组
  this                           // 回调 this 上下文
);

// 返回 TimerEvent，可用于取消
const timer = this.time.delayedCall(3000, callback, [], this);
timer.remove();   // 取消
```

### addEvent（完整配置）

```javascript
const timer = this.time.addEvent({
  delay: 1000,           // 触发间隔（ms）
  callback: this.spawnEnemy,
  callbackScope: this,
  args: [x, y],          // 传给回调的参数
  loop: true,            // 无限循环（与 repeat 互斥）
  repeat: 5,             // 重复次数（共触发 repeat+1 次）
  startAt: 500,          // 从第几 ms 开始（跳过初始延迟的一部分）
  timeScale: 1,          // 时间缩放（独立于全局）
  paused: false          // 初始是否暂停
});

// 控制
timer.paused = true;
timer.paused = false;
timer.remove();                    // 立即取消
timer.remove(true);                // 取消并触发一次回调

// 查询状态
timer.getProgress()                // 0~1，当前循环进度
timer.getElapsed()                 // 已过时间（ms）
timer.getElapsedSeconds()          // 已过时间（秒）
timer.getRemaining()               // 剩余时间（ms）
timer.getRemainingSeconds()
timer.getRepeatCount()             // 剩余重复次数
timer.getOverallProgress()         // 整体进度（含所有重复）
```

### 批量管理

```javascript
// 清除所有待触发事件（不影响已设定的循环）
this.time.clearPendingEvents();

// 移除所有定时器
this.time.removeAllEvents();
```

---

## TimerEvent 属性

```javascript
const timer = this.time.addEvent({ ... });

timer.delay           // 触发间隔（ms）
timer.elapsed         // 当前循环已过时间（ms）
timer.loop            // 是否循环
timer.repeat          // 总重复次数
timer.repeatCount     // 剩余重复次数
timer.paused          // 是否暂停
timer.hasDispatched   // 是否已触发过
timer.timeScale       // 独立时间缩放
```

---

## Timeline（事件时间轴）

Timeline 用于编排一系列按时序触发的事件，比多个 delayedCall 更结构化。

```javascript
const timeline = this.time.createTimeline();
// 或
const timeline = this.add.timeline(events);

// 添加事件
timeline.add({
  at: 0,            // 触发时间（ms，相对 timeline 开始）
  run: () => { this.spawnWave(1); },
  set: { 'this.bossHealthBar': { visible: false } }, // 设置属性
  tween: {          // 同时触发 Tween
    targets: boss,
    alpha: 1,
    duration: 500
  },
  sound: 'waveStart',   // 同时播放音效
  event: 'waveStarted', // 发射 EventEmitter 事件
  once: true            // 触发后移除
});

timeline.add({
  at: 5000,
  run: () => { this.spawnWave(2); }
});

timeline.add({
  at: 10000,
  run: () => { this.spawnBoss(); }
});

// 控制
timeline.play();
timeline.pause();
timeline.resume();
timeline.stop();
timeline.reset(loop);   // 重置（loop=true 则循环播放）
timeline.repeat(count); // 设置重复次数（-1=无限）

// 状态查询
timeline.isPlaying()
timeline.complete      // 是否完成
timeline.totalComplete // 已完成次数
timeline.elapsed       // 已过时间（ms）
timeline.getProgress() // 0~1
```

---

## 时间缩放（慢动作/加速）

```javascript
// Scene 级别时间缩放（影响所有定时器和物理）
this.time.timeScale = 0.5;   // 半速（慢动作）
this.time.timeScale = 2.0;   // 两倍速
this.time.timeScale = 1.0;   // 正常

// 单个定时器独立时间缩放
const timer = this.time.addEvent({
  delay: 1000,
  timeScale: 0.5,  // 该定时器单独半速
  loop: true,
  callback: this.tick
});
```

---

## 常用模式

### 冷却时间（技能/射击间隔）

```javascript
create() {
  this.canFire = true;
}

update() {
  if (this.cursors.space.isDown && this.canFire) {
    this.fireBullet();
    this.canFire = false;
    this.time.delayedCall(500, () => { this.canFire = true; });
  }
}
```

### 倒计时显示

```javascript
create() {
  this.countdown = 60;
  this.countdownText = this.add.text(400, 50, '60', { fontSize: '32px' })
    .setOrigin(0.5);

  this.time.addEvent({
    delay: 1000,
    repeat: 59,
    callback: () => {
      this.countdown--;
      this.countdownText.setText(this.countdown);
      if (this.countdown <= 0) this.timeUp();
    }
  });
}
```

### 敌人分波生成

```javascript
create() {
  const timeline = this.time.createTimeline();

  for (let wave = 1; wave <= 5; wave++) {
    const at = (wave - 1) * 8000;
    timeline.add({
      at,
      run: () => this.spawnWave(wave)
    });
  }

  timeline.add({
    at: 40000,
    run: () => this.spawnBoss()
  });

  timeline.play();
}
```

### 帧率无关移动（使用 delta）

```javascript
update(time, delta) {
  // delta 单位为 ms，通常约 16.67
  const speed = 200;  // 像素/秒
  const dtSec = delta / 1000;

  if (this.cursors.right.isDown) {
    // 不用 setVelocity 时的手动移动
    player.x += speed * dtSec;
  }
}
```
