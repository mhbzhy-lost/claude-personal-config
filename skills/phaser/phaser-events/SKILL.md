---
name: phaser-events
description: "Phaser 3.90 游戏开发：事件系统。 Phaser 有多个 EventEmitter，每个作用域不同："
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：事件系统

> 适用版本：Phaser 3.90.0

---

## 事件层级

Phaser 有多个 EventEmitter，每个作用域不同：

| 事件源 | 访问方式 | 作用域 |
|---|---|---|
| Scene 事件 | `this.events` | 当前 Scene |
| 全局注册表 | `this.registry.events` | 所有 Scene 共享 |
| 游戏对象 | `sprite.on(...)` | 单个对象 |
| 输入系统 | `this.input.on(...)` | 输入事件 |
| 游戏级别 | `this.game.events` | 整个游戏 |

---

## Scene 生命周期事件

```javascript
this.events.on('init',       () => { });  // init() 执行时
this.events.on('preload',    () => { });  // preload() 执行时
this.events.on('create',     () => { });  // create() 执行时
this.events.on('update',     (time, delta) => { });
this.events.on('render',     () => { });

// 帧循环细分
this.events.on('preupdate',  (time, delta) => { });  // update 之前
this.events.on('postupdate', (time, delta) => { });  // update 之后

// 状态变化
this.events.on('pause',    () => { });
this.events.on('resume',   () => { });
this.events.on('sleep',    () => { });
this.events.on('wake',     () => { });
this.events.on('shutdown', () => { });   // scene.stop() 时触发
this.events.on('destroy',  () => { });   // scene.remove() 时触发
```

---

## EventEmitter API

```javascript
// 持续监听
this.events.on(eventName, callback, context);

// 只监听一次（触发后自动移除）
this.events.once(eventName, callback, context);

// 移除特定监听器
this.events.off(eventName, callback, context);

// 移除某事件的所有监听器
this.events.off(eventName);

// 移除所有监听器
this.events.removeAllListeners();

// 发射事件（可传多个参数）
this.events.emit(eventName, arg1, arg2, ...);

// 检查是否有监听器
this.events.listenerCount(eventName);
this.events.eventNames();
```

---

## 游戏对象事件

```javascript
// 所有 GameObjects 继承 EventEmitter
sprite.on('pointerdown', (pointer) => { });
sprite.on('pointerup',   (pointer) => { });
sprite.on('pointerover', (pointer) => { });
sprite.on('pointerout',  (pointer) => { });

// 动画事件
sprite.on('animationstart',    (anim, frame, sprite) => { });
sprite.on('animationupdate',   (anim, frame, sprite) => { });
sprite.on('animationcomplete', (anim, frame, sprite) => { });
sprite.on('animationstop',     (anim, frame, sprite) => { });
sprite.on('animationrepeat',   (anim, frame, sprite) => { });

// 销毁事件
sprite.once('destroy', () => { /* 清理关联资源 */ });
```

---

## 自定义事件（跨模块通信）

```javascript
// 发射自定义事件
this.events.emit('player:damaged', { amount: 10, source: enemy });
this.events.emit('score:updated', newScore);
this.events.emit('level:complete');

// 在另一个地方监听
this.events.on('player:damaged', (data) => {
  this.health -= data.amount;
  this.showDamageEffect(data.source);
});
```

---

## 跨 Scene 通信

```javascript
// 方案一：Registry（推荐，简单数据共享）
// Scene A 中写入
this.registry.set('score', 1500);

// Scene B 中读取
const score = this.registry.get('score');

// 监听 registry 变化
this.registry.events.on('changedata', (parent, key, value, prevValue) => {
  if (key === 'score') {
    this.scoreText.setText(value);
  }
});

// 精确监听某个 key
this.registry.events.on('changedata-score', (parent, value) => {
  this.scoreText.setText(value);
});

// 方案二：Scene Manager 直接访问另一个 Scene
const gameScene = this.scene.get('GameScene');
gameScene.events.emit('custom-event', data);

// 方案三：Game 级别事件（全局广播）
this.game.events.emit('globalEvent', data);
this.game.events.on('globalEvent', (data) => { });
```

---

## 定时器（time）

```javascript
// 延迟执行
this.time.delayedCall(2000, () => {
  this.scene.start('NextLevel');
}, [], this);

// 循环定时器
const timer = this.time.addEvent({
  delay: 1000,
  callback: this.spawnEnemy,
  callbackScope: this,
  repeat: -1   // -1 = 无限循环
});

// 执行有限次
this.time.addEvent({
  delay: 500,
  callback: this.blink,
  callbackScope: this,
  repeat: 5     // 共执行 6 次（初始 + 5 次重复）
});

// 移除定时器
timer.remove();
this.time.removeAllEvents();
```

---

## 内存泄漏防范

```javascript
create() {
  // 始终在 shutdown 时清理
  this.events.once('shutdown', this.cleanup, this);
}

cleanup() {
  // 移除本 Scene 添加的所有监听器
  this.input.off('pointerdown');
  this.events.off('player:damaged');
  this.registry.events.off('changedata-score');

  // 移除定时器
  this.time.removeAllEvents();
}
```

**规则：**
- 用 `once` 替代 `on` 处理一次性事件，自动移除
- 在 `shutdown` 回调中统一清理所有 `on` 监听器
- 不要移除其他模块添加的监听器（用 `off(event, specificCallback)` 精确移除）
- 不要用 Phaser 内部保留的事件名作为自定义事件名（如 `update`、`destroy`）
