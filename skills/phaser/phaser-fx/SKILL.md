---
name: phaser-fx
description: "Phaser 3.90 游戏开发：FX 视觉特效系统。 Phaser FX 系统为任意 GameObject 添加 Post-Processing 视觉效果，无需修改贴图。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：FX 视觉特效系统

> 适用版本：Phaser 3.90.0
> **注意：FX 特效仅在 WebGL 渲染器下可用，Canvas 模式不支持。**

---

## 概览

Phaser FX 系统为任意 GameObject 添加 Post-Processing 视觉效果，无需修改贴图。

**两种用法：**
- **preFX**：特效作用于对象本身（随旋转/缩放变换）
- **postFX**：特效作用于对象渲染到摄像机后的结果

```javascript
// preFX（对象本身）
const fx = sprite.preFX.add<EffectName>(params);

// postFX（后处理）
const fx = sprite.postFX.add<EffectName>(params);

// 禁用/启用
fx.setActive(false);
fx.setActive(true);

// 移除
sprite.preFX.remove(fx);
sprite.postFX.remove(fx);

// 清除所有特效
sprite.preFX.clear();
sprite.postFX.clear();
```

---

## 15 种特效

### 1. Glow（发光）

```javascript
const glow = sprite.preFX.addGlow(
  color,          // 0xffffff - 发光颜色
  outerStrength,  // 4 - 外发光强度
  innerStrength,  // 0 - 内发光强度
  knockout        // false - 只显示发光不显示贴图
);

glow.color = 0x00ff00;
glow.outerStrength = 8;
glow.innerStrength = 2;

// 动态脉冲效果
this.tweens.add({
  targets: glow,
  outerStrength: { from: 2, to: 8 },
  duration: 800,
  yoyo: true,
  repeat: -1
});
```

### 2. Blur（模糊）

```javascript
const blur = sprite.preFX.addBlur(
  quality,   // 0=Low, 1=Medium, 2=High
  x,         // 2 - 水平模糊量
  y,         // 2 - 垂直模糊量
  strength,  // 1
  color,     // 0xffffff
  steps      // 4
);

blur.x = 4;
blur.strength = 2;
```

### 3. Bloom（泛光）

```javascript
const bloom = sprite.preFX.addBloom(
  color,         // 0xffffff
  offsetX,       // 1
  offsetY,       // 1
  blurStrength,  // 1
  strength,      // 1
  steps          // 4
);
```

### 4. Shadow（阴影）

```javascript
const shadow = sprite.preFX.addShadow(
  x,          // 0 - 水平偏移
  y,          // 0 - 垂直偏移
  decay,      // 0.1
  power,      // 1
  color,      // 0x000000
  samples,    // 6 - 采样数（1~12）
  intensity   // 1
);

shadow.x = 3;
shadow.y = 3;
shadow.color = 0x333333;
```

### 5. Vignette（暗角）

```javascript
const vignette = camera.postFX.addVignette(
  x,        // 0.5 - 中心 X（0~1）
  y,        // 0.5 - 中心 Y（0~1）
  radius,   // 0.5 - 暗角半径
  strength  // 0.5
);

// 常用于相机后处理
this.cameras.main.postFX.addVignette(0.5, 0.5, 0.8, 0.6);
```

### 6. ColorMatrix（色彩矩阵）

```javascript
const cm = sprite.preFX.addColorMatrix();

// 预设滤镜
cm.blackWhite();
cm.sepia();
cm.negative();
cm.grayscale(value);
cm.brightness(value);
cm.contrast(value);
cm.saturate(value);
cm.hue(rotation);
cm.night(intensity);
cm.lsd();
cm.kodachrome();
cm.technicolor();
cm.polaroid();
cm.brown();
cm.vintagePinhole();
cm.reset();  // 恢复默认
```

### 7. Pixelate（像素化）

```javascript
const pixelate = sprite.preFX.addPixelate(amount); // amount=1
pixelate.amount = 8;  // 像素块大小

// 搭配 Tween 做过渡效果
this.tweens.add({
  targets: pixelate,
  amount: { from: 1, to: 16 },
  duration: 500
});
```

### 8. Shine（光泽扫光）

```javascript
const shine = sprite.preFX.addShine(
  speed,      // 0.5 - 扫光速度
  lineWidth,  // 0.5 - 光线宽度
  gradient,   // 3   - 渐变强度
  reveal      // false - true=揭示模式
);
```

### 9. Gradient（渐变叠加）

```javascript
const gradient = sprite.preFX.addGradient(
  color1,  // 0xff0000
  color2,  // 0x00ff00
  alpha,   // 0.2 - 叠加透明度
  fromX,   // 0 - 起点 X（0~1）
  fromY,   // 0 - 起点 Y（0~1）
  toX,     // 0 - 终点 X（0~1）
  toY,     // 1 - 终点 Y（0~1）
  size     // 0 - 渐变分块数
);
```

### 10. Displacement（扭曲置换）

```javascript
// 需要一张位移贴图
const disp = sprite.preFX.addDisplacement('displacementTexture', x, y);
disp.x = 0.01;
disp.y = 0.01;
disp.setTexture('anotherTexture');

// 搭配 Tween 做水面波纹
this.tweens.add({
  targets: disp,
  x: { from: -0.02, to: 0.02 },
  duration: 1500,
  yoyo: true,
  repeat: -1,
  ease: 'Sine.easeInOut'
});
```

### 11. Barrel（桶形畸变）

```javascript
const barrel = sprite.preFX.addBarrel(amount); // amount=1
barrel.amount = 1.5;  // 正值=桶形，负值=枕形
```

### 12. Bokeh / 景深

```javascript
const bokeh = sprite.preFX.addBokeh(
  radius,       // 0.5
  amount,       // 1
  contrast,     // 0.2
  isTiltShift,  // false - true=移轴效果
  blurX,        // 1
  blurY,        // 1
  strength      // 1
);

bokeh.isTiltShift = true;  // 切换为移轴模糊
```

### 13. Circle（圆形遮罩）

```javascript
const circle = sprite.preFX.addCircle(
  thickness,        // 8 - 环宽（像素）
  color,            // 0xfeedb6
  backgroundColor,  // 0xff0000
  scale,            // 1
  feather           // 0.005 - 边缘柔化
);
```

### 14. Wipe（擦除过渡）

```javascript
const wipe = sprite.preFX.addWipe(
  wipeWidth,  // 0.1 - 擦除边宽
  direction,  // 0 or 1
  axis,       // 0=水平, 1=垂直
  reveal      // false=擦除, true=揭示
);

// 用 progress 属性驱动动画
this.tweens.add({
  targets: wipe,
  progress: { from: 0, to: 1 },
  duration: 1000,
  ease: 'Linear',
  onComplete: () => wipe.setActive(false)
});
```

---

## 相机级别 FX

相机 postFX 对整个视口生效：

```javascript
const cam = this.cameras.main;

// 屏幕暗角（最常见）
cam.postFX.addVignette(0.5, 0.5, 0.8, 0.5);

// 全屏模糊（过场/暂停菜单）
const blur = cam.postFX.addBlur(0, 2, 2, 1);

// 全屏黑白
const cm = cam.postFX.addColorMatrix();
cm.grayscale(1);

// 色差（chromatic aberration 效果）
const barrel = cam.postFX.addBarrel(1.02);
```

---

## 常见组合效果

### 受伤闪红

```javascript
function hitEffect(sprite) {
  const cm = sprite.preFX.addColorMatrix();
  cm.saturate(-1);  // 去色
  cm.brightness(2); // 提亮

  this.time.delayedCall(150, () => {
    sprite.preFX.remove(cm);
  });
}
```

### 技能充能发光

```javascript
const glow = hero.preFX.addGlow(0x00ffff, 0, 0);
this.tweens.add({
  targets: glow,
  outerStrength: 15,
  duration: 1000,
  ease: 'Sine.easeIn',
  onComplete: () => {
    hero.preFX.remove(glow);
    this.fireSkill();
  }
});
```

### 死亡像素化

```javascript
function deathEffect(sprite) {
  const px = sprite.preFX.addPixelate(1);
  this.tweens.add({
    targets: px,
    amount: 20,
    duration: 600,
    ease: 'Linear',
    onComplete: () => sprite.destroy()
  });
}
```
