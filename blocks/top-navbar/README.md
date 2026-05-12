# top-navbar

顶部导航条（Top NavBar）—— **UI chrome block**（前端 only，无后端，
无协议层）。

> 🚧 本 README 是脚手架生成的占位骨架。**消费者向**应当替换以下 TODO 段。
> 参考已就位 UI block 的 README 风格（如 `blocks/top-navbar/`）。

## 这个 block 解决的问题

TODO：一段话说清 UI 场景（如"移动端底部 tabbar 多 tab 切换"）+ 典型用例。

UI chrome block 的特点：
- 仅前端，**不带后端 / 协议**
- 通常是布局 / 导航 / chrome 类组件，非业务模式
- 业务方在自己的应用框架内组合使用

## 何时**不**用这个 block（反向选型）

TODO：列出邻近 UI 模式应当用什么替代。

## 安装

```bash
pnpm add file:../path/to/blocks/top-navbar/frontend
```

## 最小用法

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
// TODO: import the block's main component
// import { <MainComponent> } from '@ui/top-navbar';

// TODO: 5-10 line minimal usage example
```

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

## 这个 block 包含什么

```
top-navbar/
└── frontend/   React lib（TODO 主组件）
```

参考已就位的 UI block：
- `blocks/top-navbar/`（顶部导航条）
- `blocks/mobile-tabbar/`（底部 tabbar）
