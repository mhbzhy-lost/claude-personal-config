---
name: phaser-snippet-platformer
description: "Phaser 3.90 游戏开发：平台游戏（Arcade 物理 + Tilemap）。 两个独立可运行的 snippet：基础平台跳跃 + Tilemap 地图行走。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering, game-physics, game-input]
---

# Phaser：平台游戏（Arcade 物理 + Tilemap）

> 适用版本：Phaser 3.86 / 3.90
> 来源：phaser3-examples/public/3.86/src/physics/arcade/ + tilemap/collision/

两个独立可运行的 snippet：基础平台跳跃 + Tilemap 地图行走。

---

## Snippet 1：Arcade 平台跳跃

包含：重力、地面碰撞、移动平台、跑动动画、收集物品。

```javascript
class PlatformerScene extends Phaser.Scene {
    // 声明类属性（可选，增强可读性）
    player;
    platforms;
    movingPlatform;
    stars;
    cursors;

    preload() {
        this.load.setPath('assets/games/firstgame/');
        this.load.image('sky', 'assets/sky.png');
        this.load.image('ground', 'assets/platform.png');
        this.load.image('star', 'assets/star.png');
        this.load.spritesheet('dude', 'assets/dude.png', {
            frameWidth: 32, frameHeight: 48
        });
    }

    create() {
        // 背景（不参与物理）
        this.add.image(400, 300, 'sky');

        // 静态地面组：不移动，碰撞高效
        this.platforms = this.physics.add.staticGroup();
        this.platforms.create(400, 568, 'ground').setScale(2).refreshBody();
        // refreshBody() 在 setScale 后必须调用，更新物理体尺寸

        // 移动平台：动态体，禁用重力
        this.movingPlatform = this.physics.add.image(400, 400, 'ground');
        this.movingPlatform.setImmovable(true);       // 不被玩家推动
        this.movingPlatform.body.allowGravity = false; // 不受重力影响
        this.movingPlatform.setVelocityX(50);

        // 玩家
        this.player = this.physics.add.sprite(100, 450, 'dude');
        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);

        // 跑动动画
        this.anims.create({
            key: 'left',
            frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1
        });
        this.anims.create({
            key: 'turn',
            frames: [{ key: 'dude', frame: 4 }],
            frameRate: 20
        });
        this.anims.create({
            key: 'right',
            frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
            frameRate: 10,
            repeat: -1
        });

        // 键盘
        this.cursors = this.input.keyboard.createCursorKeys();

        // 收集物（分组批量生成）
        this.stars = this.physics.add.group({
            key: 'star',
            repeat: 11,
            setXY: { x: 12, y: 0, stepX: 70 }
        });
        // 随机弹跳系数
        for (const star of this.stars.getChildren()) {
            star.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
        }

        // 碰撞注册
        this.physics.add.collider(this.player, this.platforms);
        this.physics.add.collider(this.player, this.movingPlatform);
        this.physics.add.collider(this.stars, this.platforms);
        this.physics.add.collider(this.stars, this.movingPlatform);

        // 重叠检测（玩家拾取星星）
        this.physics.add.overlap(this.player, this.stars, this.collectStar, null, this);
    }

    update() {
        const { left, right, up } = this.cursors;

        if (left.isDown) {
            this.player.setVelocityX(-160);
            this.player.anims.play('left', true);
        } else if (right.isDown) {
            this.player.setVelocityX(160);
            this.player.anims.play('right', true);
        } else {
            this.player.setVelocityX(0);
            this.player.anims.play('turn');
        }

        // 只有站在地面上才能跳跳（touching.down 防止空中二段跳）
        if (up.isDown && this.player.body.touching.down) {
            this.player.setVelocityY(-330);
        }

        // 移动平台往返
        if (this.movingPlatform.x >= 500) {
            this.movingPlatform.setVelocityX(-50);
        } else if (this.movingPlatform.x <= 300) {
            this.movingPlatform.setVelocityX(50);
        }
    }

    collectStar(player, star) {
        star.disableBody(true, true); // 禁用物理体 + 隐藏
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800, height: 600,
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 300 }, debug: false }
    },
    scene: PlatformerScene
};
```

**关键 API：**
- `staticGroup`：不移动的碰撞体，性能比动态体好
- `body.touching.down`：判断角色是否站在地面（防二段跳）
- `disableBody(true, true)`：收集物消失的标准做法（禁用物理 + 隐藏）
- `overlap` vs `collider`：overlap 检测重叠但不产生物理阻挡

---

## Snippet 2：Tilemap + Arcade 碰撞 + 摄像机跟随

适用于：有滚动地图的 RPG / 平台游戏

```javascript
class TilemapScene extends Phaser.Scene {
    player;
    map;
    cursors;
    debugGraphics;
    showDebug = false;

    preload() {
        this.load.setPath('assets/tilemaps/');
        this.load.image('tiles', 'tiles/catastrophi_tiles_16.png');
        this.load.tilemapCSV('map', 'csv/level1.csv');
        this.load.spritesheet('player', 'assets/sprites/spaceman.png', {
            frameWidth: 16, frameHeight: 16
        });
    }

    create() {
        // 从 CSV 创建 Tilemap（指定 tile 尺寸）
        this.map = this.make.tilemap({ key: 'map', tileWidth: 16, tileHeight: 16 });
        const tileset = this.map.addTilesetImage('tiles');
        const layer = this.map.createLayer(0, tileset, 0, 0);

        // 设置碰撞范围（tile 索引 54~83 为碰撞 tile）
        this.map.setCollisionBetween(54, 83);

        // 玩家动画
        ['left', 'right', 'up', 'down'].forEach((dir, i) => {
            const frameMap = { left: [8, 9], right: [1, 2], up: [11, 13], down: [4, 6] };
            this.anims.create({
                key: dir,
                frames: this.anims.generateFrameNumbers('player', {
                    start: frameMap[dir][0], end: frameMap[dir][1]
                }),
                frameRate: 10,
                repeat: -1
            });
        });

        this.player = this.physics.add.sprite(50, 100, 'player', 1);

        // 玩家与 tilemap layer 碰撞
        this.physics.add.collider(this.player, layer);

        // 摄像机跟随玩家，限制在地图边界内
        this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
        this.cameras.main.startFollow(this.player);

        this.cursors = this.input.keyboard.createCursorKeys();

        // Debug 模式（按 C 键切换碰撞可视化）
        this.debugGraphics = this.add.graphics();
        this.input.keyboard.on('keydown-C', () => {
            this.showDebug = !this.showDebug;
            this.debugGraphics.clear();
            if (this.showDebug) {
                this.map.renderDebug(this.debugGraphics, {
                    tileColor: null,
                    collidingTileColor: new Phaser.Display.Color(243, 134, 48, 200),
                    faceColor: new Phaser.Display.Color(40, 39, 37, 255)
                });
            }
        });

        // UI 文字不随摄像机滚动
        this.add.text(16, 16, '方向键移动 | C 键切换碰撞调试', {
            fontSize: '14px', fill: '#ffffff'
        }).setScrollFactor(0);
    }

    update() {
        this.player.body.setVelocity(0);

        if (this.cursors.left.isDown) {
            this.player.body.setVelocityX(-100);
            this.player.anims.play('left', true);
        } else if (this.cursors.right.isDown) {
            this.player.body.setVelocityX(100);
            this.player.anims.play('right', true);
        } else if (this.cursors.up.isDown) {
            this.player.body.setVelocityY(-100);
            this.player.anims.play('up', true);
        } else if (this.cursors.down.isDown) {
            this.player.body.setVelocityY(100);
            this.player.anims.play('down', true);
        } else {
            this.player.anims.stop();
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800, height: 600,
    pixelArt: true,  // pixel art 游戏必须开启，防止模糊
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 } }  // 俯视视角无重力
    },
    scene: TilemapScene
};
```

**关键 API：**
- `setCollisionBetween(start, end)`：按索引范围批量设置碰撞 tile
- `setCollisionByProperty({ collides: true })`：通过 Tiled 属性设置碰撞（推荐用于复杂地图）
- `setScrollFactor(0)`：UI 元素固定在屏幕上，不随摄像机移动
- `pixelArt: true`：像素风游戏必须开启

---

## 常见陷阱

| 问题 | 原因 | 解决 |
|---|---|---|
| 静态平台尺寸变化后碰撞不对 | `setScale` 后物理体未更新 | 调用 `.refreshBody()` |
| 玩家能二段跳 | 未检查地面状态 | 用 `body.touching.down` 判断 |
| 像素图像模糊 | 默认开启抗锯齿 | 设置 `pixelArt: true` |
| Tilemap 碰撞不生效 | 忘记设置碰撞索引 | 调用 `setCollisionBetween` 或 `setCollisionByProperty` |
