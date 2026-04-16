---
name: phaser-dom
description: "Phaser 3.90 游戏开发：DOM 工具与 DOMElement。 DOMElement 允许在游戏 Canvas 上叠加真实 HTML 元素，适合游戏内表单、富文本 UI 等。"
tech_stack: [phaser, frontend]
language: [javascript, typescript]
---

# Phaser：DOM 工具与 DOMElement

> 适用版本：Phaser 3.90.0

---

## Phaser.DOM 静态工具函数

```javascript
// 将元素添加到 DOM（parent 可以是选择器字符串或 HTMLElement）
Phaser.DOM.AddToDOM(element, parent)   // → HTMLElement

// DOMContentLoaded 等待（Phaser 内部用于启动）
Phaser.DOM.DOMContentLoaded(callback)

// 获取可视区域内高度（处理 iOS 地址栏问题）
Phaser.DOM.GetInnerHeight(iOS)   // → number

// 获取屏幕方向
Phaser.DOM.GetScreenOrientation(width, height)  // → 'landscape' | 'portrait'

// 查找 DOM 元素（选择器字符串或 HTMLElement）
Phaser.DOM.GetTarget(element)    // → HTMLElement

// 解析 XML 字符串
Phaser.DOM.ParseXML(data)        // → DOMParser | null

// 从 DOM 中移除元素
Phaser.DOM.RemoveFromDOM(element)

// requestAnimationFrame 封装
const raf = new Phaser.DOM.RequestAnimationFrame();
raf.start(callback, forceSetTimeOut, delay);
raf.stop();
raf.destroy();
raf.isRunning  // boolean
```

---

## DOMElement（将 HTML 嵌入游戏）

`DOMElement` 允许在游戏 Canvas 上叠加真实 HTML 元素，适合游戏内表单、富文本 UI 等。

**注意：DOMElement 必须在游戏配置中开启 `dom.createContainer: true`。**

```javascript
const config = {
  dom: {
    createContainer: true   // 必须启用
  }
};
```

### 创建方式

```javascript
// 方式一：传入 HTML 字符串
const el = this.add.dom(x, y, 'div', 'color: red; font-size: 24px', 'Hello World');

// 方式二：传入现有 HTMLElement
const myDiv = document.createElement('div');
myDiv.innerHTML = '<button>Click Me</button>';
const el = this.add.dom(x, y, myDiv);

// 方式三：从 Loader 加载 HTML 模板
preload() {
  this.load.html('loginForm', 'assets/ui/login.html');
}
create() {
  const el = this.add.dom(400, 300).createFromCache('loginForm');
}
```

### DOMElement 操作

```javascript
// 定位（跟随游戏坐标系，含摄像机变换）
el.setPosition(x, y)
el.setOrigin(0.5)       // 对齐原点

// 显示
el.setVisible(visible)
el.setAlpha(alpha)
el.setDepth(depth)

// 访问原生 DOM
el.node              // HTMLElement 原始对象
el.node.style.color = 'blue';

// 查询子元素
el.getChildByID('username')        // → HTMLElement | null
el.getChildByName('password')
el.getElementById('btn-submit')

// 监听 DOM 事件
el.addListener('click')            // 开始监听 'click' 事件
el.on('click', (event) => {
  console.log('按钮被点击', event.target);
});
el.removeListener('click')         // 停止监听

// 设置 HTML 内容
el.setHTML('<strong>Updated!</strong>')
el.setText('Pure text')

// 聚焦/失焦
el.node.focus()
el.node.blur()

// 销毁
el.destroy()          // 同时移除 DOM 元素
```

### 与游戏交互

```javascript
create() {
  const form = this.add.dom(400, 300).createFromCache('loginForm');

  form.addListener('click');
  form.on('click', (event) => {
    if (event.target.name === 'btnSubmit') {
      const username = form.getChildByName('username').value;
      const password = form.getChildByName('password').value;
      this.submitLogin(username, password);
    }
  });
}
```

### 随摄像机滚动

```javascript
// 默认 DOMElement 会跟随摄像机
// 如果需要固定在屏幕（UI 层），设置 scrollFactor
el.setScrollFactor(0);  // 固定，不随相机移动（类似 UI）
el.setScrollFactor(1);  // 跟随相机（默认）
```

---

## DOMElement 注意事项

1. **与 Canvas 层叠**：DOMElement 通过 CSS `position: absolute` 叠加在 Canvas 上，不参与 WebGL 渲染
2. **移动端输入法**：表单输入框在移动端会触发软键盘，可能影响布局
3. **FX 特效不适用**：DOMElement 无法使用 `preFX`/`postFX`
4. **性能开销**：大量 DOMElement 会影响布局性能，UI 重度场景建议改用 Phaser 原生 Text/Graphics
5. **遮罩不支持**：DOMElement 不支持 Phaser 的 Mask 系统
6. **触摸事件穿透**：默认情况下 DOMElement 会拦截触摸事件，需注意与游戏输入的冲突

---

## 适用场景

| 场景 | 推荐方案 |
|---|---|
| 简单文字 / 得分显示 | `this.add.text`（Phaser 原生）|
| 富文本 / 复杂样式 | DOMElement |
| 游戏内登录/注册表单 | DOMElement |
| 设置面板 | DOMElement 或 Phaser UI |
| 聊天框、可滚动列表 | DOMElement |
| 纯游戏 HUD | Phaser 原生 Text + Graphics |
