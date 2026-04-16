---
name: phaser-snippet-object-pool
description: "Phaser 3.90 游戏开发：对象池（Object Pool）+ 子弹系统。 对象池避免频繁 new / 销毁对象带来的 GC 卡顿，是射击游戏的核心优化手段。"
tech_stack: [phaser]
---

# Phaser：对象池（Object Pool）+ 子弹系统

> 适用版本：Phaser 3.86 / 3.90
> 来源：phaser3-examples/public/3.86/src/pools/bullets.js

对象池避免频繁 `new` / 销毁对象带来的 GC 卡顿，是射击游戏的核心优化手段。

---

## 核心概念

```
对象池 = 预分配一批对象，用时「激活」，用完「回收」（而非销毁）

激活：setActive(true) + setVisible(true)
回收：setActive(false) + setVisible(false)
获取：group.get() — 从池中取一个「未激活」的对象
```

---

## Snippet：飞船射击子弹池

```javascript
class ShooterScene extends Phaser.Scene {
    lastFired = 0;
    ship;
    bullets;
    cursors;
    speed;

    preload() {
        this.load.setPath('assets/sprites/');
        this.load.image('ship', 'ship.png');
        this.load.image('bullet', 'bullet.png');
    }

    create() {
        // 子弹类定义（推荐在 create 内定义，避免全局污染）
        class Bullet extends Phaser.GameObjects.Image {
            constructor(scene) {
                super(scene, 0, 0, 'bullet');
                // GetSpeed(像素/秒, 1) 返回每毫秒速度，配合 delta 使用
                this.speed = Phaser.Math.GetSpeed(400, 1);
            }

            fire(x, y) {
                this.setPosition(x, y - 50);
                this.setActive(true);
                this.setVisible(true);
            }

            update(time, delta) {
                this.y -= this.speed * delta;

                // 飞出屏幕后回收回对象池
                if (this.y < -50) {
                    this.setActive(false);
                    this.setVisible(false);
                }
            }
        }

        // 创建子弹对象池
        this.bullets = this.add.group({
            classType: Bullet,    // 对象类型
            maxSize: 20,          // 池最大容量（超出时 get() 返回 null）
            runChildUpdate: true  // 自动调用每个激活对象的 update()
        });

        this.ship = this.add.sprite(400, 500, 'ship').setDepth(1);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.speed = Phaser.Math.GetSpeed(300, 1);
    }

    update(time, delta) {
        // 飞船移动
        if (this.cursors.left.isDown) {
            this.ship.x -= this.speed * delta;
        } else if (this.cursors.right.isDown) {
            this.ship.x += this.speed * delta;
        }

        // 发射子弹（50ms 冷却防止刷屏）
        if (this.cursors.up.isDown && time > this.lastFired) {
            const bullet = this.bullets.get(); // 从池中获取空闲子弹

            if (bullet) {
                // bullet 为 null 说明池已满（达到 maxSize），直接跳过
                bullet.fire(this.ship.x, this.ship.y);
                this.lastFired = time + 50;
            }
        }
    }
}
```

---

## 扩展：带物理体的子弹池（用于碰撞检测）

```javascript
// 需要与敌人发生碰撞时，用 physics.add.group 代替 add.group
class BulletScene extends Phaser.Scene {
    create() {
        // 物理子弹池
        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 30,
            runChildUpdate: false  // 手动管理生命周期时关闭
        });

        this.enemies = this.physics.add.group();

        // 子弹与敌人碰撞
        this.physics.add.overlap(
            this.bullets,
            this.enemies,
            this.onBulletHitEnemy,
            null,
            this
        );
    }

    fireBullet(x, y, angle) {
        const bullet = this.bullets.get(x, y);
        if (!bullet) return;

        bullet.setActive(true).setVisible(true);
        bullet.setRotation(angle);

        // 按角度设定速度
        const speed = 400;
        bullet.setVelocity(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed
        );

        // 超出世界边界自动回收
        bullet.body.onWorldBounds = true;
    }

    onBulletHitEnemy(bullet, enemy) {
        // 回收子弹
        bullet.setActive(false).setVisible(false);
        bullet.body.stop();

        // 销毁敌人
        enemy.destroy();
    }
}
```

---

## 多类型对象池（子弹 + 爆炸效果）

```javascript
class MultiPoolScene extends Phaser.Scene {
    create() {
        // 每种对象类型独立一个池
        this.bulletPool  = this.add.group({ classType: Bullet,    maxSize: 30 });
        this.explosionPool = this.add.group({ classType: Explosion, maxSize: 10 });
    }

    spawnExplosion(x, y) {
        const explosion = this.explosionPool.get();
        if (!explosion) return;

        explosion.play(x, y, () => {
            // 动画播完后回收
            explosion.setActive(false).setVisible(false);
        });
    }
}
```

---

## 关键决策

| 场景 | 推荐 |
|---|---|
| 纯视觉效果（粒子、特效） | `add.group` + `classType` |
| 需要物理碰撞（子弹打敌人） | `physics.add.group` |
| 每帧自动 update | `runChildUpdate: true` |
| 手动控制生命周期 | `runChildUpdate: false` |

## 常见陷阱

| 问题 | 原因 | 解决 |
|---|---|---|
| `group.get()` 总返回 null | `maxSize` 太小 | 增大 maxSize 或检查回收逻辑 |
| 子弹飞出屏幕不消失 | 没有检查边界并回收 | 在 `update` 中检测 `y < 0` 或用 `onWorldBounds` |
| 物理子弹停止后仍检测碰撞 | 回收时未清理速度 | 回收时调用 `bullet.body.stop()` |
| 速度与帧率耦合 | 直接写像素/帧 | 用 `Phaser.Math.GetSpeed(px/s, 1) * delta` |
