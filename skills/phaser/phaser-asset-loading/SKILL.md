---
name: phaser-asset-loading
description: "Phaser 3.90 游戏开发：资源加载系统。 Phaser Loader 是基于队列的异步加载系统："
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser：资源加载系统

> 适用版本：Phaser 3.90.0

---

## 加载机制

Phaser Loader 是基于队列的异步加载系统：
1. `preload()` 中添加加载请求（此时只是排队，未实际加载）
2. Loader 自动并发加载队列中的所有资源
3. 全部完成后才进入 `create()`
4. 加载期间自动显示默认加载界面

**只能在 `preload()` 或 `load.once('complete', ...)` 回调中使用加载的资源。**

---

## 各类资源加载

```javascript
preload() {
  // 图片
  this.load.image('sky', 'assets/sky.png');
  this.load.image('logo', ['assets/logo.png', 'assets/logo-normal.png']);  // 法线贴图

  // Sprite Sheet（等宽等高的帧图）
  this.load.spritesheet('player', 'assets/player.png', {
    frameWidth: 32,
    frameHeight: 48,
    startFrame: 0,   // 可选，从哪帧开始
    endFrame: -1     // 可选，-1 = 全部
  });

  // Texture Atlas（不等大的帧，效率更高）
  this.load.atlas('items', 'assets/items.png', 'assets/items.json');
  this.load.multiatlas('atlas', 'assets/atlas.json', 'assets/');  // 多图 atlas

  // 音频
  this.load.audio('bgm', ['assets/bgm.mp3', 'assets/bgm.ogg']);
  this.load.audioSprite('sfx', 'assets/sfx.json', 'assets/sfx.mp3');

  // Tilemap
  this.load.tilemapTiledJSON('map', 'assets/level1.json');
  this.load.tilemapCSV('map', 'assets/level1.csv');

  // 数据文件
  this.load.json('config', 'assets/config.json');
  this.load.xml('data', 'assets/data.xml');
  this.load.csv('scores', 'assets/scores.csv');
  this.load.text('lyrics', 'assets/lyrics.txt');
  this.load.binary('binary', 'assets/data.bin');

  // Web 字体
  this.load.webfont('Orbitron', 'https://fonts.googleapis.com/css?family=Orbitron');

  // 插件
  this.load.plugin('myPlugin', 'assets/plugins/myPlugin.js', true);
  this.load.scenePlugin('myScenePlugin', 'assets/plugins/myScenePlugin.js', 'myPlugin', 'myPlugin');
}
```

---

## 加载进度条

```javascript
preload() {
  // 创建进度条（在 preload 开始时立即可用）
  const width = this.cameras.main.width;
  const height = this.cameras.main.height;

  const progressBar = this.add.graphics();
  const progressBox = this.add.graphics();

  progressBox.fillStyle(0x222222, 0.8);
  progressBox.fillRect(width/2 - 160, height/2 - 25, 320, 50);

  const loadingText = this.add.text(width/2, height/2 - 50, 'Loading...', {
    fontSize: '20px', color: '#ffffff'
  }).setOrigin(0.5);

  const percentText = this.add.text(width/2, height/2, '0%', {
    fontSize: '18px', color: '#ffffff'
  }).setOrigin(0.5);

  // 进度事件
  this.load.on('progress', (value) => {
    progressBar.clear();
    progressBar.fillStyle(0xffffff, 1);
    progressBar.fillRect(width/2 - 150, height/2 - 15, 300 * value, 30);
    percentText.setText(Math.floor(value * 100) + '%');
  });

  this.load.on('complete', () => {
    progressBar.destroy();
    progressBox.destroy();
    loadingText.destroy();
    percentText.destroy();
  });

  // 之后正常添加加载请求
  this.load.image('sky', 'assets/sky.png');
  // ...
}
```

---

## 加载事件

```javascript
this.load.on('progress',   (value) => { /* 0~1 */ });
this.load.on('fileprogress', (file, value) => { /* 单文件进度 */ });
this.load.on('filecomplete', (key, type, data) => { /* 单文件完成 */ });
this.load.on('filecomplete-image-sky', () => { /* 特定文件完成 */ });
this.load.on('loaderror',  (file) => { console.error('加载失败:', file.key); });
this.load.on('complete',   () => { /* 全部完成 */ });
```

---

## 动态加载（运行时按需加载）

```javascript
// 在 create() 或 update() 中动态加载
loadNextLevel(levelKey) {
  // 先检查是否已加载
  if (this.textures.exists(levelKey)) {
    this.startLevel(levelKey);
    return;
  }

  this.load.tilemapTiledJSON(levelKey, `assets/levels/${levelKey}.json`);
  this.load.once('complete', () => {
    this.startLevel(levelKey);
  });
  this.load.start();  // 手动触发加载（非 preload 阶段需要显式调用）
}
```

---

## 资源缓存管理

```javascript
// 检查是否已缓存
this.textures.exists('player')
this.cache.audio.has('bgm')
this.cache.json.has('config')
this.cache.tilemap.has('map')

// 读取缓存数据
const config = this.cache.json.get('config');
const csvData = this.cache.text.get('scores');

// 移除缓存（释放内存）
this.textures.remove('player');
this.cache.audio.remove('bgm');

// Scene 销毁时清理（防内存泄漏）
this.events.on('shutdown', () => {
  this.textures.remove('dynamicTexture');
});
```

---

## 加载路径设置

```javascript
// 设置基础路径（所有加载请求自动拼接）
this.load.setBaseURL('https://cdn.example.com/');
this.load.setPath('assets/game/');  // 相对于 baseURL

// 之后的加载自动拼接路径
this.load.image('sky', 'sky.png');  // → https://cdn.example.com/assets/game/sky.png
```

---

## 常见错误

| 问题 | 原因 | 解决方案 |
|---|---|---|
| `create()` 中资源未定义 | 在 preload 外加载 | 只在 `preload()` 中调用 `this.load.*` |
| 动态加载不生效 | 忘记调用 `this.load.start()` | 非 preload 阶段必须手动 `start()` |
| 图片显示异常 | spritesheet 的 frameWidth/Height 设置错误 | 核查图片实际帧尺寸 |
| 加载 404 错误 | 路径错误或大小写不匹配 | 监听 `loaderror` 事件排查 |
