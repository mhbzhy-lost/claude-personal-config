---
name: phaser-structs
description: "Phaser 3.90 游戏开发：数据结构（Structs）。 Phaser.Structs 提供游戏开发中常用的内部数据结构，通常不需要直接使用，但理解它们有助于扩展 Phaser 或编写插件。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
capability: [game-rendering]
---

# Phaser：数据结构（Structs）

> 适用版本：Phaser 3.90.0

---

## 概览

`Phaser.Structs` 提供游戏开发中常用的内部数据结构，通常不需要直接使用，但理解它们有助于扩展 Phaser 或编写插件。

| 类 | 用途 |
|---|---|
| `List` | 有序集合，含 add/remove 回调 |
| `Map` | 键值对映射 |
| `Set` | 唯一值集合 |
| `Size` | 尺寸管理（含宽高比约束）|
| `ProcessQueue` | 带生命周期的队列（active/pending/destroying）|
| `RTree` | 2D 空间索引（用于大量对象的快速查询）|

---

## List（有序列表）

Phaser 内部 DisplayList、Group 等均基于 List。

```javascript
const list = new Phaser.Structs.List(parent);

// 增删
list.add(child)
list.add(child, true)         // true = 跳过 addCallback
list.addAt(child, index)
list.remove(child)
list.remove(child, true)      // true = 跳过 removeCallback
list.removeAt(index)
list.removeAll()
list.removeBetween(start, end)
list.replace(oldChild, newChild)

// 查询
list.getAt(index)
list.getIndex(child)           // → number（-1=不存在）
list.getByName(name)           // 查找 name 属性匹配的元素
list.getFirst(property, value, startIndex, endIndex)
list.getAll(property, value)   // 获取所有匹配元素
list.getRandom(startIndex, length)
list.exists(child)             // → boolean
list.count(property, value)    // 计数匹配元素

// 排序/重排
list.bringToTop(child)
list.sendToBack(child)
list.moveUp(child)
list.moveDown(child)
list.moveTo(child, index)
list.moveAbove(child1, child2)
list.moveBelow(child1, child2)
list.swap(child1, child2)
list.sort(property, handler)
list.reverse()
list.shuffle()

// 批量操作
list.setAll(property, value, startIndex, endIndex)
list.each(callback, context, ...args)

// 属性
list.list        // 内部数组
list.length
list.first       // 第一个元素
list.last        // 最后一个元素
list.next        // 当前迭代位置的下一个
list.previous

// 回调钩子
list.addCallback = (item) => { }    // 添加时触发
list.removeCallback = (item) => { } // 移除时触发

list.destroy()
```

---

## Map（键值映射）

```javascript
const map = new Phaser.Structs.Map([['key1', val1], ['key2', val2]]);

map.set(key, value)
map.get(key)         // → value | undefined
map.has(key)         // → boolean
map.delete(key)      // → boolean
map.contains(value)  // → boolean（检查 value 是否存在）
map.clear()

map.keys()           // → string[]
map.values()         // → any[]
map.getArray()       // → any[]（values 数组）

map.each(callback)   // callback(key, value) => boolean|void（返回 false 停止）
map.merge(otherMap, override)  // 合并另一个 Map
map.setAll(elements)           // 批量设置 {key: value} 对象
map.dump()                     // console.log 所有键值

map.size             // 键数量
```

---

## Set（唯一值集合）

```javascript
const set = new Phaser.Structs.Set([val1, val2]);

set.set(value)        // 添加（已存在则跳过）
set.get(property, value)  // 查找属性匹配的元素
set.delete(value)
set.contains(value)   // → boolean
set.clear()

set.getArray()        // → any[]
set.size              // 元素数量

// 集合运算
set.union(otherSet)       // → 新 Set（并集）
set.intersect(otherSet)   // → 新 Set（交集）
set.difference(otherSet)  // → 新 Set（差集）

set.each(callback, scope)      // callback(item) => boolean|void
set.iterate(callback, scope)   // 同 each，不同签名
set.iterateLocal(callbackKey, ...args) // 调用每个元素的方法
set.dump()
```

---

## Size（尺寸管理）

常用于 ScaleManager，也可用于自定义 UI 布局：

```javascript
const size = new Phaser.Structs.Size(width, height);

// 尺寸模式常量
Phaser.Structs.Size.NONE                  // 0 - 自由设置
Phaser.Structs.Size.WIDTH_CONTROLS_HEIGHT // 1 - 宽固定，高按比例
Phaser.Structs.Size.HEIGHT_CONTROLS_WIDTH // 2 - 高固定，宽按比例
Phaser.Structs.Size.FIT                   // 3 - 适应（含黑边）
Phaser.Structs.Size.ENVELOP               // 4 - 填满（可能裁切）

// 设置
size.setSize(w, h)
size.setWidth(w)
size.setHeight(h)
size.setAspectMode(Phaser.Structs.Size.FIT)
size.setAspectRatio(16/9)

// 约束
size.setMin(minW, minH)
size.setMax(maxW, maxH)
size.setSnap(snapW, snapH)   // 对齐到指定步长

// 调整
size.resize(w, h)            // 根据当前模式调整
size.fitTo(w, h)             // 等比缩小到适应
size.envelop(w, h)           // 等比放大到填满
size.constrain(w, h, fit)    // fit=true=适应, false=填满

// 属性
size.width; size.height
size.aspectRatio
size.minWidth; size.minHeight; size.maxWidth; size.maxHeight

size.setParent(parentSize)
size.copy(targetSize)
size.setCSS(htmlElement)     // 直接设置 DOM 元素的 CSS 宽高
size.toString()
```

---

## ProcessQueue（生命周期队列）

用于管理有 pending/active/destroying 状态的对象，Phaser 内部的 UpdateList 基于此：

```javascript
const queue = new Phaser.Structs.ProcessQueue();

queue.add(item)         // 添加到 pending 队列（下帧变 active）
queue.remove(item)      // 标记为 destroying（下帧移除）
queue.removeAll()

// 状态查询
queue.isActive(item)
queue.isPending(item)
queue.isDestroying(item)
queue.getActive()       // → active 数组
queue.length            // active 数量

// 每帧调用
queue.update()          // 将 pending 转 active，将 destroying 移除

queue.destroy()
```

---

## 典型使用场景

大多数情况下不需要直接使用 Structs，以下是少数需要的场景：

```javascript
// 1. 自定义插件需要有序集合
class MyPlugin extends Phaser.Plugins.ScenePlugin {
  boot() {
    this.handlers = new Phaser.Structs.List(this);
    this.handlers.addCallback = (h) => h.init();
    this.handlers.removeCallback = (h) => h.destroy();
  }
}

// 2. 大量对象的高性能唯一性检查
const visited = new Phaser.Structs.Set();
function visitTile(tile) {
  if (visited.contains(tile)) return;
  visited.set(tile);
  processNeighbors(tile);
}

// 3. 布局约束（自定义 HUD）
const hudSize = new Phaser.Structs.Size(400, 300);
hudSize.setAspectMode(Phaser.Structs.Size.FIT);
hudSize.setMax(600, 450);
hudSize.resize(this.scale.width * 0.5, this.scale.height * 0.5);
panel.setDisplaySize(hudSize.width, hudSize.height);
```
