---
name: phaser-data
description: "Phaser 3.90 游戏开发：Data Manager（数据管理）。 Phaser 提供两种 DataManager 用途："
tech_stack: [phaser]
---

# Phaser：Data Manager（数据管理）

> 适用版本：Phaser 3.90.0

---

## 概览

Phaser 提供两种 DataManager 用途：

| 访问方式 | 作用域 | 典型用途 |
|---|---|---|
| `this.data` | 当前 Scene | Scene 内部状态 |
| `this.registry` | 全局（跨 Scene）| 分数、玩家数据等共享状态 |
| `gameObject.data` | 单个游戏对象 | 对象自定义属性 |

---

## 基本操作

```javascript
// 设置值
this.data.set('score', 0);
this.data.set('player', { health: 100, level: 1 });

// 同时设置多个
this.data.set({ score: 0, level: 1, lives: 3 });

// 读取值
const score = this.data.get('score');
const all = this.data.getAll();   // → 所有键值对的对象

// 检查是否存在
this.data.has('score')  // → boolean

// 自增（数值类型）
this.data.inc('score', 10);   // score += 10
this.data.inc('score', -5);   // score -= 5

// 切换布尔值
this.data.toggle('isPaused');  // true ↔ false

// 弹出（读取后删除）
const val = this.data.pop('tempValue');

// 删除
this.data.remove('key');

// 查询（正则匹配键名）
const results = this.data.query(/^enemy_/);

// 冻结（禁止修改）
this.data.setFreeze(true);
this.data.freeze  // boolean

// 重置所有数据
this.data.reset();

// 遍历
this.data.each((parent, key, value) => {
  console.log(key, value);
});

// 总数量
this.data.count
```

---

## 数据事件

```javascript
// 任意键变化时触发
this.data.events.on('changedata', (parent, key, value, previousValue) => {
  console.log(`${key}: ${previousValue} → ${value}`);
});

// 特定键变化时触发（格式：changedata-[key]）
this.data.events.on('changedata-score', (parent, value, previousValue) => {
  this.scoreText.setText(`SCORE: ${value}`);
});

// 新键设置时触发
this.data.events.on('setdata', (parent, key, value) => { });

// 键删除时触发
this.data.events.on('removedata', (parent, key, value) => { });

// DataManager 销毁
this.data.events.on('destroy', () => { });
```

---

## 全局注册表（Registry）

`this.registry` 是 `DataManager` 的全局实例，跨所有 Scene 共享：

```javascript
// 写入
this.registry.set('highScore', 99999);
this.registry.set('playerName', 'Hero');

// 读取（在任何 Scene 中均可访问）
const highScore = this.registry.get('highScore');

// 监听变化（跨 Scene 响应）
this.registry.events.on('changedata-highScore', (parent, value) => {
  this.updateLeaderboard(value);
});
```

---

## 游戏对象数据

任意 GameObject 都可以挂载自定义数据：

```javascript
// 创建时通过 setData
const enemy = this.physics.add.sprite(x, y, 'enemy');
enemy.setData('health', 100);
enemy.setData('speed', 150);
enemy.setData('type', 'goblin');

// 批量设置
enemy.setDataEnabled();  // 确保 data 已初始化
enemy.setData({ health: 100, speed: 150, type: 'goblin' });

// 读取
const hp = enemy.getData('health');

// 监听对象数据变化
enemy.data.events.on('changedata-health', (parent, value) => {
  if (value <= 0) enemy.die();
});

// 自增
enemy.data.inc('health', -10);  // 扣血

// 常见模式：存储对象引用
bullet.setData('owner', player);
bullet.setData('damage', 25);
```

---

## DataManagerPlugin（Scene 插件版）

`this.data` 实际上是 `DataManagerPlugin`，额外有 Scene 绑定：

```javascript
// DataManagerPlugin 继承 DataManager 所有方法
// 额外属性
this.data.scene    // 所属 Scene
this.data.systems  // Scene Systems 引用

// 销毁时自动清理（随 Scene 销毁）
```

---

## 常用设计模式

### 游戏状态管理

```javascript
// GameScene 中写入全局数据
this.registry.set('score', 0);
this.registry.set('level', 1);
this.registry.set('lives', 3);

// UIScene 中响应变化
this.registry.events.on('changedata-score', (parent, value) => {
  this.scoreText.setText(value);
});
this.registry.events.on('changedata-lives', (parent, value) => {
  this.updateLifeIcons(value);
});
```

### 游戏存档

```javascript
// 保存
saveGame() {
  const saveData = this.registry.getAll();
  localStorage.setItem('save', JSON.stringify(saveData));
}

// 读取
loadGame() {
  const saveData = JSON.parse(localStorage.getItem('save') ?? '{}');
  this.registry.merge(saveData, true);  // true = 覆盖已有值
}
```

### 组件式属性管理

```javascript
class Enemy extends Phaser.Physics.Arcade.Sprite {
  init(config) {
    this.setDataEnabled();
    this.data.set({
      maxHealth: config.health,
      health: config.health,
      attack: config.attack,
      reward: config.reward
    });

    this.data.events.on('changedata-health', (_, hp) => {
      if (hp <= 0) this.onDeath();
    });
  }

  takeDamage(amount) {
    this.data.inc('health', -amount);
  }

  onDeath() {
    this.registry.inc('score', this.getData('reward'));
    this.destroy();
  }
}
```
