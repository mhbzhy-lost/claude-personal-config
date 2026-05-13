import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';
import { Toolbar } from './Toolbar';
import type { RichTextEditorProps, ToolbarItem } from '../types';

const DEFAULT_TOOLBAR: ToolbarItem[] = [
  'bold',
  'italic',
  'strike',
  'code',
  '|',
  'heading-1',
  'heading-2',
  'heading-3',
  '|',
  'bullet-list',
  'ordered-list',
  'blockquote',
  'code-block',
  '|',
  'link',
  'image',
  'hr',
  '|',
  'undo',
  'redo',
];

/**
 * Tiptap-backed rich text editor with toolbar + placeholder + image upload hook.
 * Output format defaults to HTML. Host owns persistence.
 */
export function RichTextEditor({
  value,
  onChange,
  output = 'html',
  toolbar = DEFAULT_TOOLBAR,
  onImageUpload,
  placeholder = '开始输入…',
  disabled,
  ariaLabel = '富文本编辑器',
  className,
  minHeight = 240,
  maxHeight,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: value ?? '',
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      if (!onChange) return;
      if (output === 'json') {
        onChange(JSON.stringify(e.getJSON()));
      } else {
        onChange(e.getHTML());
      }
    },
  });

  // Sync external value changes (controlled).
  useEffect(() => {
    if (!editor) return;
    const current = output === 'json' ? JSON.stringify(editor.getJSON()) : editor.getHTML();
    if (value !== undefined && value !== current) {
      if (output === 'json') {
        try {
          editor.commands.setContent(JSON.parse(value));
        } catch {
          /* ignore bad json */
        }
      } else {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor, output]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return <div className={['rte-shell', className].filter(Boolean).join(' ')} />;
  }

  return (
    <div
      className={['rte-shell', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      <Toolbar editor={editor} items={toolbar} onImageUpload={onImageUpload} />
      <EditorContent
        className="rte-content"
        editor={editor}
        style={{ minHeight, maxHeight, overflow: maxHeight ? 'auto' : undefined }}
      />
    </div>
  );
}
