---
name: phaser-snippet-scene-patterns
description: "Phaser 3.90 游戏开发：场景管理模式。 5 种高频场景协作模式，覆盖数据共享、UI 分层、场景切换三大类问题。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser：场景管理模式

> 适用版本：Phaser 3.86 / 3.90
> 来源：phaser3-examples/public/3.86/src/scenes/

5 种高频场景协作模式，覆盖数据共享、UI 分层、场景切换三大类问题。

---

## 模式 1：Registry 全局状态共享

适用于：跨场景的持久数据（分数、生命值、配置）

```javascript
// GameScene：写入 Registry
class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    create() {
        this.registry.set('score', 0);
        this.registry.set('lives', 3);

        // 游戏逻辑中更新
        this.input.on('gameobjectup', (pointer, obj) => {
            const score = this.registry.get('score') + 10;
            this.registry.set('score', score);  // 触发 changedata 事件
        });
    }
}

// UIScene：监听 Registry 变化（与 GameScene 并行运行）
class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene', active: true }); }

    create() {
        this.scoreText = this.add.text(10, 10, 'Score: 0', {
            font: '32px Arial', fill: '#ffffff'
        });
        this.livesText = this.add.text(10, 48, 'Lives: 3', {
            font: '32px Arial', fill: '#ffffff'
        });

        // 监听任意 Registry 数据变化
        this.registry.events.on('changedata', this.updateData, this);
    }

    updateData(parent, key, value) {
        if (key === 'score') this.scoreText.setText('Score: ' + value);
        if (key === 'lives') this.livesText.setText('Lives: ' + value);
    }
}

const config = {
    scene: [ GameScene, UIScene ]  // UIScene active:true，随游戏一起启动
};
```

**要点：** `active: true` 让 UIScene 在游戏启动时自动运行，无需手动 `scene.launch()`。

---

## 模式 2：Scene 事件总线（UI 覆盖层）

适用于：GameScene 触发事件，UIScene 响应更新显示

```javascript
class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    create() {
        this.add.image(400, 300, 'bg');

        this.input.on('gameobjectup', (pointer, obj) => {
            obj.input.enabled = false;
            obj.setVisible(false);
            // 向外发射事件，不关心谁在监听
            this.events.emit('addScore', 10);
        });
    }
}

class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene', active: true }); }

    create() {
        let totalScore = 0;
        const info = this.add.text(10, 10, 'Score: 0', {
            font: '48px Arial', fill: '#ffffff'
        });

        // 获取 GameScene 引用，监听其事件
        const gameScene = this.scene.get('GameScene');
        gameScene.events.on('addScore', (points) => {
            totalScore += points;
            info.setText('Score: ' + totalScore);
        });
    }
}
```

**Registry vs 事件总线对比：**
| | Registry | 事件总线 |
|---|---|---|
| 适用 | 持久状态（最高分、配置） | 瞬时事件（击中、死亡） |
| 读取 | 任意时刻 `get()` | 只在事件触发时 |
| 场景重启 | 数据保留 | 需重新绑定监听器 |

---

## 模式 3：场景数据传递（start + init）

适用于：场景切换时携带参数（关卡 ID、玩家选择等）

```javascript
class Menu extends Phaser.Scene {
    constructor() { super('Menu'); }

    create() {
        this.add.text(10, 10, 'Press 1 or 2').setInteractive();

        this.input.keyboard.once('keyup-ONE', () => {
            // 通过 scene.start 第二参数传递数据
            this.scene.start('GameScene', { level: 1, character: 'warrior' });
        });

        this.input.keyboard.once('keyup-TWO', () => {
            this.scene.start('GameScene', { level: 2, character: 'mage' });
        });

        // 场景重启时清理键盘监听，防止堆叠
        this.events.on('shutdown', () => {
            this.input.keyboard.shutdown();
        });
    }
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    // init 在 preload 之前调用，是接收数据的正确时机
    init(data) {
        this.levelId = data.level;
        this.character = data.character;
    }

    preload() {
        // 可根据 levelId 动态加载资源
        this.load.image('map', `assets/maps/level${this.levelId}.png`);
    }

    create() {
        console.log(`Level: ${this.levelId}, Character: ${this.character}`);
        // ...
    }
}
```

**生命周期顺序：** `init(data)` → `preload()` → `create()` → `update()`

---

## 模式 4：场景过渡动画（transition）

适用于：场景切换时需要淡出/淡入等过渡效果

```javascript
class SceneA extends Phaser.Scene {
    constructor() { super('SceneA'); }

    create() {
        this.input.once('pointerdown', () => {
            this.scene.transition({
                target: 'SceneB',
                duration: 1000,
                moveBelow: true,        // SceneB 在 SceneA 下方出现
                onUpdate: this.onTransition,  // 每帧调用，progress: 0→1
                data: { spawnX: 400 }   // 传递数据给目标场景
            });
        });
    }

    onTransition(progress) {
        // progress: 0（开始）→ 1（结束），用于做淡出效果
        this.cameras.main.setAlpha(1 - progress);
    }
}

class SceneB extends Phaser.Scene {
    constructor() { super('SceneB'); }

    create(data) {
        const hero = this.add.image(data.spawnX, 300, 'hero').setScale(0);

        // transitionstart：过渡开始时触发
        this.events.on('transitionstart', (fromScene, duration) => {
            this.tweens.add({
                targets: hero,
                scaleX: 1, scaleY: 1,
                duration: duration
            });
        });

        // transitioncomplete：过渡完成后触发
        this.events.on('transitioncomplete', () => {
            console.log('Scene fully transitioned in');
        });
    }
}
```

---

## 模式 5：并行场景（launch）

适用于：游戏运行时同时显示多个场景（游戏世界 + HUD + 暂停菜单）

```javascript
class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }

    create() {
        // start：停止当前场景并启动目标场景（独占）
        this.scene.start('GameScene');

        // launch：在当前场景之上并行运行（不停止当前）
        this.scene.launch('HUDScene');
        this.scene.launch('MiniMapScene');
    }
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    pauseGame() {
        this.scene.pause();                 // 暂停 update，保留渲染
        this.scene.launch('PauseMenu');     // 启动暂停菜单覆盖层
    }
}

class PauseMenu extends Phaser.Scene {
    constructor() { super('PauseMenu'); }

    create() {
        this.add.text(400, 300, 'PAUSED').setOrigin(0.5);

        this.input.keyboard.once('keydown-ESC', () => {
            this.scene.stop();                       // 关闭暂停菜单
            this.scene.resume('GameScene');          // 恢复游戏
        });
    }
}
```

**场景操作速查：**
| 方法 | 效果 |
|---|---|
| `scene.start(key)` | 停止当前 + 启动目标 |
| `scene.launch(key)` | 并行启动，不停止当前 |
| `scene.pause()` | 停止 update，保留渲染和内存 |
| `scene.sleep()` | 停止 update 和渲染，保留内存 |
| `scene.stop()` | 完全停止并释放资源 |
| `scene.resume(key)` | 恢复已 pause 的场景 |
| `scene.wake(key)` | 恢复已 sleep 的场景 |
