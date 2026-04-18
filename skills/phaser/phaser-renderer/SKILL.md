---
name: phaser-renderer
description: "Phaser 3.90 游戏开发：渲染器（Renderer）。 Phaser 支持两种渲染器，通过 type 配置选择："
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：渲染器（Renderer）

> 适用版本：Phaser 3.90.0

---

## 概览

Phaser 支持两种渲染器，通过 `type` 配置选择：

| 渲染器 | 常量 | 特点 |
|---|---|---|
| WebGL | `Phaser.WEBGL` | 硬件加速，支持 FX/Shader，性能强 |
| Canvas | `Phaser.CANVAS` | 软件渲染，兼容性好，不支持 FX |
| 自动 | `Phaser.AUTO` | 优先 WebGL，不支持时降级 Canvas（推荐）|

```javascript
const config = {
  type: Phaser.AUTO,  // 推荐
  // type: Phaser.WEBGL,   // 强制 WebGL
  // type: Phaser.CANVAS,  // 强制 Canvas（像素游戏）
};
```

---

## 访问渲染器

```javascript
// 在 Scene 中
const renderer = this.sys.renderer;
// 或
const renderer = this.game.renderer;

// 检查渲染器类型
if (renderer.type === Phaser.WEBGL) {
  // WebGL 专有功能
}

// 基本属性
renderer.width;    // 渲染宽度
renderer.height;   // 渲染高度
renderer.drawCount; // 当前帧已渲染的对象数量（性能监控）
```

---

## WebGL 渲染器关键属性

```javascript
const gl = renderer.gl;          // WebGLRenderingContext 原始对象
renderer.maxTextures;            // 最大纹理单元数（最少 8）
renderer.contextLost;            // WebGL Context 是否丢失

// 内置纹理
renderer.blankTexture;           // 32×32 透明纹理
renderer.whiteTexture;           // 4×4 白色纹理
renderer.normalTexture;          // 1×1 法线贴图（#7f7fff）
```

---

## Pipeline（WebGL 渲染管线）

Pipeline 是 WebGL 渲染的核心概念，决定如何渲染游戏对象。

### 内置管线（11 种）

| 管线 | 用途 |
|---|---|
| `MultiPipeline` | 默认，批量渲染大多数对象 |
| `SinglePipeline` | 单对象渲染 |
| `MobilePipeline` | 移动端优化 |
| `FXPipeline` | 处理 FX 特效 |
| `PreFXPipeline` | PreFX 渲染 |
| `PostFXPipeline` | PostFX 渲染（自定义后处理基类）|
| `LightPipeline` | 2D 光照管线 |
| `PointLightPipeline` | 点光源渲染 |
| `BitmapMaskPipeline` | 位图遮罩 |
| `RopePipeline` | Rope 对象渲染 |
| `UtilityPipeline` | 内部工具（Blur、Copy 等）|

### 自定义 PostFX Pipeline（后处理效果）

```javascript
class MyEffect extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'MyEffect',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        varying vec2 outTexCoord;
        uniform float uTime;

        void main() {
          vec2 uv = outTexCoord;
          uv.x += sin(uv.y * 10.0 + uTime) * 0.01;
          gl_FragColor = texture2D(uMainSampler, uv);
        }
      `
    });
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
  }
}

// 注册
const config = {
  pipeline: { MyEffect }  // 或通过 PipelineManager
};

// 使用
sprite.setPostPipeline('MyEffect');
// 或
sprite.setPostPipeline(MyEffect);
```

### PipelineManager

```javascript
const pm = this.renderer.pipelines;

// 获取管线
const pipeline = pm.get('MultiPipeline');

// 添加自定义管线
pm.add('MyEffect', MyEffect);

// 检查是否存在
pm.has('MyEffect')
```

---

## 截图功能

```javascript
// 截全屏
this.game.renderer.snapshot((image) => {
  // image 是 HTMLImageElement
  document.body.appendChild(image);
}, 'image/png');

// 截指定区域
this.game.renderer.snapshotArea(x, y, width, height, (image) => { });

// 截单个像素颜色
this.game.renderer.snapshotPixel(x, y, (color) => {
  console.log(color.red, color.green, color.blue);
});
```

---

## Canvas 渲染器特有

```javascript
const canvasRenderer = this.sys.renderer; // CanvasRenderer

canvasRenderer.gameCanvas       // HTMLCanvasElement
canvasRenderer.gameContext      // CanvasRenderingContext2D
canvasRenderer.antialias        // 是否开启图像平滑
canvasRenderer.currentContext   // 当前激活的 Context

// Canvas 截图
const canvas = this.game.canvas;
const dataURL = canvas.toDataURL('image/png');
```

---

## 渲染器事件

```javascript
this.game.renderer.on('resize', (width, height) => { });
this.game.renderer.on('contextlost',     () => { console.warn('WebGL Context 丢失'); });
this.game.renderer.on('contextrestored', () => { /* 重新初始化 WebGL 资源 */ });
```

---

## 性能监控

```javascript
// 每帧渲染的对象数量
update() {
  console.log('Draw calls:', this.sys.renderer.drawCount);
}

// 查看当前使用的管线
// 在 WebGL debugger 或自定义指标中记录

// 帧率监控（通过 game.loop）
this.game.loop.actualFps      // 实际 FPS
this.game.loop.targetFps      // 目标 FPS
this.game.loop.delta          // 当前帧时间差（ms）
```

---

## 注意事项

- FX 特效（`preFX` / `postFX`）**仅 WebGL 支持**，Canvas 模式下调用会静默失败或报错
- 自定义 Shader/Pipeline **仅 WebGL 支持**
- WebGL Context 丢失（`contextlost`）可能在移动端切换 Tab 时发生，需监听并处理
- `drawCount` 越低性能越好，批量渲染（同贴图 Atlas）可显著降低 draw calls
- Canvas 模式适合像素艺术游戏，但大量对象时性能显著低于 WebGL
