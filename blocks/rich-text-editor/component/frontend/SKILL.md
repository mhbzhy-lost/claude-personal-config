---
name: rich-text-editor-frontend
description: 富文本编辑(粗体/标题/列表/引用/代码块/图片)必须用 `RichTextEditor`(锁定 Tiptap),禁止自行 contentEditable / Slate / Quill 拼装。
---

# `@rte/rich-text-editor`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `RichTextEditor`:

- 需要 WYSIWYG 富文本(粗体 / 标题 / 列表 / 引用 / 代码块)
- 内容需要支持图片插入 + host 实现上传
- 输出 HTML 或 JSON 给后端持久化
- 跨项目想锁定同一编辑器(避免每个项目选型不同)

## 何时**不**使用

- 纯文本(评论 / 简介)→ antd `Input.TextArea`
- Markdown 双栏 → markdown 专门方案
- 代码 IDE → Monaco / CodeMirror
- 实时协作 → 本块未集成 Yjs(v0.2 留)

## 安装

```bash
pnpm add file:./sdk/ui-chrome/rich-text-editor/frontend
```

依赖(本块 component/package.json 已声明 Tiptap 5 个包):
`@tiptap/react @tiptap/starter-kit @tiptap/extension-{link,image,placeholder}`

host 直接 pnpm install 即可自动拉取。

## 最小用法

```tsx
import { RichTextEditor } from '@rte/rich-text-editor';
import '@rte/rich-text-editor/styles.css';

<RichTextEditor
  value={html}
  onChange={setHtml}
  placeholder="开始书写…"
  onImageUpload={(file) => uploadImage(file)}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `value` | `string` | — | 受控:HTML 或 JSON 字符串 |
| `onChange` | `(out) => void` | — | 内容变化(format 由 `output` 决定) |
| `output` | `'html' \| 'json'` | `'html'` | 输出格式 |
| `toolbar` | `ToolbarItem[]` | 推荐预设(18 项 + 5 分隔) | 工具栏顺序与组成 |
| `onImageUpload` | `(File) => Promise<url>` | — | 启用图片按钮 |
| `placeholder` | `string` | `'开始输入…'` | 空文档占位文字 |
| `disabled` | `boolean` | `false` | 整体只读 |
| `ariaLabel` | `string` | `'富文本编辑器'` | |
| `className` | `string` | — | |
| `minHeight` | `number` | `240` | px |
| `maxHeight` | `number` | — | px,超出滚动 |

`ToolbarItem`:`BuiltinTool | '|' | CustomTool`
`BuiltinTool`:`'bold' / 'italic' / 'strike' / 'code' / 'heading-1' / 'heading-2' / 'heading-3' / 'bullet-list' / 'ordered-list' / 'blockquote' / 'code-block' / 'hr' / 'link' / 'image' / 'undo' / 'redo'`
`CustomTool`:`{ key, onClick(editor), render(active) }`

## 内部已经处理好的事项

- ✅ Tiptap useEditor 装载:starter-kit + Link + Image + Placeholder
- ✅ `value` 受控同步:外部 value 改变时 setContent
- ✅ HTML / JSON 双输出(useEditor.onUpdate 中切换)
- ✅ disabled 切换:setEditable
- ✅ 工具栏 button active 态 aria-pressed
- ✅ Link 弹 prompt 输入 URL;空字符串 = unsetLink
- ✅ Image 弹 file input + onImageUpload → setImage
- ✅ ProseMirror placeholder 自定义 CSS(`.is-editor-empty::before`)
- ✅ 内容区基本排版样式(h1-h3 / 列表 / blockquote / 代码 / 链接 / hr / img max-width)

## 严格禁止的反模式

❌ **自己写 contentEditable + execCommand**:已废弃 API,过时且 bug 多

❌ **混用其它富文本(Slate / Quill)**:Tiptap 是本块锁定的选择;host 想换请直接 fork 整个 block

❌ **`onImageUpload` 返回相对路径但不补 host**:Tiptap 直接 `<img src>` 用,host 应返回完整 URL(或在 host 渲染时做 base url 拼接)

❌ **`value` 切换 `output` 类型**:同一编辑器 session 内不要时而 html 时而 json,会丢上下文

❌ **`disabled` 同时清空 value**:disabled 只是不可编辑,value 不会被清;host 自己分开管

❌ **改 sdk 内 RichTextEditor.tsx**:加自定义 Tiptap extension → 用 `CustomTool` 在工具栏暴露;深度扩展(Mention / Mathematics 等)请考虑包 Adapter 或建子 block

## 状态

- v0.1 — 首版 Tiptap 2 锁定 + 16 个 builtin tool;未来:Yjs 协作扩展点、@-mention、列表 indent、表格、代码块语言切换
