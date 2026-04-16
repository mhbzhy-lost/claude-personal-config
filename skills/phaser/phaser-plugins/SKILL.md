---
name: phaser-plugins
description: "Phaser 3.90 游戏开发：插件系统。 全局插件对所有 Scene 可用，适合跨场景共享功能（音频管理器、存档系统等）。"
tech_stack: [phaser]
---

# Phaser：插件系统

> 适用版本：Phaser 3.90.0

---

## 插件类型

| 类型 | 作用域 | 基类 |
|---|---|---|
| Global Plugin | 整个游戏生命周期，所有 Scene 共享 | `Phaser.Plugins.BasePlugin` |
| Scene Plugin | 每个 Scene 独立实例化 | `Phaser.Plugins.BasePlugin` |

---

## BasePlugin（插件基类）

```javascript
class MyPlugin extends Phaser.Plugins.BasePlugin {
  constructor(pluginManager) {
    super(pluginManager);
    // pluginManager: PluginManager 引用
    // this.game: Game 实例引用
  }

  // 生命周期（按顺序触发）
  init(data) { }   // 注册时调用，data 来自配置
  start() { }      // 插件激活时调用
  stop() { }       // 插件停用时调用
  destroy() { }    // 插件销毁时调用

  // 自定义方法
  myMethod(arg) {
    return `result: ${arg}`;
  }
}
```

---

## Global Plugin（全局插件）

全局插件对所有 Scene 可用，适合跨场景共享功能（音频管理器、存档系统等）。

### 注册（在游戏配置中）

```javascript
const config = {
  plugins: {
    global: [
      {
        key: 'MyPlugin',       // 引用键
        plugin: MyPlugin,      // 插件类
        start: true,           // 是否立即启动
        mapping: 'myPlugin'    // 在 this 上的属性名（可选）
      }
    ]
  }
};
```

### 访问

```javascript
// 方式一：通过 mapping（需在配置中设置 mapping）
this.myPlugin.myMethod('hello');

// 方式二：通过 PluginManager
const plugin = this.plugins.get('MyPlugin');
plugin.myMethod('hello');

// 方式三：在任意 Scene 中
this.game.plugins.get('MyPlugin');
```

---

## Scene Plugin（场景插件）

每个 Scene 有独立的插件实例，适合 Scene 级别的功能扩展。

```javascript
class MyScenePlugin extends Phaser.Plugins.BasePlugin {
  constructor(pluginManager) {
    super(pluginManager);
  }

  boot() {
    // Scene 系统已就绪时调用
    // 可以在这里监听 Scene 事件
    this.scene.events.on('create',   this.onSceneCreate,   this);
    this.scene.events.on('shutdown', this.onSceneShutdown, this);
  }

  onSceneCreate() { }
  onSceneShutdown() { }

  // 访问当前 Scene
  doSomething() {
    const sprite = this.scene.add.sprite(0, 0, 'key');
    return sprite;
  }
}
```

### 注册 Scene Plugin

```javascript
const config = {
  plugins: {
    scene: [
      {
        key: 'MyScenePlugin',
        plugin: MyScenePlugin,
        mapping: 'myPlugin',    // 在 scene 上的属性名
        start: true
      }
    ]
  }
};

// 在 Scene 中访问
this.myPlugin.doSomething();
```

---

## PluginManager（运行时管理）

```javascript
// 在 Scene 内通过 this.plugins 访问
const pm = this.plugins;

// 获取插件
const plugin = pm.get('MyPlugin');
const plugin = pm.get('MyPlugin', true);   // true = 如果未启动则先 start

// 检查
pm.isActive('MyPlugin')  // → boolean

// 手动启动/停止
pm.start('MyPlugin');
pm.stop('MyPlugin');

// 动态安装插件
pm.install('MyPlugin', MyPlugin, true, 'myPlugin', initData);

// 动态移除
pm.removeGlobalPlugin('MyPlugin');
pm.removeScenePlugin('MyPlugin');

// 注册文件类型（扩展 Loader）
pm.registerFileType('myFormat', loaderCallback);

// 注册游戏对象工厂（扩展 this.add.xxx）
pm.registerGameObject('myObject', factoryCallback, creatorCallback);
pm.removeGameObject('myObject');
```

---

## 动态加载插件

```javascript
// 在 preload 中加载外部插件文件
preload() {
  this.load.plugin('RexUI', 'https://cdn.example.com/rexui.js', true);
  this.load.scenePlugin('RexScene', 'https://cdn.example.com/rexscene.js', 'rexScene', 'rexScene');
}

create() {
  // 动态加载完成后通过 PluginCache 访问
  const plugin = this.plugins.get('RexUI');
}
```

---

## PluginCache（静态缓存）

用于检查插件是否已注册（内部使用，插件开发时用到）：

```javascript
// 检查是否已注册
Phaser.Plugins.PluginCache.hasCore('MyPlugin')
Phaser.Plugins.PluginCache.hasCustom('MyPlugin')

// 注册到缓存
Phaser.Plugins.PluginCache.register('MyPlugin', MyPlugin, 'myPlugin')
Phaser.Plugins.PluginCache.registerCustom('MyPlugin', MyPlugin, 'myPlugin', data)

// 获取
Phaser.Plugins.PluginCache.getCore('MyPlugin')
Phaser.Plugins.PluginCache.getCustom('MyPlugin')
Phaser.Plugins.PluginCache.getCustomClass('MyPlugin')

// 移除
Phaser.Plugins.PluginCache.remove('MyPlugin')
Phaser.Plugins.PluginCache.removeCustom('MyPlugin')
```

---

## 实际用例

### 存档管理插件

```javascript
class SavePlugin extends Phaser.Plugins.BasePlugin {
  save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  load(key) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  has(key) {
    return localStorage.getItem(key) !== null;
  }

  delete(key) {
    localStorage.removeItem(key);
  }
}

// 配置
plugins: {
  global: [{ key: 'SavePlugin', plugin: SavePlugin, start: true, mapping: 'save' }]
}

// 在任意 Scene 使用
this.save.save('playerData', { score: 9999, level: 5 });
const data = this.save.load('playerData');
```

### 扩展 GameObject（注册自定义对象）

```javascript
// 定义自定义对象
class HealthBar extends Phaser.GameObjects.Container {
  constructor(scene, x, y, maxHP) {
    super(scene, x, y);
    // ...构建血条 UI
  }
}

// 注册工厂函数
Phaser.GameObjects.GameObjectFactory.register('healthBar', function(x, y, maxHP) {
  return this.displayList.add(new HealthBar(this.scene, x, y, maxHP));
});

// 在 Scene 中像内置对象一样使用
const bar = this.add.healthBar(100, 50, 100);
```
