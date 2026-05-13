# a11y 例外清单

记录每条豁免的 jsx-a11y / axe 规则、范围、原因、回填期。
`critical` 级别 axe 违规**不许豁免**;仅在 jsx-a11y 静态层 + axe non-critical 范围使用。

## 规则: jsx-a11y/click-events-have-key-events + jsx-a11y/no-static-element-interactions

| 位置 | 原因 | 回填条件 |
|---|---|---|
| `component/frontend/src/components/ProductCard.tsx:69-80` | `cpl-card-cart` 容器只是 `stopPropagation` 的代理,**自身不可交互**——内部 `<InputNumber>` 是真正的可交互元素并有原生键盘 / a11y 支持。容器加 `role="button"` 会让屏幕阅读器误读为可点击 | 改造为内部直接 stopPropagation(InputNumber 包一层 onPointerDown 兜底)即可去掉本豁免 |
