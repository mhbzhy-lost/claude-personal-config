import { Button, Divider, Space, Tooltip } from 'antd';
import {
  BoldOutlined,
  CodeOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import type { BuiltinTool, CustomTool, ToolbarItem } from '../types';

interface ToolMeta {
  icon: ReactNode;
  label: string;
  isActive: (editor: Editor) => boolean;
  onClick: (editor: Editor) => void;
}

const META: Record<BuiltinTool, ToolMeta> = {
  bold: {
    icon: <BoldOutlined />,
    label: '加粗',
    isActive: (e) => e.isActive('bold'),
    onClick: (e) => e.chain().focus().toggleBold().run(),
  },
  italic: {
    icon: <ItalicOutlined />,
    label: '斜体',
    isActive: (e) => e.isActive('italic'),
    onClick: (e) => e.chain().focus().toggleItalic().run(),
  },
  strike: {
    icon: <StrikethroughOutlined />,
    label: '删除线',
    isActive: (e) => e.isActive('strike'),
    onClick: (e) => e.chain().focus().toggleStrike().run(),
  },
  code: {
    icon: <CodeOutlined />,
    label: '行内代码',
    isActive: (e) => e.isActive('code'),
    onClick: (e) => e.chain().focus().toggleCode().run(),
  },
  'heading-1': {
    icon: <strong>H1</strong>,
    label: '标题 1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    onClick: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  'heading-2': {
    icon: <strong>H2</strong>,
    label: '标题 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    onClick: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  'heading-3': {
    icon: <strong>H3</strong>,
    label: '标题 3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    onClick: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  'bullet-list': {
    icon: <UnorderedListOutlined />,
    label: '无序列表',
    isActive: (e) => e.isActive('bulletList'),
    onClick: (e) => e.chain().focus().toggleBulletList().run(),
  },
  'ordered-list': {
    icon: <OrderedListOutlined />,
    label: '有序列表',
    isActive: (e) => e.isActive('orderedList'),
    onClick: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  blockquote: {
    icon: <span>❝</span>,
    label: '引用',
    isActive: (e) => e.isActive('blockquote'),
    onClick: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  'code-block': {
    icon: <span>{'</>'}</span>,
    label: '代码块',
    isActive: (e) => e.isActive('codeBlock'),
    onClick: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  hr: {
    icon: <span>—</span>,
    label: '分隔线',
    isActive: () => false,
    onClick: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  link: {
    icon: <LinkOutlined />,
    label: '链接',
    isActive: (e) => e.isActive('link'),
    onClick: (e) => {
      const previous = (e.getAttributes('link') as { href?: string }).href;
      const url = window.prompt('链接地址', previous ?? 'https://');
      if (url === null) return;
      if (url === '') {
        e.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }
      e.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    },
  },
  image: {
    icon: <PictureOutlined />,
    label: '图片',
    isActive: () => false,
    onClick: () => {
      // handled separately because it needs upload hook (see ToolbarProps.onImageUpload)
    },
  },
  undo: {
    icon: <UndoOutlined />,
    label: '撤销',
    isActive: () => false,
    onClick: (e) => e.chain().focus().undo().run(),
  },
  redo: {
    icon: <RedoOutlined />,
    label: '重做',
    isActive: () => false,
    onClick: (e) => e.chain().focus().redo().run(),
  },
};

interface ToolbarProps {
  editor: Editor;
  items: ToolbarItem[];
  onImageUpload?: (file: File) => Promise<string>;
}

function isCustom(item: ToolbarItem): item is CustomTool {
  return typeof item === 'object' && item !== null && 'render' in item;
}

export function Toolbar({ editor, items, onImageUpload }: ToolbarProps) {
  const insertImage = async () => {
    if (!onImageUpload) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await onImageUpload(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        console.error('upload failed', err);
      }
    };
    input.click();
  };

  return (
    <div className="rte-toolbar" role="toolbar" aria-label="编辑器工具栏">
      <Space size={2} wrap>
        {items.map((item, idx) => {
          if (item === '|') return <Divider key={`sep-${idx}`} type="vertical" />;
          if (isCustom(item)) {
            return (
              <span key={item.key} onClick={() => item.onClick(editor)} role="presentation">
                {item.render(false)}
              </span>
            );
          }
          if (item === 'image') {
            return (
              <Tooltip key={item} title="图片">
                <Button
                  type="text"
                  size="small"
                  icon={<PictureOutlined />}
                  aria-label="插入图片"
                  disabled={!onImageUpload}
                  onClick={insertImage}
                />
              </Tooltip>
            );
          }
          const meta = META[item];
          if (!meta) return null;
          const active = meta.isActive(editor);
          return (
            <Tooltip key={item} title={meta.label}>
              <Button
                type={active ? 'primary' : 'text'}
                size="small"
                icon={meta.icon}
                aria-label={meta.label}
                aria-pressed={active}
                onClick={() => meta.onClick(editor)}
              />
            </Tooltip>
          );
        })}
      </Space>
    </div>
  );
}
