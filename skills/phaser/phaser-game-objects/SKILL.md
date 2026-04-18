---
name: phaser-game-objects
description: "Phaser 3.90 游戏开发：游戏对象与对象管理。 大量频繁创建/销毁对象（子弹、粒子、敌人）时必须使用对象池，避免 GC 抖动。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：游戏对象与对象管理

> 适用版本：Phaser 3.90.0

---

## 核心游戏对象类型

| 对象 | 创建方式 | 用途 |
|---|---|---|
| Image | `this.add.image(x, y, 'key')` | 静态图片，无动画 |
| Sprite | `this.add.sprite(x, y, 'key')` | 支持帧动画的图片 |
| Text | `this.add.text(x, y, '文字', style)` | Canvas 文字渲染 |
| Rectangle | `this.add.rectangle(x, y, w, h, color)` | 矩形色块 |
| Circle | `this.add.circle(x, y, radius, color)` | 圆形色块 |
| Graphics | `this.add.graphics()` | 自定义绘图 |
| Group | `this.add.group()` | 对象集合管理 |
| Container | `this.add.container(x, y, children)` | 组合多个对象 |
| ParticleEmitter | `this.add.particles(x, y, 'key', cfg)` | 粒子效果 |

---

## 通用方法（所有 GameObjects 共享）

```javascript
const obj = this.add.sprite(400, 300, 'player');

// 位置与变换
obj.setPosition(x, y)
obj.setX(x);  obj.setY(y)
obj.setScale(scale)           // 等比缩放
obj.setScale(scaleX, scaleY)  // 非等比
obj.setRotation(radians)
obj.setAngle(degrees)
obj.setOrigin(x, y)           // 0~1，默认 0.5（中心）

// 显示属性
obj.setAlpha(0.5)
obj.setTint(0xff0000)
obj.clearTint()
obj.setVisible(false)
obj.setBlendMode(Phaser.BlendModes.ADD)
obj.setDepth(10)              // 渲染层级，数值越大越靠前

// 尺寸
obj.setDisplaySize(100, 100)
obj.getBounds()               // 返回 Rectangle

// 交互
obj.setInteractive()          // 启用输入事件
obj.disableInteractive()

// 销毁
obj.destroy()
```

---

## Depth（Z-Order）

```javascript
// depth 是排序值，不是 DisplayList 位置
bg.setDepth(0);       // 最底层
player.setDepth(10);  // 中层
ui.setDepth(100);     // 最顶层

// 或直接操作 DisplayList
this.children.bringToTop(obj);
this.children.sendToBack(obj);
this.children.moveUp(obj);
this.children.moveDown(obj);
```

---

## Graphics（自定义绘制）

```javascript
const g = this.add.graphics();

// 填充
g.fillStyle(0xff0000, 1);         // 颜色, 透明度
g.fillRect(x, y, width, height);
g.fillCircle(cx, cy, radius);
g.fillTriangle(x1,y1, x2,y2, x3,y3);

// 描边
g.lineStyle(2, 0xffffff, 1);      // 宽度, 颜色, 透明度
g.strokeRect(x, y, width, height);
g.strokeCircle(cx, cy, radius);

// 路径
g.beginPath();
g.moveTo(x, y);
g.lineTo(x2, y2);
g.closePath();
g.strokePath();

// 清除
g.clear();
```

---

## Group（对象组）

```javascript
// 普通组（无物理）
const group = this.add.group();

// 物理动态组
const enemies = this.physics.add.group();

// 物理静态组（不可移动，适合平台、墙壁）
const platforms = this.physics.add.staticGroup();

// 批量创建
const coins = this.physics.add.group({
  key: 'coin',
  repeat: 10,
  setXY: { x: 100, y: 100, stepX: 70 }
});

// 常用方法
group.add(gameObject)
group.remove(gameObject, true)  // true = 从场景移除
group.getChildren()             // 返回数组
group.getLength()
group.contains(child)
group.countActive()             // 激活状态数量
group.getFirst(active, create, x, y, key)  // 取第一个符合条件的
group.clear()
group.destroy(true)             // true = 同时销毁子对象

// 批量设置
group.setDepth(10, 1)           // 值, 步进
group.setVisible(false)
group.setAlpha(0.5)
```

---

## 对象池（Object Pooling）

大量频繁创建/销毁对象（子弹、粒子、敌人）时必须使用对象池，避免 GC 抖动。

```javascript
// 创建对象池
const bulletPool = this.physics.add.group({
  classType: Phaser.Physics.Arcade.Image,
  maxSize: 50,
  runChildUpdate: false
});

// 射击时：取出一个闲置对象
function fireBullet(x, y) {
  const bullet = bulletPool.get(x, y, 'bullet');
  if (!bullet) return;  // 池已满

  bullet.setActive(true);
  bullet.setVisible(true);
  bullet.body.reset(x, y);
  bullet.setVelocityY(-400);
}

// 子弹飞出屏幕时：归还对象
function recycleBullet(bullet) {
  bullet.setActive(false);
  bullet.setVisible(false);
  bullet.body.reset(0, 0);
}

// update 中检测
bulletPool.getChildren().forEach(bullet => {
  if (bullet.active && bullet.y < 0) {
    recycleBullet(bullet);
  }
});
```

---

## Container（组合对象）

```javascript
// 将多个对象组合为一个整体移动
const healthBar = this.add.container(200, 100, [
  this.add.rectangle(0, 0, 100, 10, 0x333333),
  this.add.rectangle(-25, 0, 50, 10, 0x00ff00)
]);

// Container 移动时，子对象跟随
healthBar.setPosition(300, 200);

// 注意：Container 子对象的坐标是相对于 Container 的
```

---

## 常见错误

```
// 错误：add.sprite 不含物理
const s = this.add.sprite(x, y, 'key');
this.physics.add.collider(s, platform);  // 不生效！

// 正确：必须用物理工厂创建
const s = this.physics.add.sprite(x, y, 'key');
this.physics.add.collider(s, platform);  // 正常
```
