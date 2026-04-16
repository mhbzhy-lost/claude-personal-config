---
name: phaser-curves
description: "Phaser 3.90 游戏开发：曲线与路径系统。 Phaser.Curves 提供多种曲线类型，核心用途："
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser：曲线与路径系统

> 适用版本：Phaser 3.90.0

---

## 概览

Phaser.Curves 提供多种曲线类型，核心用途：
- 游戏对象沿路径运动（PathFollower）
- 粒子发射路径
- 相机运动轨迹
- 绘制曲线（调试/UI）

| 类 | 用途 |
|---|---|
| `Path` | 复合路径，组合多段曲线 |
| `Line` | 直线段 |
| `CubicBezier` | 三次贝塞尔曲线（两个控制点）|
| `QuadraticBezier` | 二次贝塞尔曲线（一个控制点）|
| `Spline` | 通过所有控制点的样条曲线 |
| `Ellipse` | 椭圆/圆弧曲线 |
| `MoveTo` | 路径中的"移动但不绘制"命令 |

---

## Path（复合路径）

Path 是最常用的入口，可以将多种曲线类型串联。

```javascript
// 创建路径
const path = new Phaser.Curves.Path(startX, startY);

// 添加各种曲线段
path.lineTo(x, y)                              // 直线
path.moveTo(x, y)                              // 移动（不绘制）
path.cubicBezierTo(endX, endY, ctrl1X, ctrl1Y, ctrl2X, ctrl2Y)  // 三次贝塞尔
path.quadraticBezierTo(endX, endY, ctrlX, ctrlY)                // 二次贝塞尔
path.splineTo(points)                          // Catmull-Rom 样条（点数组）
path.ellipseTo(xRadius, yRadius, startAngle, endAngle, clockwise, rotation)
path.circleTo(radius, [clockwise], [rotation]) // 整圆简写
path.closePath()                               // 回到起点连线

// 路径信息
path.getLength()                               // 总长度
path.getPoint(t, [out])                        // t=0~1，路径上的点
path.getPoints(divisions)                      // 均匀采样 N+1 个点
path.getSpacedPoints(divisions)                // 等弧长采样
path.getStartPoint([out])
path.getEndPoint([out])
path.getTangent(t, [out])                      // t 处的切线方向
path.getBounds([out], [accuracy])              // 包围盒

// 序列化
path.toJSON()
path.fromJSON(data)

// 调试绘制
path.draw(graphics, pointsTotal)

path.destroy()
```

---

## CubicBezier（三次贝塞尔）

精确控制曲线形状，有两个控制点。

```javascript
const p0 = new Phaser.Math.Vector2(0, 0);     // 起点
const p1 = new Phaser.Math.Vector2(100, 0);   // 控制点1
const p2 = new Phaser.Math.Vector2(0, 100);   // 控制点2
const p3 = new Phaser.Math.Vector2(100, 100); // 终点

const curve = new Phaser.Curves.CubicBezier(p0, p1, p2, p3);

curve.getPoint(t, [out])          // t=0~1
curve.getPoints(divisions)        // 采样点数组
curve.getLength()
curve.getTangent(t, [out])
curve.getBounds([out], [accuracy])
curve.draw(graphics, [pointsTotal=32])
curve.toJSON()
```

---

## QuadraticBezier（二次贝塞尔）

一个控制点，曲线更简单平滑。

```javascript
const p0 = new Phaser.Math.Vector2(0, 0);     // 起点
const p1 = new Phaser.Math.Vector2(50, -100); // 控制点（拱顶）
const p2 = new Phaser.Math.Vector2(100, 0);   // 终点

const curve = new Phaser.Curves.QuadraticBezier(p0, p1, p2);
curve.getPoint(t)
curve.draw(graphics)
```

---

## Spline（Catmull-Rom 样条）

曲线穿过所有控制点，自然流畅。

```javascript
const spline = new Phaser.Curves.Spline([
  new Phaser.Math.Vector2(0, 100),
  new Phaser.Math.Vector2(100, 0),
  new Phaser.Math.Vector2(200, 100),
  new Phaser.Math.Vector2(300, 50),
]);

// 或传入扁平数组
const spline = new Phaser.Curves.Spline([0, 100, 100, 0, 200, 100, 300, 50]);

spline.addPoint(x, y)         // 动态添加点
spline.addPoints(points)
spline.getPoint(t)
```

---

## Ellipse（椭圆曲线）

用于圆形/椭圆形运动轨迹。

```javascript
const ellipse = new Phaser.Curves.Ellipse(
  cx, cy,           // 中心
  xRadius, yRadius, // 半径
  startAngle,       // 起始角（度）
  endAngle,         // 结束角（度）
  clockwise,        // 顺时针
  rotation          // 旋转角（度）
);

ellipse.setXRadius(100);
ellipse.setYRadius(50);
ellipse.setStartAngle(0);
ellipse.setEndAngle(360);
ellipse.setClockwise(true);
ellipse.getPoint(t)
```

---

## PathFollower（沿路径运动的游戏对象）

让 Sprite 沿 Path 自动移动。

```javascript
create() {
  // 定义路径
  const path = new Phaser.Curves.Path(100, 300);
  path.cubicBezierTo(700, 300, 200, 100, 600, 100);
  path.lineTo(700, 500);

  // 创建 PathFollower
  const follower = this.add.follower(path, 100, 300, 'ship');

  // 开始跟随
  follower.startFollow({
    duration: 4000,          // 走完全程的时间（ms）
    yoyo: false,             // 到终点后原路返回
    repeat: -1,              // 无限循环
    ease: 'Sine.easeInOut',
    rotateToPath: true,      // 旋转方向朝向路径切线
    rotationOffset: 0,       // 旋转偏移量（度）
    startAt: 0,              // 从 0~1 的哪个位置开始
    onComplete: () => { },
    onUpdate: (follower, t) => { }
  });

  // 手动控制
  follower.pauseFollow();
  follower.resumeFollow();
  follower.stopFollow();

  // 获取当前位置
  follower.pathT           // 当前 t 值（0~1）
  follower.pathVector      // 当前位置 Vector2
}
```

---

## 常用模式

### 子弹弧线飞行

```javascript
create() {
  const path = new Phaser.Curves.Path(player.x, player.y);
  path.quadraticBezierTo(
    target.x, target.y,
    (player.x + target.x) / 2, player.y - 200  // 弓形控制点
  );

  const bullet = this.add.follower(path, player.x, player.y, 'bullet');
  bullet.startFollow({ duration: 800, rotateToPath: true });
  bullet.on('pathcomplete', () => {
    bullet.destroy();
    target.explode();
  });
}
```

### 相机沿路径移动（过场动画）

```javascript
create() {
  const camPath = new Phaser.Curves.Path(0, 300);
  camPath.splineTo([200, 200, 400, 350, 600, 100, 800, 300]);

  const camFollower = this.add.follower(camPath, 0, 300, null);
  camFollower.setVisible(false);

  this.tweens.add({
    targets: camFollower,
    pathT: 1,
    duration: 5000,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      this.cameras.main.setScroll(
        camFollower.x - 400,
        camFollower.y - 300
      );
    }
  });
}
```

### 调试绘制路径

```javascript
const graphics = this.add.graphics();
graphics.lineStyle(2, 0x00ff00, 1);
path.draw(graphics, 64);   // 64 = 采样精度（越高越平滑）
```
