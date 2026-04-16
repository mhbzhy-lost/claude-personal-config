---
name: phaser-geom
description: "Phaser 3.90 游戏开发：几何图形与碰撞检测。 最常用，碰撞盒、视口、区域判断首选。"
tech_stack: [phaser]
---

# Phaser：几何图形与碰撞检测

> 适用版本：Phaser 3.90.0

---

## 几何类型常量

```javascript
Phaser.Geom.CIRCLE      // 0
Phaser.Geom.ELLIPSE     // 1
Phaser.Geom.LINE        // 2
Phaser.Geom.POINT       // 3
Phaser.Geom.POLYGON     // 4
Phaser.Geom.RECTANGLE   // 5
Phaser.Geom.TRIANGLE    // 6
```

---

## Rectangle（矩形）

最常用，碰撞盒、视口、区域判断首选。

```javascript
const rect = new Phaser.Geom.Rectangle(x, y, width, height);

// 属性
rect.x; rect.y; rect.width; rect.height
rect.left; rect.right; rect.top; rect.bottom
rect.centerX; rect.centerY

// 实例方法
rect.contains(x, y)       // → boolean
rect.getPoint(position)   // position 0~1，沿边界取点
rect.getPoints(quantity)  // 取多个边界点
rect.getRandomPoint()     // 内部随机点
rect.setTo(x, y, w, h)

// 静态方法
Phaser.Geom.Rectangle.Contains(rect, x, y)           // 点是否在矩形内
Phaser.Geom.Rectangle.ContainsPoint(rect, point)
Phaser.Geom.Rectangle.ContainsRect(rectA, rectB)     // 是否包含另一矩形
Phaser.Geom.Rectangle.Overlaps(rectA, rectB)         // → boolean
Phaser.Geom.Rectangle.Intersection(rectA, rectB, [out]) // 交集矩形
Phaser.Geom.Rectangle.Union(rectA, rectB, [out])     // 合并矩形
Phaser.Geom.Rectangle.GetCenter(rect, [out])         // 中心点
Phaser.Geom.Rectangle.Clone(rect)                   // 克隆
Phaser.Geom.Rectangle.CenterOn(rect, x, y)          // 居中到坐标
Phaser.Geom.Rectangle.FromPoints(points, [out])      // 从点集构建
Phaser.Geom.Rectangle.Area(rect)                    // 面积
Phaser.Geom.Rectangle.Perimeter(rect)               // 周长
Phaser.Geom.Rectangle.Random(rect, [out])           // 内部随机点
Phaser.Geom.Rectangle.RandomOutside(outer, inner, [out]) // 外环随机点
```

---

## Circle（圆形）

```javascript
const circle = new Phaser.Geom.Circle(x, y, radius);

// 属性
circle.x; circle.y; circle.radius; circle.diameter
circle.left; circle.right; circle.top; circle.bottom

// 实例方法
circle.contains(x, y)
circle.getPoint(position)    // 0~1，沿圆周取点
circle.getPoints(quantity)
circle.getRandomPoint()      // 圆内随机点
circle.setTo(x, y, radius)
circle.isEmpty()
circle.setEmpty()

// 静态方法
Phaser.Geom.Circle.Contains(circle, x, y)
Phaser.Geom.Circle.ContainsPoint(circle, point)
Phaser.Geom.Circle.ContainsRect(circle, rect)
Phaser.Geom.Circle.Area(circle)
Phaser.Geom.Circle.Circumference(circle)
Phaser.Geom.Circle.Random(circle, [out])
Phaser.Geom.Circle.Offset(circle, x, y)   // 移动圆心
```

---

## Triangle（三角形）

```javascript
const tri = new Phaser.Geom.Triangle(x1, y1, x2, y2, x3, y3);

// 属性
tri.x1; tri.y1; tri.x2; tri.y2; tri.x3; tri.y3
tri.left; tri.right; tri.top; tri.bottom

// 实例方法
tri.contains(x, y)
tri.getLineA([line])    // 获取边 A 作为 Line 对象
tri.getLineB([line])
tri.getLineC([line])
tri.setTo(x1, y1, x2, y2, x3, y3)

// 静态方法
Phaser.Geom.Triangle.Contains(triangle, x, y)
Phaser.Geom.Triangle.Area(triangle)
Phaser.Geom.Triangle.Perimeter(triangle)
Phaser.Geom.Triangle.Centroid(triangle, [out])      // 重心
Phaser.Geom.Triangle.Circumcircle(triangle, [out])  // 外接圆
Phaser.Geom.Triangle.BuildEquilateral(x, y, length) // 等边三角形
Phaser.Geom.Triangle.BuildRight(x, y, width, height) // 直角三角形
Phaser.Geom.Triangle.Random(triangle, [out])
Phaser.Geom.Triangle.Rotate(triangle, angle)
```

---

## Line（线段）

```javascript
const line = new Phaser.Geom.Line(x1, y1, x2, y2);

// 属性
line.x1; line.y1; line.x2; line.y2

// 实例方法
line.getPoint(position)     // 0~1，沿线段取点
line.getPointA([vec2])      // 起点
line.getPointB([vec2])      // 终点
line.getRandomPoint([pt])
line.setTo(x1, y1, x2, y2)

// 静态方法
Phaser.Geom.Line.Length(line)
Phaser.Geom.Line.Angle(line)              // 线段角度（弧度）
Phaser.Geom.Line.GetMidPoint(line, [out]) // 中点
Phaser.Geom.Line.GetNormal(line, [out])   // 法向量
Phaser.Geom.Line.ReflectAngle(lineA, lineB) // 反射角
Phaser.Geom.Line.Extend(line, beginExt, endExt)  // 延伸
Phaser.Geom.Line.SetToAngle(line, x, y, angle, length) // 从角度设定
Phaser.Geom.Line.NormalAngle(line)        // 法线角度
Phaser.Geom.Line.Slope(line)              // 斜率
Phaser.Geom.Line.Rotate(line, angle)
```

---

## Point（点）

```javascript
const pt = new Phaser.Geom.Point(x, y);
pt.setTo(x, y)

// 静态方法
Phaser.Geom.Point.GetMagnitude(point)
Phaser.Geom.Point.SetMagnitude(point, magnitude)
Phaser.Geom.Point.Interpolate(ptA, ptB, t, [out])
Phaser.Geom.Point.GetCentroid(points, [out])   // 点集重心
```

---

## Ellipse（椭圆）

```javascript
const ellipse = new Phaser.Geom.Ellipse(x, y, width, height);

ellipse.contains(x, y)
ellipse.getMajorRadius()
ellipse.getMinorRadius()
ellipse.setTo(x, y, width, height)

Phaser.Geom.Ellipse.Area(ellipse)
Phaser.Geom.Ellipse.Circumference(ellipse)
Phaser.Geom.Ellipse.Random(ellipse, [out])
```

---

## Polygon（多边形）

```javascript
const poly = new Phaser.Geom.Polygon([x1, y1, x2, y2, x3, y3]);
// 或
const poly = new Phaser.Geom.Polygon([{x:0,y:0}, {x:100,y:0}, {x:50,y:100}]);

poly.contains(x, y)
poly.calculateArea()
poly.setTo(points)

Phaser.Geom.Polygon.GetAABB(polygon, [out])   // 轴对齐包围盒
Phaser.Geom.Polygon.Perimeter(polygon)
Phaser.Geom.Polygon.Smooth(polygon)           // 平滑
Phaser.Geom.Polygon.Simplify(polygon)         // 简化顶点
Phaser.Geom.Polygon.Translate(polygon, x, y)
Phaser.Geom.Polygon.Reverse(polygon)          // 反转顶点顺序
```

---

## Geom.Intersects（碰撞检测）

### 布尔值检测

```javascript
const I = Phaser.Geom.Intersects;

I.CircleToCircle(circleA, circleB)           // → boolean
I.CircleToRectangle(circle, rect)            // → boolean
I.LineToCircle(line, circle, [nearest])      // → boolean
I.LineToLine(line1, line2, [out])            // → boolean
I.LineToRectangle(line, rect)               // → boolean
I.RectangleToRectangle(rectA, rectB)        // → boolean
I.RectangleToTriangle(rect, triangle)       // → boolean
I.TriangleToCircle(triangle, circle)        // → boolean
I.TriangleToLine(triangle, line)            // → boolean
I.TriangleToTriangle(triangleA, triangleB)  // → boolean
I.PointToLine(point, line, [thickness])     // → boolean
```

### 获取交点坐标

```javascript
I.GetLineToLine(line1, line2, [isRay], [out])          // → Vector3 | null
I.GetLineToCircle(line, circle, [out])                 // → Point[]
I.GetLineToRectangle(line, rect, [out])               // → Point[]
I.GetRectangleIntersection(rectA, rectB, [out])       // → Rectangle（交叠区域）
I.GetCircleToCircle(circleA, circleB, [out])          // → Point[]
I.GetLineToPolygon(line, polygons, [isRay], [out])    // → Vector4 | null
I.GetRaysFromPointToPolygon(x, y, polygons)           // → Vector4[]（可见性光线）
```

---

## 常用模式

### 视野检测（FOV）

```javascript
// 玩家视线射线与墙壁多边形的交叉
const ray = new Phaser.Geom.Line(player.x, player.y, targetX, targetY);
const walls = [wall1Polygon, wall2Polygon];
const hit = Phaser.Geom.Intersects.GetLineToPolygon(ray, walls);
if (hit) { /* 有遮挡 */ }
```

### 区域触发器

```javascript
const triggerZone = new Phaser.Geom.Rectangle(300, 200, 100, 100);

update() {
  if (triggerZone.contains(player.x, player.y)) {
    this.triggerEvent();
  }
}
```

### 圆形范围伤害

```javascript
const blastRadius = new Phaser.Geom.Circle(explosionX, explosionY, 150);

enemies.getChildren().forEach(enemy => {
  if (blastRadius.contains(enemy.x, enemy.y)) {
    enemy.takeDamage(50);
  }
});
```
