---
name: phaser-physics
description: "Phaser 3.90 游戏开发：物理系统。 建议：默认选 Arcade，只有需要不规则多边形碰撞时才用 Matter.js。"
tech_stack: [phaser]
language: [javascript, typescript]
---

# Phaser：物理系统

> 适用版本：Phaser 3.90.0

---

## 物理系统选型

| 系统 | 适用场景 | 性能 |
|---|---|---|
| **Arcade** | 2D 游戏 AABB/圆形碰撞，90% 场景够用 | 最高 |
| **Matter.js** | 多边形、关节、真实刚体模拟 | 中等 |
| **Box2D** | 确定性物理（多人游戏同步） | 中等 |

**建议：默认选 Arcade，只有需要不规则多边形碰撞时才用 Matter.js。**

---

## Arcade 物理配置

```javascript
const config = {
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false,
      debugShowBody: true,
      debugShowStaticBody: true,
      debugShowVelocity: true
    }
  }
};
```

---

## 创建物理对象

```javascript
// 物理 Sprite（动态，可移动）
const player = this.physics.add.sprite(x, y, 'key');

// 物理 Image（动态）
const coin = this.physics.add.image(x, y, 'key');

// 静态 Sprite（不可移动，地面/平台）
const ground = this.physics.add.staticSprite(x, y, 'key');

// 静态组（批量平台）
const platforms = this.physics.add.staticGroup();
platforms.create(400, 568, 'ground');
platforms.create(600, 400, 'ground');

// 动态组
const enemies = this.physics.add.group();

// 为已有对象启用物理
this.physics.add.existing(existingSprite);
this.physics.add.existing(existingSprite, true);  // true = 静态
```

---

## Body 属性与方法

```javascript
const body = sprite.body;  // 或 sprite.physics.body

// 速度（pixels/second）- 直接控制移动
body.setVelocity(vx, vy)
body.setVelocityX(200)
body.setVelocityY(-300)

// 加速度 - 渐变改变速度
body.setAcceleration(ax, ay)
body.setAccelerationX(ax)
body.setAccelerationY(ay)

// 阻力 - 使速度趋向 0
body.setDrag(dragX, dragY)
body.setDragX(100)
body.setDragY(0)

// 弹跳（0=无弹跳, 1=完全弹性）
body.setBounce(0.2, 0)
body.setBounceX(0.5)
body.setBounceY(0.5)

// 重力（覆盖全局重力）
body.setGravityY(200)    // 额外叠加，正=向下
body.setGravityX(0)

// 速度上限
body.setMaxVelocity(400, 800)

// 与世界边界碰撞
body.setCollideWorldBounds(true)
body.setWorldBounce(0.5, 0.5)

// 不可移动（平台）
body.setImmovable(true)

// 摩擦（静止接触时）
body.setFriction(frictionX, frictionY)

// 自定义碰撞盒大小（默认=贴图大小）
body.setSize(width, height)
body.setOffset(offsetX, offsetY)  // 偏移，用于调整碰撞盒位置

// 状态查询
body.velocity        // { x, y }
body.blocked.down    // 是否站在地面上
body.touching.down   // 是否接触下方
body.onFloor()       // 是否在地面（快捷方式）
body.onWall()        // 是否贴墙
```

---

## 碰撞与重叠

```javascript
// 碰撞（物理分离）
this.physics.add.collider(player, platforms);
this.physics.add.collider(player, enemyGroup);

// 碰撞 + 回调
this.physics.add.collider(player, enemies, (player, enemy) => {
  player.takeDamage(10);
  enemy.destroy();
}, null, this);

// 重叠检测（不产生物理分离）
this.physics.add.overlap(player, coins, (player, coin) => {
  coin.destroy();
  this.score += 10;
}, null, this);

// 动态管理 Collider
const collider = this.physics.add.collider(a, b);
collider.active = false;  // 暂时禁用
collider.destroy();       // 永久移除
```

---

## 常用物理模式

### 平台跳跃

```javascript
create() {
  this.player = this.physics.add.sprite(100, 100, 'player');
  this.player.setCollideWorldBounds(true);
  this.player.setBounce(0.1);

  this.platforms = this.physics.add.staticGroup();
  this.platforms.create(400, 568, 'ground');

  this.physics.add.collider(this.player, this.platforms);
  this.cursors = this.input.keyboard.createCursorKeys();
}

update() {
  const onGround = this.player.body.blocked.down;

  if (this.cursors.left.isDown) {
    this.player.setVelocityX(-200);
  } else if (this.cursors.right.isDown) {
    this.player.setVelocityX(200);
  } else {
    this.player.setVelocityX(0);
  }

  if (this.cursors.up.isDown && onGround) {
    this.player.setVelocityY(-500);  // 跳跃
  }
}
```

### 非对称重力（手感更好的跳跃）

```javascript
// 上升时重力小，下降时重力大 → 更有冲击感
update() {
  if (this.player.body.velocity.y < 0) {
    // 上升中
    this.player.body.setGravityY(200);
  } else {
    // 下落中
    this.player.body.setGravityY(800);
  }
}
```

---

## Matter.js 物理（多边形）

```javascript
// 配置
physics: {
  default: 'matter',
  matter: {
    gravity: { y: 1 },
    debug: false
  }
}

// 创建
const box = this.matter.add.image(400, 300, 'box');
box.setFriction(0.5);
box.setBounce(0.8);

// 多边形
const poly = this.matter.add.fromVertices(x, y, [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }
], 'poly');
```

---

## 性能优化

```javascript
// 1. 对屏幕外对象禁用物理
if (enemy.x < -100 || enemy.x > 900) {
  enemy.body.enable = false;
}

// 2. 静态对象用 staticGroup，而非普通 group
const platforms = this.physics.add.staticGroup();  // 更快

// 3. 子弹/道具用对象池，避免频繁 create/destroy
// 见 phaser-game-objects.md 对象池章节

// 4. 大世界用 Tilemap 碰撞层，而非逐个设置
layer.setCollisionByProperty({ collides: true });
this.physics.add.collider(player, layer);
```
