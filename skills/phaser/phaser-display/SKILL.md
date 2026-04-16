---
name: phaser-display
description: "Phaser 3.90 游戏开发：Display（颜色、对齐、遮罩）。 与 FX.ColorMatrix 共用，此处为独立 Display 版本："
tech_stack: [phaser]
language: [javascript, typescript]
---

# Phaser：Display（颜色、对齐、遮罩）

> 适用版本：Phaser 3.90.0

---

## Color（颜色对象）

```javascript
// 创建颜色对象（参数为 0~255）
const color = new Phaser.Display.Color(255, 128, 0, 255);

// 常用实例属性
color.red;    color.green;    color.blue;    color.alpha    // 0~255
color.redGL;  color.greenGL;  color.blueGL;  color.alphaGL  // 0~1（WebGL）
color.color   // 不含 alpha 的 32 位整数
color.color32 // 含 alpha 的 32 位整数
color.rgba    // CSS 字符串 'rgba(r,g,b,a)'
color.h; color.s; color.v  // HSV 分量（0~1）
color.gl      // Float32Array [r,g,b,a]（WebGL 用）

// 实例方法
color.setTo(r, g, b, [a])
color.setGLTo(r, g, b, [a])    // 0~1 范围
color.setFromRGB({r, g, b})
color.setFromHSV(h, s, v)
color.brighten(amount)          // 亮度 +
color.darken(amount)            // 亮度 -
color.lighten(amount)           // 明度 +
color.saturate(amount)
color.desaturate(amount)
color.gray(shade)               // 设为灰色
color.random([min], [max])      // 随机颜色
color.randomGray([min], [max])
color.clone()
color.transparent()             // → alpha=0
```

### 颜色静态工具函数

```javascript
// 16 进制字符串解析
Phaser.Display.Color.HexStringToColor('#ff8000')    // → Color
Phaser.Display.Color.RGBStringToColor('rgb(255,128,0)') // → Color

// 整数颜色
Phaser.Display.Color.GetColor(r, g, b)              // → number（不含 alpha）
Phaser.Display.Color.GetColor32(r, g, b, a)         // → number（含 alpha）
Phaser.Display.Color.IntegerToColor(0xff8000)        // → Color
Phaser.Display.Color.IntegerToRGB(0xff8000)          // → {r, g, b, a}

// HSV 互转
Phaser.Display.Color.HSVToRGB(h, s, v, [out])       // → {r,g,b,a} 或 Color
Phaser.Display.Color.RGBToHSV(r, g, b, [out])       // → {h,s,v}
Phaser.Display.Color.HSLToColor(h, s, l)            // → Color

// 工具
Phaser.Display.Color.ColorToRGBA(color)             // → {r,g,b,a}
Phaser.Display.Color.ComponentToHex(value)          // → 两位十六进制字符串
Phaser.Display.Color.RandomRGB([min], [max])        // → Color
Phaser.Display.Color.ValueToColor(value)            // 通用转换（接受多种格式）
Phaser.Display.Color.HSVColorWheel([steps])         // → 色轮颜色数组
Phaser.Display.Color.ColorSpectrum([limit])         // → 色谱颜色数组
```

---

## ColorMatrix（色彩矩阵）

与 FX.ColorMatrix 共用，此处为独立 Display 版本：

```javascript
const cm = new Phaser.Display.ColorMatrix();

// 预设效果
cm.grayscale([value])
cm.blackWhite()
cm.sepia()
cm.negative()
cm.brightness([value])
cm.contrast([value])
cm.saturate([value])
cm.hue([rotation])
cm.night([intensity])
cm.kodachrome()
cm.technicolor()
cm.polaroid()
cm.brown()
cm.lsd()
cm.vintagePinhole()
cm.reset()

// 自定义矩阵（20 元素数组）
cm.set(float32ArrayOrArray20)
cm.getData()    // → Float32Array（传给 shader 用）

// 混合强度（0=原始, 1=完全效果）
cm.alpha = 0.5
```

---

## Display.Align（对齐工具）

### 对齐常量（13 个）

```javascript
Phaser.Display.Align.TOP_LEFT
Phaser.Display.Align.TOP_CENTER
Phaser.Display.Align.TOP_RIGHT
Phaser.Display.Align.LEFT_TOP
Phaser.Display.Align.LEFT_CENTER
Phaser.Display.Align.LEFT_BOTTOM
Phaser.Display.Align.CENTER
Phaser.Display.Align.RIGHT_TOP
Phaser.Display.Align.RIGHT_CENTER
Phaser.Display.Align.RIGHT_BOTTOM
Phaser.Display.Align.BOTTOM_LEFT
Phaser.Display.Align.BOTTOM_CENTER
Phaser.Display.Align.BOTTOM_RIGHT
```

### Align.In（相对于另一对象对齐）

```javascript
// 将 child 对齐到 parent 内部的某个位置
Phaser.Display.Align.In.Center(child, parent)
Phaser.Display.Align.In.TopLeft(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.In.TopCenter(child, parent, [offsetY])
Phaser.Display.Align.In.TopRight(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.In.LeftCenter(child, parent, [offsetX])
Phaser.Display.Align.In.RightCenter(child, parent, [offsetX])
Phaser.Display.Align.In.BottomLeft(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.In.BottomCenter(child, parent, [offsetY])
Phaser.Display.Align.In.BottomRight(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.In.QuickSet(child, parent, position, [offsetX], [offsetY])
// position = Phaser.Display.Align.CENTER 等常量
```

### Align.To（相对于另一对象外部对齐）

```javascript
// 将 child 放在 parent 的外侧
Phaser.Display.Align.To.TopLeft(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.To.TopCenter(child, parent, [offsetY])
Phaser.Display.Align.To.TopRight(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.To.LeftTop(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.To.LeftCenter(child, parent, [offsetX])
Phaser.Display.Align.To.RightCenter(child, parent, [offsetX])
Phaser.Display.Align.To.BottomLeft(child, parent, [offsetX], [offsetY])
Phaser.Display.Align.To.BottomCenter(child, parent, [offsetY])
Phaser.Display.Align.To.BottomRight(child, parent, [offsetX], [offsetY])
```

---

## Display.Bounds（边界工具）

```javascript
// 获取游戏对象边界
Phaser.Display.Bounds.GetLeft(gameObject)     // → number
Phaser.Display.Bounds.GetRight(gameObject)
Phaser.Display.Bounds.GetTop(gameObject)
Phaser.Display.Bounds.GetBottom(gameObject)
Phaser.Display.Bounds.GetCenterX(gameObject)
Phaser.Display.Bounds.GetCenterY(gameObject)
Phaser.Display.Bounds.GetBounds(gameObject, [out])  // → Rectangle

// 设置游戏对象边界（通过移动对象实现）
Phaser.Display.Bounds.SetLeft(gameObject, x)
Phaser.Display.Bounds.SetRight(gameObject, x)
Phaser.Display.Bounds.SetTop(gameObject, y)
Phaser.Display.Bounds.SetBottom(gameObject, y)
Phaser.Display.Bounds.SetCenterX(gameObject, x)
Phaser.Display.Bounds.SetCenterY(gameObject, y)
Phaser.Display.Bounds.CenterOn(gameObject, x, y)   // 快捷居中
Phaser.Display.Bounds.GetOffsetX(gameObject)
Phaser.Display.Bounds.GetOffsetY(gameObject)
```

---

## Display.Masks（遮罩）

### GeometryMask（几何遮罩）

基于 Graphics 对象，Canvas 和 WebGL 均支持。

```javascript
// 创建遮罩形状
const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
maskShape.fillStyle(0xffffff);
maskShape.fillCircle(100, 100, 80);

// 创建遮罩
const mask = new Phaser.Display.Masks.GeometryMask(this, maskShape);
// 或简写
const mask = maskShape.createGeometryMask();

// 应用遮罩
sprite.setMask(mask);

// 移除（不销毁遮罩对象）
sprite.clearMask();

// 移除并销毁遮罩对象
sprite.clearMask(true);
```

### BitmapMask（位图遮罩）

基于贴图 Alpha 通道，**仅 WebGL 支持**。

```javascript
// 使用 Image/Sprite/BitmapText 等作为遮罩贴图
const maskImage = this.add.image(0, 0, 'circle-mask');
const mask = maskImage.createBitmapMask();

// 应用
sprite.setMask(mask);
camera.setMask(mask);
```

### 遮罩对比

| 特性 | GeometryMask | BitmapMask |
|---|---|---|
| Canvas 支持 | ✅ | ❌ |
| Alpha 混合 | ❌（二值） | ✅ |
| 性能 | 较好 | 稍慢 |
| 适合场景 | 简单形状裁切 | 复杂羽化遮罩 |

---

## 常用模式

### 颜色插值动画

```javascript
const colorA = Phaser.Display.Color.HexStringToColor('#ff0000');
const colorB = Phaser.Display.Color.HexStringToColor('#0000ff');

this.tweens.addCounter({
  from: 0, to: 100,
  duration: 2000,
  repeat: -1,
  yoyo: true,
  onUpdate: (tween) => {
    const v = tween.getValue() / 100;
    const r = Phaser.Math.Linear(colorA.red,   colorB.red,   v);
    const g = Phaser.Math.Linear(colorA.green, colorB.green, v);
    const b = Phaser.Math.Linear(colorA.blue,  colorB.blue,  v);
    sprite.setTint(Phaser.Display.Color.GetColor(r, g, b));
  }
});
```

### 圆形视野遮罩

```javascript
const fovMask = this.make.graphics({ add: false });

update() {
  fovMask.clear();
  fovMask.fillStyle(0xffffff);
  fovMask.fillCircle(player.x, player.y, 200);  // 视野半径
  worldLayer.setMask(fovMask.createGeometryMask());
}
```
