---
name: phaser-math
description: "Phaser 3.90 游戏开发：数学工具库。 所有缓动函数输入/输出均为 0~1："
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：数学工具库

> 适用版本：Phaser 3.90.0

---

## 常量

```javascript
Phaser.Math.PI2              // π × 2
Phaser.Math.TAU              // π × 0.5
Phaser.Math.DEG_TO_RAD       // π / 180
Phaser.Math.RAD_TO_DEG       // 180 / π
Phaser.Math.EPSILON          // 1.0e-6
Phaser.Math.RND              // 全局 RandomDataGenerator 实例
```

---

## 常用函数

### 随机数

```javascript
Phaser.Math.Between(min, max)          // 整数随机 [min, max]
Phaser.Math.FloatBetween(min, max)     // 浮点随机 [min, max]
```

### 数值约束

```javascript
Phaser.Math.Clamp(value, min, max)     // 钳制到 [min, max]
Phaser.Math.Wrap(value, min, max)      // 循环折叠到 [min, max]
Phaser.Math.Within(a, b, tolerance)   // 两值差值是否在容差范围内
Phaser.Math.MaxAdd(value, amount, max) // 加法但不超过 max
Phaser.Math.MinSub(value, amount, min) // 减法但不低于 min
```

### 角度与弧度互转

```javascript
Phaser.Math.DegToRad(degrees)  // 度 → 弧度
Phaser.Math.RadToDeg(radians)  // 弧度 → 度
```

### 百分比

```javascript
Phaser.Math.FromPercent(percent, min, max)           // percent(0~1) 映射到 [min, max]
Phaser.Math.Percent(value, min, max, [upperMax])     // value 在 [min, max] 中的百分比
```

### 插值与平滑

```javascript
Phaser.Math.Linear(p0, p1, t)              // 线性插值，t=0~1
Phaser.Math.SmoothStep(x, min, max)        // 平滑阶梯（三次曲线）
Phaser.Math.SmootherStep(x, min, max)      // 更平滑的 SmoothStep
Phaser.Math.CatmullRom(t, p0, p1, p2, p3) // Catmull-Rom 样条插值
```

### 统计

```javascript
Phaser.Math.Average(values)   // 数组平均值
Phaser.Math.Median(values)    // 数组中位数
Phaser.Math.Difference(a, b)  // 绝对差值
Phaser.Math.Factorial(value)  // 阶乘
```

### 奇偶判断

```javascript
Phaser.Math.IsEven(value)       // 整数是否为偶数
Phaser.Math.IsEvenStrict(value) // 严格整数偶数判断
```

### 物理相关

```javascript
Phaser.Math.GetSpeed(distance, time) // 距离/时间 → 速度
```

### 坐标变换

```javascript
Phaser.Math.TransformXY(x, y, posX, posY, rotation, scaleX, scaleY, [out])
// 将本地坐标变换到世界坐标

Phaser.Math.RotateAround(point, x, y, angle)         // 绕点旋转
Phaser.Math.RotateAroundDistance(point, x, y, angle, distance)
Phaser.Math.ToXY(index, width, height, [out])        // 线性索引 → 2D 坐标
```

---

## Phaser.Math.Angle（角度工具）

```javascript
// 两点间角度（弧度）
Phaser.Math.Angle.Between(x1, y1, x2, y2)
Phaser.Math.Angle.BetweenPoints(point1, point2)

// 角度规范化
Phaser.Math.Angle.Normalize(angle)      // 归一化到 [0, 2π]
Phaser.Math.Angle.Wrap(angle)           // 折叠到 [-π, π]
Phaser.Math.Angle.WrapDegrees(angle)    // 折叠到 [-180, 180]

// 顺/逆时针距离
Phaser.Math.Angle.GetClockwiseDistance(angle1, angle2)        // [0, 2π)
Phaser.Math.Angle.GetCounterClockwiseDistance(angle1, angle2) // (-2π, 0]
Phaser.Math.Angle.GetShortestDistance(angle1, angle2)         // [-π, π]

// 向目标角度旋转
Phaser.Math.Angle.RotateTo(current, target, [lerp=0.05])  // 沿最短路径插值

// 随机角度
Phaser.Math.Angle.Random()        // [-π, π]
Phaser.Math.Angle.RandomDegrees() // [-180, 180]

// 反转
Phaser.Math.Angle.Reverse(angle)
```

---

## Phaser.Math.Distance（距离计算）

```javascript
// 欧式距离（最常用）
Phaser.Math.Distance.Between(x1, y1, x2, y2)
Phaser.Math.Distance.BetweenPoints(a, b)         // Vector2Like 对象

// 平方距离（避免 sqrt，用于比较）
Phaser.Math.Distance.Squared(x1, y1, x2, y2)
Phaser.Math.Distance.BetweenPointsSquared(a, b)

// 特殊距离
Phaser.Math.Distance.Snake(x1, y1, x2, y2)      // 曼哈顿距离（格子移动）
Phaser.Math.Distance.Chebyshev(x1, y1, x2, y2)  // 切比雪夫距离（棋盘距离）
Phaser.Math.Distance.Power(x1, y1, x2, y2, pow) // 幂次距离
```

---

## Phaser.Math.Easing（缓动函数）

所有缓动函数输入/输出均为 0~1：

```javascript
// 每类缓动有 In / Out / InOut 三种变体
Phaser.Math.Easing.Back.In(v, [overshoot=1.70158])   // 超出后回弹
Phaser.Math.Easing.Bounce.Out(v)                     // 弹跳
Phaser.Math.Easing.Circular.InOut(v)                 // 圆弧曲线
Phaser.Math.Easing.Cubic.In(v)                       // 三次曲线
Phaser.Math.Easing.Elastic.Out(v, [amp=0.1], [period=0.1]) // 弹性
Phaser.Math.Easing.Expo.InOut(v)                     // 指数曲线
Phaser.Math.Easing.Quadratic.Out(v)                  // 二次曲线
Phaser.Math.Easing.Quartic.InOut(v)                  // 四次曲线
Phaser.Math.Easing.Quintic.In(v)                     // 五次曲线
Phaser.Math.Easing.Sine.InOut(v)                     // 正弦曲线（最自然）
Phaser.Math.Easing.Linear(v)                         // 线性
Phaser.Math.Easing.Stepped(v, [steps=1])             // 离散阶梯

// Tween 中用字符串引用
ease: 'Sine.easeInOut'
ease: 'Back.easeOut'
ease: 'Bounce.easeOut'
ease: 'Elastic.easeOut'
```

---

## Vector2（2D 向量）

```javascript
const v = new Phaser.Math.Vector2(x, y);

// 属性
v.x; v.y;
v.length()         // 向量长度
v.lengthSq()       // 长度平方（比较时更快）

// 运算（均返回 this，可链式调用）
v.add(other)       // 相加
v.subtract(other)  // 相减
v.scale(scalar)    // 缩放
v.normalize()      // 归一化（长度变为1）
v.dot(other)       // 点积
v.cross(other)     // 叉积（返回标量）
v.lerp(other, t)   // 线性插值
v.set(x, y)        // 设置值
v.clone()          // 克隆

// 静态工厂
Phaser.Math.Vector2.ZERO   // (0, 0)
Phaser.Math.Vector2.ONE    // (1, 1)
Phaser.Math.Vector2.RIGHT  // (1, 0)
Phaser.Math.Vector2.UP     // (0, -1)
```

---

## RandomDataGenerator（可复现随机）

```javascript
const rng = new Phaser.Math.RandomDataGenerator(['seed1', 'seed2']);
// 或使用全局实例
const rng = Phaser.Math.RND;

rng.between(min, max)    // 整数
rng.frac()               // 0~1 浮点
rng.real()               // 随机实数
rng.realInRange(min, max)
rng.angle()              // -180~180 度
rng.rotation()           // -π~π 弧度
rng.pick(array)          // 随机选取数组元素
rng.shuffle(array)       // 打乱数组（原地修改）
rng.weightedPick(array)  // 按权重选取（前面权重更高）
rng.uuid()               // 生成 UUID v4

rng.sow(['newSeed'])     // 重新播种（可复现）
rng.init(seed)           // 初始化
rng.state()              // 获取当前状态字符串
rng.state(stateStr)      // 恢复到之前状态
```

---

## 常用游戏数学模式

```javascript
// 向目标平滑移动
update(time, delta) {
  const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
  const speed = 150;
  enemy.setVelocity(
    Math.cos(angle) * speed,
    Math.sin(angle) * speed
  );
}

// 平方距离比较（避免 sqrt）
const distSq = Phaser.Math.Distance.BetweenPointsSquared(a, b);
if (distSq < 100 * 100) { /* 距离小于 100 */ }

// 在扇形范围内判断
const angle = Phaser.Math.Angle.Between(origin.x, origin.y, target.x, target.y);
const diff = Math.abs(Phaser.Math.Angle.GetShortestDistance(facingAngle, angle));
if (diff < Phaser.Math.DegToRad(45)) { /* 目标在 ±45° 扇形内 */ }
```
