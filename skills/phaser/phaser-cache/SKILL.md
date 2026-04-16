---
name: phaser-cache
description: "Phaser 3.90 游戏开发：Cache（资源缓存管理）。 Phaser 在 preload() 阶段自动将加载的资源存入 CacheManager，开发者通常不需要直接操作缓存，但了解缓存系统有助于："
tech_stack: [phaser]
---

# Phaser：Cache（资源缓存管理）

> 适用版本：Phaser 3.90.0

---

## 概览

Phaser 在 `preload()` 阶段自动将加载的资源存入 `CacheManager`，开发者通常不需要直接操作缓存，但了解缓存系统有助于：
- 动态加载后检查是否已缓存
- 运行时释放不再需要的资源（内存管理）
- 读取 JSON、文本等非显示类资源的原始数据

---

## 访问 CacheManager

```javascript
// 在 Scene 中通过 this.cache 访问
this.cache
```

---

## CacheManager 子缓存

| 属性 | 存储内容 |
|---|---|
| `this.cache.audio` | 音频资源 |
| `this.cache.binary` | 二进制文件 |
| `this.cache.bitmapFont` | 位图字体 |
| `this.cache.html` | HTML 文件 |
| `this.cache.json` | JSON 数据 |
| `this.cache.obj` | OBJ 3D 模型 |
| `this.cache.physics` | 物理数据（Matter.js 形状等）|
| `this.cache.shader` | GLSL Shader 源码 |
| `this.cache.text` | 纯文本文件 |
| `this.cache.tilemap` | Tilemap 数据 |
| `this.cache.video` | 视频资源 |
| `this.cache.xml` | XML 数据 |

贴图（Texture）有独立的 `this.textures`（TextureManager）管理，不在 cache 中。

---

## BaseCache 操作（所有子缓存共用）

```javascript
// 检查是否存在
this.cache.json.has('configData')          // → boolean
this.cache.audio.has('bgm')
this.cache.text.has('dialogScript')

// 读取数据
const config = this.cache.json.get('configData')   // → 原始 JSON 对象
const text = this.cache.text.get('dialogScript')   // → 字符串
const tilemap = this.cache.tilemap.get('level1')   // → Tilemap 数据

// 手动添加（运行时注入数据）
this.cache.json.add('dynamicConfig', { level: 2, score: 999 });

// 删除（释放内存）
this.cache.json.remove('configData');
this.cache.audio.remove('bgm');

// 获取所有键
this.cache.json.getKeys()   // → string[]

// 销毁整个子缓存
this.cache.json.destroy();
```

---

## TextureManager（贴图缓存）

贴图通过 `this.textures` 而非 `this.cache` 管理：

```javascript
// 检查贴图是否已加载
this.textures.exists('player')   // → boolean
this.textures.exists('coin')

// 获取贴图对象
const texture = this.textures.get('player');
const frame = texture.get('walk_01');   // 获取指定帧

// 动态创建贴图
const canvas = this.textures.createCanvas('myCanvas', 128, 128);
canvas.context.fillStyle = '#ff0000';
canvas.context.fillRect(0, 0, 128, 128);
canvas.refresh();

// 释放贴图
this.textures.remove('player');

// 获取所有贴图键
this.textures.getTextureKeys()   // → string[]
```

---

## Cache 事件

```javascript
// 子缓存事件
this.cache.json.events.on('add',    (cache, key) => { });
this.cache.json.events.on('remove', (cache, key) => { });

// 贴图事件
this.textures.on('addtexture', (key) => { console.log('贴图已加载:', key); });
this.textures.on('removetexture', (key) => { });
this.textures.on('onerror', (key) => { console.error('贴图加载失败:', key); });
```

---

## 自定义缓存

```javascript
// 创建自定义命名缓存
const myCache = this.cache.addCustom('gameData');

// 使用
myCache.add('saves', { slot1: {...}, slot2: {...} });
const saves = myCache.get('saves');
myCache.has('saves');
myCache.remove('saves');
```

---

## 内存管理模式

```javascript
// 场景关闭时清理动态资源（防内存泄漏）
create() {
  this.events.once('shutdown', this.cleanup, this);
}

cleanup() {
  // 只移除本 Scene 动态加载的资源
  if (this.textures.exists('dynamicEnemy')) {
    this.textures.remove('dynamicEnemy');
  }
  if (this.cache.audio.has('levelBGM')) {
    this.cache.audio.remove('levelBGM');
  }
}
```

```javascript
// 按需加载（先检查缓存再加载）
loadEnemyAsset(type) {
  if (this.textures.exists(type)) {
    this.spawnEnemy(type);  // 已缓存，直接用
    return;
  }

  this.load.spritesheet(type, `assets/enemies/${type}.png`, {
    frameWidth: 48, frameHeight: 48
  });
  this.load.once('complete', () => this.spawnEnemy(type));
  this.load.start();
}
```

---

## 读取数据文件

```javascript
preload() {
  this.load.json('levels', 'assets/data/levels.json');
  this.load.text('dialog', 'assets/data/dialog.csv');
  this.load.xml('config', 'assets/data/config.xml');
}

create() {
  // 读取已缓存的数据
  const levels = this.cache.json.get('levels');
  const level1 = levels.find(l => l.id === 1);

  const csv = this.cache.text.get('dialog');
  const lines = csv.split('\n');

  const xml = this.cache.xml.get('config');
  const nodes = xml.getElementsByTagName('setting');
}
```
