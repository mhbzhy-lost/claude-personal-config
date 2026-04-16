---
name: phaser-scale
description: "Phaser 3.90 游戏开发：ScaleManager（屏幕缩放适配）。"
tech_stack: [phaser]
language: [javascript, typescript]
---

# Phaser：ScaleManager（屏幕缩放适配）

> 适用版本：Phaser 3.90.0

---

## 缩放模式（Scale Modes）

在游戏配置中设置：

```javascript
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scale: {
    mode: Phaser.Scale.FIT,           // 缩放模式
    autoCenter: Phaser.Scale.CENTER_BOTH, // 居中方式
    parent: 'game-container',         // 挂载到指定 DOM 元素（可选）
    width: 800,
    height: 600,
    min: { width: 320, height: 240 }, // 最小尺寸
    max: { width: 1600, height: 1200 },
  }
};
```

### 缩放模式常量

| 常量 | 值 | 行为 |
|---|---|---|
| `Phaser.Scale.NONE` | 0 | 不缩放，固定像素 |
| `Phaser.Scale.WIDTH_CONTROLS_HEIGHT` | 1 | 宽度固定，高度按比例 |
| `Phaser.Scale.HEIGHT_CONTROLS_WIDTH` | 2 | 高度固定，宽度按比例 |
| `Phaser.Scale.FIT` | 3 | 等比缩放，适应容器（含黑边）|
| `Phaser.Scale.ENVELOP` | 4 | 等比缩放，填满容器（可能裁切）|
| `Phaser.Scale.RESIZE` | 5 | 拉伸填满容器（不保持比例）|
| `Phaser.Scale.EXPAND` | 6 | 保持像素密度，扩展游戏区域 |

### 居中方式常量

| 常量 | 行为 |
|---|---|
| `Phaser.Scale.NO_CENTER` | 不居中 |
| `Phaser.Scale.CENTER_BOTH` | 水平+垂直居中 |
| `Phaser.Scale.CENTER_HORIZONTALLY` | 仅水平居中 |
| `Phaser.Scale.CENTER_VERTICALLY` | 仅垂直居中 |

### 缩放级别快捷常量

```javascript
zoom: Phaser.Scale.NO_ZOOM   // 1x
zoom: Phaser.Scale.ZOOM_2X   // 2x
zoom: Phaser.Scale.ZOOM_4X   // 4x
zoom: Phaser.Scale.MAX_ZOOM  // 最大整数缩放
```

---

## ScaleManager（运行时访问）

```javascript
const scale = this.scale;

// 当前尺寸
scale.width         // 游戏逻辑宽
scale.height        // 游戏逻辑高
scale.zoom          // 当前缩放倍数

// 尺寸对象
scale.gameSize      // 配置的游戏尺寸
scale.displaySize   // 实际显示尺寸
scale.parentSize    // 父容器尺寸

// 方向
scale.orientation              // 'landscape' 或 'portrait'
scale.isPortrait               // boolean
scale.isLandscape              // boolean

// 运行时修改游戏尺寸
scale.setGameSize(width, height)

// 手动刷新（窗口大小变化后）
scale.refresh()

// 坐标变换（DOM 坐标 → 游戏坐标）
scale.transformX(pageX)
scale.transformY(pageY)
```

---

## 全屏支持

```javascript
// 进入全屏
this.scale.startFullscreen();

// 退出全屏
this.scale.stopFullscreen();

// 切换全屏
this.scale.toggleFullscreen();

// 监听状态
this.scale.isFullscreen  // boolean

// 绑定按钮触发（浏览器要求用户手势）
const btn = this.add.text(400, 300, '全屏', { fontSize: '32px' })
  .setInteractive()
  .on('pointerdown', () => this.scale.toggleFullscreen());
```

---

## Scale 事件

```javascript
this.scale.on('resize', (gameSize, baseSize, displaySize, previousWidth, previousHeight) => {
  // 窗口/容器大小变化时触发
  this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
});

this.scale.on('orientationchange', (orientation) => {
  if (orientation === Phaser.Scale.Orientation.PORTRAIT) {
    // 竖屏处理
  }
});

this.scale.on('enterfullscreen',  () => { });
this.scale.on('leavefullscreen',  () => { });
this.scale.on('fullscreenerror',  () => { });
```

---

## 常用适配方案

### 移动端适配（推荐）

```javascript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  width: 800,
  height: 600,
}
```

### 横竖屏提示

```javascript
// 在 Scene 中处理
create() {
  this.portraitWarning = this.add.text(400, 300, '请横屏游玩', {
    fontSize: '32px'
  }).setOrigin(0.5).setVisible(false);

  this.scale.on('orientationchange', (orientation) => {
    const isPortrait = orientation === Phaser.Scale.Orientation.PORTRAIT;
    this.portraitWarning.setVisible(isPortrait);
    this.scene.pause();
    if (!isPortrait) this.scene.resume();
  });
}
```

### 像素游戏（整数缩放）

```javascript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  zoom: Phaser.Scale.MAX_ZOOM,  // 最大整数缩放，防锯齿
  width: 320,
  height: 180,
}
```

### EXPAND 模式（可变视口）

```javascript
scale: {
  mode: Phaser.Scale.EXPAND,  // 视口随窗口扩展，不缩放像素
  width: 800,
  height: 600,
}

// 监听 resize 更新游戏逻辑
this.scale.on('resize', (gameSize) => {
  this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
  this.bg.setDisplaySize(gameSize.width, gameSize.height);
});
```

---

## 注意事项

- `FIT` 模式可能有黑边，用 `backgroundColor` 设置填充色
- `ENVELOP` 模式无黑边但可能裁切内容，确保重要内容在安全区内
- 全屏 API 必须由用户手势触发（点击/触摸），不能自动调用
- `MAX_ZOOM` 自动选择最大整数倍缩放，适合像素艺术游戏
