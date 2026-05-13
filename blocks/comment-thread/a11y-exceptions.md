# a11y 例外清单

记录每条豁免的 jsx-a11y / axe 规则、范围、原因、回填期。
`critical` 级别 axe 违规**不许豁免**;仅在 jsx-a11y 静态层 + axe non-critical 范围使用。

## 规则: jsx-a11y/no-autofocus

| 位置 | 原因 | 回填条件 |
|---|---|---|
| `component/frontend/src/components/CommentComposer.tsx:35` | autoFocus 只在调用方显式传 `autoFocus` 时生效;props 决定权在 host,默认 off。host 若关闭传入则不触发 | 若 antd Input.TextArea 后续提供原生的"延迟 focus + 屏幕阅读器友好"开关,删除本豁免 |
| `component/frontend/src/components/CommentNode.tsx:73` | 回复框打开时光标进入是普遍 UX 期望;DOM 已存在屏幕阅读器可定位的 form 边界,不会突袭聚焦无关元素 | 同上 |
