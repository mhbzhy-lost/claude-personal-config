# rich-text-editor SDK

锁定 Tiptap 的富文本编辑器 UI chrome:**工具栏 schema + 受控 value
+ 图片上传 hook + 占位符 + 自定义 tool 扩展点**。

> **为什么"锁定 Tiptap"是 block 的核心价值**:React 富文本编辑器
> 选型很大(Tiptap / Slate / Lexical / Quill 等都不互换),host 一旦
> 拷贝 block,**就锁了一个**,跨项目编辑器行为完全一致。

```
component/
└── frontend/    RichTextEditor + Toolbar + SKILL.md
```

## 整体复制

```bash
cp -r blocks/rich-text-editor/component your-project/sdk/ui-chrome/rich-text-editor
```

## 最小用法

```tsx
import { useState } from 'react';
import { RichTextEditor } from '@rte/rich-text-editor';
import '@rte/rich-text-editor/styles.css';

const [content, setContent] = useState('<p>开始书写…</p>');

<RichTextEditor
  value={content}
  onChange={setContent}                   // 默认输出 HTML 字符串
  placeholder="写点什么…"
  onImageUpload={async (file) => {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch('/api/upload', { method: 'POST', body: form });
    const { url } = await r.json();
    return url;
  }}
/>
```

## 关键设计

- **锁定 Tiptap 2.x**:host 拷贝后立即有 starter-kit(粗体/斜体/标题/
  列表/引用/代码块/HR)+ Link + Image + Placeholder 扩展
- **工具栏 schema**:`toolbar: ToolbarItem[]` 默认含完整 18 个按钮 +
  分隔符;host 可自由删减、重排、`'|'` 加分隔
- **自定义 tool**:`{ key, onClick(editor), render(active) }` 注入自己
  的按钮(直接调 Tiptap chain command)
- **受控 value**:`value + onChange`;默认输出 HTML 字符串,
  `output='json'` 输出 Tiptap JSON 序列化(更精确,适合云端持久化)
- **图片上传 hook**:host 实现 `onImageUpload(file) => Promise<url>`,
  按钮才生效;不传则隐藏图片按钮
- **占位符** + **禁用态** + **min/max height**
- **a11y**:toolbar role + aria-pressed(active),编辑区 aria-label

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@rte/rich-text-editor` |
| 后端 | (无,host 自管 url 持久化) |
| 关键依赖 | `@tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder` |

## 何时**不**用

- 纯文本输入 → antd `Input.TextArea`
- Markdown 双栏预览 → 找 markdown 方案
- 代码 IDE → Monaco / CodeMirror
- 实时协作(Yjs) → 本块未集成,扩展点 v0.2
- 评论框(轻量) → antd `Input.TextArea` 即可

## 完整 Props 见 SKILL.md
