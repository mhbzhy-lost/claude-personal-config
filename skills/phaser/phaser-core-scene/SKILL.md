---
name: phaser-core-scene
description: "Phaser 3.90 游戏开发：游戏初始化与 Scene 系统。 生命周期顺序： init → preload → create → update（循环）"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser：游戏初始化与 Scene 系统

> 适用版本：Phaser 3.90.0

---

## 游戏配置与初始化

```javascript
const config = {
  type: Phaser.AUTO,        // CANVAS | WEBGL | HEADLESS | AUTO（推荐）
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',      // 'arcade' | 'matter'
    arcade: {
      gravity: { y: 300 },
      debug: false
    }
  },
  scene: [BootScene, GameScene, UIScene]  // 多 Scene 数组
};

const game = new Phaser.Game(config);
```

**type 选择原则：**
- `AUTO`：自动选 WebGL，不支持时降级 Canvas（推荐）
- `WEBGL`：强制 WebGL，移动端兼容性风险
- `CANVAS`：强制 Canvas，性能较差但兼容性最好
- `HEADLESS`：无渲染，用于服务端/测试

---

## Scene 定义（推荐 ES6 Class）

```javascript
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });  // key 是 Scene 的唯一标识
  }

  init(data) { }           // 1. 最先调用，data 来自 scene.start(key, data)
  preload() { }            // 2. 加载资源
  create() { }             // 3. 资源加载完毕后初始化对象
  update(time, delta) { }  // 4. 每帧调用，delta 单位 ms
}
```

**生命周期顺序：** `init` → `preload` → `create` → `update`（循环）

---

## Scene 状态

| 状态 | 描述 |
|---|---|
| RUNNING | 正常运行，update + render 均执行 |
| PAUSED | 暂停 update，但仍然 render |
| SLEEPING | 停止 update 和 render，**保留内存状态** |
| STOPPED | 释放所有资源，等同于销毁 |

---

## SceneManager 常用方法

```javascript
// 在 Scene 内部通过 this.scene 访问
this.scene.start('GameScene', { level: 1 });  // 启动（会停止当前）
this.scene.launch('UIScene');                  // 并行启动另一个 Scene
this.scene.stop('GameScene');
this.scene.pause();
this.scene.resume();
this.scene.sleep();
this.scene.wake();
this.scene.restart();

// 查询状态
this.scene.isActive('key');
this.scene.isPaused('key');
this.scene.isSleeping('key');
this.scene.isVisible('key');

// 层级管理
this.scene.bringToTop('UIScene');
this.scene.moveAbove('key1', 'key2');
this.scene.swapPosition('key1', 'key2');

// 过渡动画
this.scene.transition({
  target: 'NextScene',
  duration: 1000,
  onUpdate: (progress) => { /* 0→1 */ },
  onComplete: () => { }
});
```

---

## Scene 内置系统属性

| 属性 | 类型 | 用途 |
|---|---|---|
| `this.load` | LoaderPlugin | 资源加载 |
| `this.add` | GameObjectFactory | 创建游戏对象 |
| `this.physics` | PhysicsPlugin | 物理系统 |
| `this.anims` | AnimationManager | 全局动画管理 |
| `this.tweens` | TweenManager | 补间动画 |
| `this.input` | InputPlugin | 输入处理 |
| `this.cameras` | CameraManager | 摄像机管理 |
| `this.sound` | SoundManager | 音频系统 |
| `this.events` | EventEmitter | Scene 级别事件 |
| `this.time` | TimeManager | 定时器/延迟 |
| `this.data` | DataManager | 本 Scene 数据存储 |
| `this.registry` | DataManager | 跨 Scene 全局数据 |
| `this.children` | DisplayList | 管理渲染对象列表 |

---

## 跨 Scene 数据共享

```javascript
// 方案一：registry（推荐）
this.registry.set('score', 100);
const score = this.registry.get('score');

// 方案二：scene.start 传参
this.scene.start('GameScene', { level: 2, score: 1500 });
// 在 GameScene.init(data) 中接收

// 方案三：registry 事件
this.registry.events.on('changedata-score', (parent, value) => {
  this.scoreText.setText(value);
});
```

---

## 多 Scene 并行模式（UI 叠加）

```javascript
// 游戏 Scene + UI Scene 并行
class BootScene extends Phaser.Scene {
  create() {
    this.scene.start('GameScene');
    this.scene.launch('UIScene');   // 并行，不会停止 GameScene
  }
}
```

---

## Scene 资源清理（防内存泄漏）

```javascript
create() {
  this.events.on('shutdown', this.shutdown, this);
  this.events.on('destroy', this.destroy, this);
}

shutdown() {
  // 清理事件监听、定时器等
  this.events.off('shutdown', this.shutdown, this);
  this.input.off('pointerdown');
}
```
