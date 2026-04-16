---
name: phaser-snippet-game-templates
description: "Phaser 3.90 游戏开发：完整小游戏模板。 两个经典游戏的完整实现，每个代表一类通用游戏模式，可直接作为脚手架。"
tech_stack: [phaser]
---

# Phaser：完整小游戏模板

> 适用版本：Phaser 3.86 / 3.90
> 来源：phaser3-examples/public/3.86/src/games/

两个经典游戏的完整实现，每个代表一类通用游戏模式，可直接作为脚手架。

---

## 模板 1：Breakout（弹球 / 消砖块）

**涵盖模式：** 物理弹射、静态网格布局、碰撞回调、输入跟踪鼠标

```javascript
class Breakout extends Phaser.Scene {
    bricks;
    paddle;
    ball;

    constructor() { super({ key: 'Breakout' }); }

    preload() {
        this.load.atlas('assets', 'assets/games/breakout/breakout.png', 'assets/games/breakout/breakout.json');
    }

    create() {
        // 禁用底部世界边界（球落出底部 = 失败）
        this.physics.world.setBoundsCollision(true, true, true, false);

        // 砖块网格：6 种颜色 × 10 列，自动对齐
        this.bricks = this.physics.add.staticGroup({
            key: 'assets',
            frame: ['blue1', 'red1', 'green1', 'yellow1', 'silver1', 'purple1'],
            frameQuantity: 10,
            gridAlign: {
                width: 10, height: 6,
                cellWidth: 64, cellHeight: 32,
                x: 112, y: 100
            }
        });

        // 球：完全弹射（bounce = 1），碰到世界边界反弹
        this.ball = this.physics.add.image(400, 500, 'assets', 'ball1')
            .setCollideWorldBounds(true)
            .setBounce(1);
        this.ball.setData('onPaddle', true); // 初始状态：球在挡板上

        // 挡板：静态，不被球推动
        this.paddle = this.physics.add.image(400, 550, 'assets', 'paddle1')
            .setImmovable();

        // 碰撞
        this.physics.add.collider(this.ball, this.bricks,  this.hitBrick,  null, this);
        this.physics.add.collider(this.ball, this.paddle,  this.hitPaddle, null, this);

        // 鼠标控制挡板
        this.input.on('pointermove', (pointer) => {
            this.paddle.x = Phaser.Math.Clamp(pointer.x, 52, 748);
            if (this.ball.getData('onPaddle')) {
                this.ball.x = this.paddle.x; // 球跟随挡板
            }
        });

        // 点击发球
        this.input.on('pointerup', () => {
            if (this.ball.getData('onPaddle')) {
                this.ball.setVelocity(-75, -300);
                this.ball.setData('onPaddle', false);
            }
        });
    }

    hitBrick(ball, brick) {
        brick.disableBody(true, true); // 砖块消失

        if (this.bricks.countActive() === 0) {
            this.resetLevel(); // 全部消除，重置关卡
        }
    }

    hitPaddle(ball, paddle) {
        // 根据球击中挡板的位置调整反弹角度，防止死循环竖直弹跳
        const diff = ball.x - paddle.x;

        if (Math.abs(diff) < 1) {
            ball.setVelocityX(2 + Math.random() * 8); // 正中间：随机偏一点
        } else {
            ball.setVelocityX(10 * diff); // 越靠边角度越大
        }
    }

    resetBall() {
        this.ball.setVelocity(0);
        this.ball.setPosition(this.paddle.x, 500);
        this.ball.setData('onPaddle', true);
    }

    resetLevel() {
        this.resetBall();
        this.bricks.children.each(brick => brick.enableBody(false, 0, 0, true, true));
    }

    update() {
        // 球落出底部：失球
        if (this.ball.y > 600) {
            this.resetBall();
        }
    }
}

const config = {
    type: Phaser.WEBGL,
    width: 800, height: 600,
    physics: { default: 'arcade' },
    scene: [Breakout]
};
```

**关键技巧：**
- `gridAlign`：一行代码生成整齐砖块矩阵
- `setBounce(1)`：完全弹性碰撞（速度不衰减）
- `setBoundsCollision(true, true, true, false)`：禁用底部边界检测球落下
- `hitPaddle` 角度控制：按偏移量调整 X 速度，避免永远垂直反弹

---

## 模板 2：Snake（贪吃蛇）

**涵盖模式：** 网格逻辑、`Actions.ShiftPosition` 身体跟随、速度递增、碰撞检测

```javascript
// 方向常量
const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;

class SnakeScene extends Phaser.Scene {
    snake;
    food;
    cursors;

    constructor() { super('SnakeScene'); }

    preload() {
        this.load.image('food', 'assets/games/snake/food.png');
        this.load.image('body', 'assets/games/snake/body.png');
    }

    create() {
        // Food 类
        class Food extends Phaser.GameObjects.Image {
            constructor(scene, x, y) {
                super(scene, x * 16, y * 16, 'food');
                this.setOrigin(0);
                this.total = 0;
                scene.children.add(this);
            }
            eat() { this.total++; }
        }

        // Snake 类
        class Snake {
            constructor(scene, x, y) {
                this.headPosition = new Phaser.Geom.Point(x, y);
                this.body = scene.add.group();
                this.head = this.body.create(x * 16, y * 16, 'body');
                this.head.setOrigin(0);
                this.alive = true;
                this.speed = 100;       // 每次移动间隔（ms），越小越快
                this.moveTime = 0;
                this.tail = new Phaser.Geom.Point(x, y);
                this.heading = RIGHT;
                this.direction = RIGHT;
            }

            update(time) {
                if (time >= this.moveTime) return this.move(time);
            }

            // 防止 180° 掉头
            faceLeft()  { if (this.direction !== LEFT  && (this.direction === UP || this.direction === DOWN))  this.heading = LEFT;  }
            faceRight() { if (this.direction !== RIGHT && (this.direction === UP || this.direction === DOWN))  this.heading = RIGHT; }
            faceUp()    { if (this.direction !== UP    && (this.direction === LEFT || this.direction === RIGHT)) this.heading = UP;  }
            faceDown()  { if (this.direction !== DOWN  && (this.direction === LEFT || this.direction === RIGHT)) this.heading = DOWN; }

            move(time) {
                // 更新蛇头位置（Wrap 实现穿墙）
                switch (this.heading) {
                    case LEFT:  this.headPosition.x = Phaser.Math.Wrap(this.headPosition.x - 1, 0, 40); break;
                    case RIGHT: this.headPosition.x = Phaser.Math.Wrap(this.headPosition.x + 1, 0, 40); break;
                    case UP:    this.headPosition.y = Phaser.Math.Wrap(this.headPosition.y - 1, 0, 30); break;
                    case DOWN:  this.headPosition.y = Phaser.Math.Wrap(this.headPosition.y + 1, 0, 30); break;
                }
                this.direction = this.heading;

                // ShiftPosition：每段身体移动到前一段的位置
                // 最后一段的旧位置存入 this.tail（用于生长）
                Phaser.Actions.ShiftPosition(
                    this.body.getChildren(),
                    this.headPosition.x * 16,
                    this.headPosition.y * 16,
                    1,
                    this.tail
                );

                // 自身碰撞检测：蛇头碰到任意身体节点
                const hitBody = Phaser.Actions.GetFirst(
                    this.body.getChildren(),
                    { x: this.head.x, y: this.head.y },
                    1  // 从索引 1 开始（跳过蛇头自身）
                );

                if (hitBody) {
                    this.alive = false;
                    return false;
                }

                this.moveTime = time + this.speed;
                return true;
            }

            grow() {
                // 在尾部追加新节点
                this.body.create(this.tail.x, this.tail.y, 'body').setOrigin(0);
            }

            collideWithFood(food) {
                if (this.head.x === food.x && this.head.y === food.y) {
                    this.grow();
                    food.eat();
                    // 每吃 5 个加速（speed 最小 20ms）
                    if (this.speed > 20 && food.total % 5 === 0) {
                        this.speed -= 5;
                    }
                    return true;
                }
                return false;
            }

            // 返回所有身体格子坐标，用于食物随机位置排除
            getOccupiedCells(grid) {
                this.body.children.each(segment => {
                    grid[segment.y / 16][segment.x / 16] = false;
                });
                return grid;
            }
        }

        this.food  = new Food(this, 3, 4);
        this.snake = new Snake(this, 8, 8);
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    update(time) {
        if (!this.snake.alive) return;

        if      (this.cursors.left.isDown)  this.snake.faceLeft();
        else if (this.cursors.right.isDown) this.snake.faceRight();
        else if (this.cursors.up.isDown)    this.snake.faceUp();
        else if (this.cursors.down.isDown)  this.snake.faceDown();

        if (this.snake.update(time)) {
            if (this.snake.collideWithFood(this.food)) {
                this.repositionFood();
            }
        }
    }

    repositionFood() {
        // 构建所有可用格子，排除蛇身
        const grid = Array.from({ length: 30 }, () => new Array(40).fill(true));
        this.snake.getOccupiedCells(grid);

        const valid = [];
        for (let y = 0; y < 30; y++)
            for (let x = 0; x < 40; x++)
                if (grid[y][x]) valid.push({ x, y });

        if (valid.length > 0) {
            const pos = Phaser.Math.RND.pick(valid);
            this.food.setPosition(pos.x * 16, pos.y * 16);
        }
    }
}

const config = {
    type: Phaser.WEBGL,
    width: 640, height: 480,
    backgroundColor: '#bfcc00',
    scene: SnakeScene
};
```

**关键技巧：**
- `Actions.ShiftPosition`：一行代码实现所有身体节点跟随移动
- `Actions.GetFirst`：从对象列表中找第一个匹配坐标的节点（碰撞检测）
- `Phaser.Math.Wrap`：穿墙移动，无需手动判断边界
- `RND.pick(array)`：从数组中随机取一个元素

---

## 选型建议

| 游戏类型 | 参考模板 | 核心机制 |
|---|---|---|
| 弹球 / 消除 | Breakout | 物理弹射 + 静态网格 |
| 贪吃蛇 / 扫雷 | Snake | 网格逻辑 + Actions |
| 飞机射击 | 见 phaser-snippet-object-pool | 对象池 + 碰撞 |
| 平台跳跃 | 见 phaser-snippet-platformer | Arcade 物理 |
| RPG / 冒险 | 见 phaser-snippet-platformer | Tilemap + 摄像机 |
