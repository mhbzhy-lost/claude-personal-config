---
name: phaser-input
description: "Phaser 3.90 游戏开发：输入系统。 Phaser 将鼠标和触控统一抽象为 Pointer，代码无需区分平台。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-input]
---

# Phaser：输入系统

> 适用版本：Phaser 3.90.0

---

## 键盘输入

### 方向键（最常用）

```javascript
create() {
  this.cursors = this.input.keyboard.createCursorKeys();
  // 包含: left, right, up, down, shift, space
}

update() {
  if (this.cursors.left.isDown)  { player.setVelocityX(-200); }
  if (this.cursors.right.isDown) { player.setVelocityX(200); }
  if (this.cursors.up.isDown)    { player.setVelocityY(-300); }
  if (this.cursors.space.isDown) { /* 跳跃 */ }
}
```

### 自定义按键

```javascript
// 单个按键
const keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
const keySpace = this.input.keyboard.addKey('SPACE');

// 多个按键
const keys = this.input.keyboard.addKeys({
  up: 'W',
  down: 'S',
  left: 'A',
  right: 'D',
  fire: 'SPACE'
});

update() {
  if (keys.left.isDown) { ... }
  if (Phaser.Input.Keyboard.JustDown(keys.fire)) { ... }  // 只触发一次
  if (Phaser.Input.Keyboard.JustUp(keys.fire))  { ... }  // 松开时触发一次
}
```

### 按键事件

```javascript
this.input.keyboard.on('keydown-SPACE', (event) => { /* 按下 */ });
this.input.keyboard.on('keyup-SPACE',   (event) => { /* 松开 */ });
this.input.keyboard.on('keydown',       (event) => { console.log(event.key); });
```

---

## 鼠标与触控（统一为 Pointer）

Phaser 将鼠标和触控统一抽象为 Pointer，代码无需区分平台。

### 全局 Pointer 事件

```javascript
this.input.on('pointerdown',  (pointer) => {
  console.log(pointer.x, pointer.y);
  console.log(pointer.button);  // 0=左键, 1=中键, 2=右键
});
this.input.on('pointerup',    (pointer) => { });
this.input.on('pointermove',  (pointer) => { });
this.input.on('pointerover',  (pointer) => { });  // 进入对象
this.input.on('pointerout',   (pointer) => { });  // 离开对象
```

### 对象上的 Pointer 事件

```javascript
// 必须先调用 setInteractive()
sprite.setInteractive();

sprite.on('pointerdown', (pointer, localX, localY) => {
  // localX/Y 是相对于对象原点的坐标
});
sprite.on('pointerup',    (pointer) => { });
sprite.on('pointermove',  (pointer, localX, localY) => { });
sprite.on('pointerover',  (pointer) => { sprite.setTint(0xffff00); });
sprite.on('pointerout',   (pointer) => { sprite.clearTint(); });
```

### 拖拽

```javascript
sprite.setInteractive();
this.input.setDraggable(sprite);

sprite.on('drag', (pointer, dragX, dragY) => {
  sprite.setPosition(dragX, dragY);
});
sprite.on('dragstart', (pointer) => { });
sprite.on('dragend',   (pointer) => { });
```

---

## 自定义 Hit Area

```javascript
// 圆形（默认矩形时用圆形精度更好）
sprite.setInteractive(
  new Phaser.Geom.Circle(cx, cy, radius),
  Phaser.Geom.Circle.Contains
);

// 矩形（非中心原点时自定义范围）
sprite.setInteractive(
  new Phaser.Geom.Rectangle(x, y, width, height),
  Phaser.Geom.Rectangle.Contains
);

// 多边形（不规则形状）
sprite.setInteractive(
  new Phaser.Geom.Polygon([x1,y1, x2,y2, x3,y3]),
  Phaser.Geom.Polygon.Contains
);

// 不可见的点击区域
const zone = this.add.zone(x, y, width, height);
zone.setInteractive();
zone.on('pointerdown', () => { });
```

---

## 多点触控

```javascript
// 默认支持 2 个 Pointer（mousePointer + pointer1）
// 最多支持 10 个
this.input.addPointer(3);  // 增加到 4 个

// 在 config 中设置
input: {
  activePointers: 4
}

// 访问具体 Pointer
const p1 = this.input.pointer1;
const p2 = this.input.pointer2;
const all = this.input.manager.pointers;
```

---

## 手柄（Gamepad）

```javascript
// 需用户先按下任意按钮才能激活（浏览器安全限制）
this.input.gamepad.on('connected', (pad) => {
  console.log('手柄已连接:', pad.id);
});

update() {
  if (this.input.gamepad.total === 0) return;
  const pad = this.input.gamepad.pad1;

  if (pad.isConnected) {
    // 按钮（Xbox: 0=A, 1=B, 2=X, 3=Y）
    if (pad.buttons[0].pressed) { player.jump(); }

    // 模拟摇杆（-1 到 1）
    const stickX = pad.axes[0].getValue();
    const stickY = pad.axes[1].getValue();
    player.setVelocityX(stickX * 300);

    // 肩键/扳机
    const leftTrigger  = pad.L2;   // 0~1
    const rightTrigger = pad.R2;   // 0~1
  }
}
```

---

## 输入优先级与事件冒泡

```javascript
// 阻止事件传递到下层对象
sprite.on('pointerdown', (pointer) => {
  pointer.event.stopPropagation();
});

// 设置输入优先级（数值越高越优先处理）
sprite.setInteractive({ draggable: true });
this.input.setTopOnly(true);  // 只触发最顶层对象的事件（默认 true）
```

---

## 实用技巧

```javascript
// 获取当前鼠标/触控位置（世界坐标）
const pointer = this.input.activePointer;
const worldX = pointer.worldX;
const worldY = pointer.worldY;

// 检查鼠标是否在某对象上
const isOver = sprite.getBounds().contains(pointer.x, pointer.y);

// 禁用默认浏览器右键菜单
this.input.mouse.disableContextMenu();
```
