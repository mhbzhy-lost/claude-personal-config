---
name: phaser-snippet-game-architecture
description: "Phaser 3.90 游戏开发：多场景游戏架构（Boot → Preloader → MainMenu → Game）。 这是生产级游戏的标准四场景骨架。每个场景职责单一，通过 Registry 共享全局状态。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser：多场景游戏架构（Boot → Preloader → MainMenu → Game）

> 适用版本：Phaser 3.86 / 3.90
> 来源：phaser3-examples/public/3.86/src/games/snowmen-attack/

这是生产级游戏的标准四场景骨架。每个场景职责单一，通过 `Registry` 共享全局状态。

---

## 目录结构

```
src/
├── main.js          # 游戏入口，注册所有 Scene
├── Boot.js          # 初始化全局数据，立即跳转 Preloader
├── Preloader.js     # 加载全部资源 + 注册全局动画
├── MainMenu.js      # 主菜单 UI + 等待开始输入
└── Game.js          # 核心游戏逻辑
```

---

## main.js — 游戏入口

```javascript
import Boot from './Boot.js';
import Preloader from './Preloader.js';
import MainMenu from './MainMenu.js';
import MainGame from './Game.js';

const config = {
    type: Phaser.AUTO,
    width: 1024,
    height: 768,
    backgroundColor: '#3366b2',
    parent: 'phaser-example',
    scene: [ Boot, Preloader, MainMenu, MainGame ],
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};

const game = new Phaser.Game(config);
```

---

## Boot.js — 初始化全局状态

```javascript
export default class Boot extends Phaser.Scene {
    constructor() {
        super('Boot');
    }

    create() {
        // 在 Registry 中初始化跨场景共享的全局数据
        this.registry.set('highscore', 0);
        this.registry.set('score', 0);

        this.scene.start('Preloader');
    }
}
```

**要点：** Boot 不加载任何资源，只做数据初始化，然后立即跳转。

---

## Preloader.js — 资源加载 + 全局动画注册

```javascript
export default class Preloader extends Phaser.Scene {
    constructor() {
        super('Preloader');
    }

    preload() {
        // 本地开发用相对路径；生产可换 CDN
        this.load.setPath('assets/');

        // 显示加载进度文本（可替换为进度条）
        const loadText = this.add.text(512, 360, 'Loading ...', {
            fontFamily: 'Arial', fontSize: 48, color: '#ffffff'
        }).setOrigin(0.5);

        // 批量加载图片（传数组时 key 与文件名相同）
        this.load.image(['background', 'overlay', 'gameover', 'title']);
        this.load.atlas('sprites', 'sprites.png', 'sprites.json');

        // 多格式音频（浏览器自动选择支持的格式）
        this.load.audio('music',    ['music.ogg', 'music.m4a', 'music.mp3']);
        this.load.audio('gameover', ['gameover.ogg', 'gameover.m4a', 'gameover.mp3']);
    }

    create() {
        // 在 Preloader.create 中注册全局动画，所有后续场景都能复用
        this.anims.create({
            key: 'idle',
            frames: this.anims.generateFrameNames('sprites', {
                prefix: 'idle', start: 0, end: 3, zeroPad: 3
            }),
            yoyo: true,
            frameRate: 8,
            repeat: -1
        });

        this.anims.create({
            key: 'walk',
            frames: this.anims.generateFrameNames('sprites', {
                prefix: 'walk', start: 0, end: 7, zeroPad: 3
            }),
            frameRate: 8,
            repeat: -1
        });

        // 处理浏览器音频自动播放限制：需要用户交互后才能解锁
        if (this.sound.locked) {
            this.add.text(512, 360, 'Click to Start', {
                fontFamily: 'Arial', fontSize: 48, color: '#ffffff'
            }).setOrigin(0.5);

            this.input.once('pointerdown', () => {
                this.scene.start('MainMenu');
            });
        } else {
            this.scene.start('MainMenu');
        }
    }
}
```

**要点：**
- `sound.locked` 检查：移动端和部分桌面浏览器需要用户交互才能播放音频
- 全局动画在 Preloader 注册一次，所有场景均可通过 `sprite.anims.play('key')` 使用

---

## MainMenu.js — 主菜单

```javascript
export default class MainMenu extends Phaser.Scene {
    constructor() {
        super('MainMenu');
    }

    create() {
        this.sound.play('music', { loop: true, delay: 2 });

        this.add.image(512, 384, 'background');

        // Logo 入场动画
        const logo = this.add.image(1700, 384, 'title');
        this.tweens.add({
            targets: logo,
            x: 512,
            ease: 'back.out',
            delay: 800,
            duration: 600
        });

        // 键盘和触摸都响应
        this.input.keyboard.once('keydown-SPACE', () => {
            this.scene.start('MainGame');
        });

        this.input.once('pointerdown', () => {
            this.scene.start('MainGame');
        });
    }
}
```

---

## Game.js — 核心游戏 + 最高分逻辑

```javascript
export default class MainGame extends Phaser.Scene {
    constructor() {
        super('MainGame');
        this.score = 0;
        this.highscore = 0;
        this.scoreTimer = null;
        this.scoreText = null;
    }

    create() {
        // 从 Registry 读取上一局的最高分
        this.score = 0;
        this.highscore = this.registry.get('highscore');

        this.add.image(512, 384, 'background');

        this.scoreText = this.add.text(140, 2, '0', {
            fontFamily: 'Arial', fontSize: 32, color: '#ffffff'
        });

        // 每秒加分计时器
        this.scoreTimer = this.time.addEvent({
            delay: 1000,
            callback: () => {
                this.score++;
                this.scoreText.setText(this.score);
            },
            repeat: -1
        });
    }

    gameOver() {
        this.scoreTimer.destroy();
        this.sound.stopAll();
        this.sound.play('gameover');

        // 更新最高分到 Registry，下一局 MainMenu/Game 都能读到
        if (this.score > this.highscore) {
            this.registry.set('highscore', this.score);
        }

        // 返回菜单
        this.input.keyboard.once('keydown-SPACE', () => {
            this.scene.start('MainMenu');
        });
        this.input.once('pointerdown', () => {
            this.scene.start('MainMenu');
        });
    }
}
```

---

## 关键决策点

| 决策 | 推荐做法 | 原因 |
|---|---|---|
| 全局状态存在哪 | `this.registry` | 所有场景共享，无需依赖注入 |
| 动画在哪注册 | `Preloader.create()` | 只注册一次，全局可用 |
| 音频解锁 | `sound.locked` 检查 | 移动端强制要求用户交互 |
| 场景切换 | `scene.start()` | 停止当前场景并释放，防内存泄漏 |
| 多格式音频 | 传数组 `['x.ogg','x.mp3']` | 浏览器兼容性 |
