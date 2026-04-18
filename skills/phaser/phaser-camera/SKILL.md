---
name: phaser-camera
description: "Phaser 3.90 游戏开发：摄像机系统。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：摄像机系统

> 适用版本：Phaser 3.90.0

---

## 主摄像机

```javascript
const camera = this.cameras.main;

// 位置（滚动视口）
camera.setScroll(x, y);
camera.scrollX = 100;
camera.scrollY = 200;

// 锁定视口到世界某区域
camera.setBounds(0, 0, worldWidth, worldHeight);

// 缩放（2=放大2倍, 0.5=缩小至一半）
camera.setZoom(2);
camera.zoom = 1.5;

// 旋转
camera.setRotation(Math.PI / 8);

// 背景色
camera.setBackgroundColor('#1a1a2e');

// 渲染区域（视口在屏幕上的位置和大小）
camera.setViewport(0, 0, 800, 600);
```

---

## 跟随目标

```javascript
// 简单跟随（瞬时到位）
camera.startFollow(player);

// 带 Lerp 的平滑跟随（推荐）
// lerpX/Y: 0=不跟随, 1=瞬时到位, 0.1=很平滑
camera.startFollow(player, false, 0.08, 0.08);
//                          ↑ roundPixels（像素对齐，防模糊）

// 带偏移（让角色不在正中央）
camera.startFollow(player, false, 0.1, 0.1, -100, 50);
//                                              ↑ offsetX  ↑ offsetY

// 死区（角色在此范围内移动不触发摄像机移动）
camera.setDeadzone(200, 100);  // 宽, 高

// 停止跟随
camera.stopFollow();
```

### Lerp 值选取经验

| Lerp 值 | 效果 |
|---|---|
| 0.05~0.08 | 非常平滑，适合平台跳跃 |
| 0.1~0.15 | 中等响应，通用选择 |
| 0.3~0.5 | 较快跟随，适合快节奏游戏 |
| 1 | 瞬时到位，无延迟 |

---

## 摄像机特效

```javascript
// 抖动（伤害反馈、爆炸）
camera.shake(duration, intensity);
// 例：camera.shake(200, 0.01);

// 淡出/淡入（场景过渡）
camera.fadeOut(duration, r, g, b, callback);
camera.fadeIn(duration, r, g, b, callback);
// 例：camera.fadeOut(500, 0, 0, 0);

// 闪光（命中反馈）
camera.flash(duration, r, g, b, force, callback);
// 例：camera.flash(100, 255, 255, 255);

// 平移到目标位置
camera.pan(x, y, duration, ease, force, callback);
// 例：camera.pan(400, 300, 1000, 'Sine.easeInOut');

// 旋转到指定角度
camera.rotateTo(radians, shortestPath, duration, ease, force, callback);

// 缩放动画
camera.zoomTo(zoomLevel, duration, ease, force, callback);
```

---

## 多摄像机（分屏/小地图）

```javascript
// 创建第二个摄像机（右半屏）
const minimap = this.cameras.add(600, 0, 200, 150);
minimap.setZoom(0.2);           // 缩小显示全局地图
minimap.startFollow(player);
minimap.setBackgroundColor('#000033');
minimap.setAlpha(0.8);

// 控制哪些对象对哪个摄像机可见
// 方法一：忽略某对象
camera.ignore(sprite);           // 主摄像机看不见这个对象
minimap.ignore(uiLayer);         // 小地图看不见 UI

// 方法二：设置对象的摄像机 filter（位掩码）
sprite.setCameraFilter(minimap.id);  // 只对小地图可见
```

---

## 世界尺寸与摄像机边界

```javascript
// 设置物理世界尺寸（比屏幕大的世界）
this.physics.world.setBounds(0, 0, 3200, 600);

// 设置摄像机不超出世界范围
camera.setBounds(0, 0, 3200, 600);

// 配合 Tilemap
const map = this.make.tilemap({ key: 'map' });
camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
```

---

## 屏幕坐标 ↔ 世界坐标转换

```javascript
// 屏幕坐标 → 世界坐标（处理缩放/滚动后的坐标）
const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);

// 世界坐标 → 屏幕坐标
const screenPoint = camera.getScreenPoint(worldX, worldY);

// pointer 已自动提供 worldX/worldY
this.input.on('pointerdown', (pointer) => {
  console.log(pointer.worldX, pointer.worldY);  // 直接用
});
```

---

## 常用组合：平台跳跃摄像机配置

```javascript
create() {
  // 世界比屏幕大
  this.physics.world.setBounds(0, 0, 3200, 600);

  const camera = this.cameras.main;
  camera.setBounds(0, 0, 3200, 600);
  camera.startFollow(this.player, true, 0.08, 0.08);
  camera.setDeadzone(100, 50);  // 水平方向小死区，垂直方向更宽松
}
```
