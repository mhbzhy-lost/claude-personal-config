---
name: phaser-tilemaps
description: "Phaser 3.90 游戏开发：Tilemap 地图系统。 在 Tiled 中用 Object Layer 放置敌人/道具生成点，在 Phaser 中读取："
tech_stack: [phaser]
language: [javascript, typescript]
---

# Phaser：Tilemap 地图系统

> 适用版本：Phaser 3.90.0

---

## 概念

| 概念 | 说明 |
|---|---|
| Tilemap | 地图容器，管理所有图层和 Tileset |
| Tileset | 图块集合（一张图，切成多个 tile） |
| TilemapLayer | 渲染图层（地面、装饰、前景等） |

---

## 从 Tiled 编辑器加载

### 1. Tiled 导出设置

- 格式：JSON（不要用 TMX）
- Tile layer format：CSV 或 Base64（**不要勾选压缩**）
- 勾选 "Embed tilesets in map"

### 2. 加载资源

```javascript
preload() {
  this.load.tilemapTiledJSON('map', 'assets/levels/level1.json');
  this.load.image('tiles-world', 'assets/tilesets/world.png');
  this.load.image('tiles-deco',  'assets/tilesets/decorations.png');
}
```

### 3. 创建地图

```javascript
create() {
  // 创建 Tilemap 对象
  const map = this.make.tilemap({ key: 'map' });

  // 添加 Tileset（参数1 = Tiled 中的 tileset 名称, 参数2 = 加载时的 key）
  const worldTiles = map.addTilesetImage('World', 'tiles-world');
  const decoTiles  = map.addTilesetImage('Decorations', 'tiles-deco');

  // 创建图层（参数1 = Tiled 中的 layer 名称）
  const bgLayer     = map.createLayer('Background', worldTiles);
  const groundLayer = map.createLayer('Ground', worldTiles);
  const decoLayer   = map.createLayer('Decorations', decoTiles);
  const fgLayer     = map.createLayer('Foreground', worldTiles);

  // 深度排序
  bgLayer.setDepth(0);
  groundLayer.setDepth(1);
  // player 放在 depth 2
  fgLayer.setDepth(3);
}
```

---

## 碰撞配置

```javascript
// 方式一：按属性（推荐，在 Tiled 中给 tile 设置 collides=true 属性）
groundLayer.setCollisionByProperty({ collides: true });

// 方式二：按排除（所有非 -1 的 tile 都碰撞）
groundLayer.setCollisionByExclusion([-1]);

// 方式三：指定 tile 索引范围
groundLayer.setCollision([1, 2, 3, 4]);
groundLayer.setCollisionBetween(1, 10);

// 为玩家添加与图层的碰撞
this.physics.add.collider(player, groundLayer);

// 启用物理世界尺寸匹配地图
this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
```

---

## 获取/修改 Tile

```javascript
// 世界坐标取 tile
const tile = groundLayer.getTileAtWorldXY(pointer.worldX, pointer.worldY);
if (tile) {
  console.log(tile.index, tile.properties);
}

// 格坐标取 tile
const tile = groundLayer.getTileAt(tileX, tileY);

// 修改 tile
groundLayer.putTileAt(newTileIndex, tileX, tileY);
groundLayer.removeTileAt(tileX, tileY);       // 移除（设为 -1）
groundLayer.fill(tileIndex, x, y, w, h);       // 批量填充

// 世界坐标转格坐标
const tileXY = groundLayer.worldToTileXY(worldX, worldY);
const worldXY = groundLayer.tileToWorldXY(tileX, tileY);
```

---

## Tiled 对象图层（放置游戏对象）

在 Tiled 中用 Object Layer 放置敌人/道具生成点，在 Phaser 中读取：

```javascript
// 读取对象图层
const spawnLayer = map.getObjectLayer('Spawns');

spawnLayer.objects.forEach(obj => {
  if (obj.type === 'player') {
    this.player = this.physics.add.sprite(obj.x, obj.y, 'player');
  } else if (obj.type === 'enemy') {
    const enemy = this.enemies.create(obj.x, obj.y, 'enemy');
    // 读取自定义属性
    const speed = obj.properties?.find(p => p.name === 'speed')?.value ?? 100;
    enemy.setData('speed', speed);
  } else if (obj.type === 'coin') {
    this.coins.create(obj.x, obj.y, 'coin');
  }
});
```

---

## 图层深度分层（标准结构）

```javascript
// 专业游戏常见分层方式
const belowLayer  = map.createLayer('BelowPlayer', tileset);  // 地面背景
const worldLayer  = map.createLayer('World', tileset);         // 主碰撞图层
const aboveLayer  = map.createLayer('AbovePlayer', tileset);  // 前景遮挡

belowLayer.setDepth(0);
worldLayer.setDepth(1);
// player.setDepth(2);
aboveLayer.setDepth(3);  // 玩家走在"下面"的植物/建筑

// 只为 worldLayer 设置碰撞
worldLayer.setCollisionByProperty({ collides: true });
this.physics.add.collider(player, worldLayer);
```

---

## 从代码创建地图（不依赖 Tiled）

```javascript
// 用二维数组定义地图（0=空, 正数=tile索引）
const mapData = [
  [  0,  0,  0,  0,  0 ],
  [  0,  0,  0,  0,  0 ],
  [  1,  2,  2,  2,  1 ],
  [  1,  1,  1,  1,  1 ]
];

const map = this.make.tilemap({
  data: mapData,
  tileWidth: 32,
  tileHeight: 32
});

const tileset = map.addTilesetImage('tiles-world');
const layer = map.createLayer(0, tileset, 0, 0);
layer.setCollision([1, 2]);  // 指定哪些索引有碰撞
```

---

## 常见问题

| 问题 | 原因 | 解决方案 |
|---|---|---|
| 碰撞不生效 | Tiled 没设置 tile 属性或索引错误 | 开启 `arcade.debug: true` 查看碰撞体 |
| 地图偏移 | Tileset 图片与 Tiled 中的大小不匹配 | 检查 tileWidth/tileHeight 设置 |
| 地图显示错误 | JSON 导出时勾选了压缩 | 重新导出，取消压缩选项 |
| addTilesetImage 返回 null | Tileset 名称与 Tiled 中不匹配 | 核查 Tiled 的 tileset 名称（大小写敏感）|
