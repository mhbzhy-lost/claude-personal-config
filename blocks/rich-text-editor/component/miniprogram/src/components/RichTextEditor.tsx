import { View, Text, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useCallback, useRef, useState } from 'react';
import type { RichTextEditorProps, ToolbarItem, BuiltinTool } from '../types';

const BUILTIN_TAGS: Record<BuiltinTool, { before: string; after: string; label: string }> = {
  bold: { before: '**', after: '**', label: 'B' },
  italic: { before: '*', after: '*', label: 'I' },
  strike: { before: '~~', after: '~~', label: 'S' },
  code: { before: '`', after: '`', label: '<>' },
  'heading-1': { before: '\n# ', after: '\n', label: 'H1' },
  'heading-2': { before: '\n## ', after: '\n', label: 'H2' },
  'heading-3': { before: '\n### ', after: '\n', label: 'H3' },
  'bullet-list': { before: '\n- ', after: '', label: '•' },
  'ordered-list': { before: '\n1. ', after: '', label: '1.' },
  blockquote: { before: '\n> ', after: '', label: '"' },
  'code-block': { before: '\n```\n', after: '\n```\n', label: '{}' },
  hr: { before: '\n---\n', after: '', label: '—' },
  link: { before: '[', after: '](url)', label: '🔗' },
  image: { before: '![alt](', after: ')', label: '🖼' },
  undo: { before: '', after: '', label: '↩' },
  redo: { before: '', after: '', label: '↪' },
};

const DEFAULT_TOOLBAR: ToolbarItem[] = [
  'bold', 'italic', 'strike', 'code',
  '|',
  'heading-1', 'heading-2', 'heading-3',
  '|',
  'bullet-list', 'ordered-list', 'blockquote', 'code-block',
  '|',
  'link', 'image', 'hr',
];

function isCustom(item: ToolbarItem): item is Exclude<ToolbarItem, '|' | BuiltinTool> & { key: string } {
  return typeof item === 'object' && item !== null && 'key' in item;
}

/**
 * Mini program rich text editor — uses Taro Textarea with a markdown-insertion toolbar.
 * Tiptap does not work in mini programs, so we provide markdown-based formatting.
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
  const [internalValue, setInternalValue] = useState(value ?? '');
  const textareaRef = useRef<string>(value ?? '');
  const [cursorPos, setCursorPos] = useState(0);

  const emitChange = useCallback(
    (newValue: string) => {
      setInternalValue(newValue);
      textareaRef.current = newValue;
      if (output === 'json') {
        onChange?.(JSON.stringify({ content: newValue }));
      } else {
        onChange?.(newValue);
      }
    },
    [onChange, output],
  );

  const insertTag = useCallback(
    (before: string, after: string) => {
      const text = textareaRef.current;
      const pos = cursorPos;
      const newText = text.slice(0, pos) + before + after + text.slice(pos);
      emitChange(newText);
    },
    [cursorPos, emitChange],
  );

  const handleInput = useCallback(
    (e: any) => {
      const val = e.detail?.value ?? '';
      const pos = e.detail?.cursor ?? val.length;
      textareaRef.current = val;
      setInternalValue(val);
      setCursorPos(pos);
      if (output === 'json') {
        onChange?.(JSON.stringify({ content: val }));
      } else {
        onChange?.(val);
      }
    },
    [onChange, output],
  );

  const handleToolClick = useCallback(
    (item: ToolbarItem) => {
      if (isCustom(item)) {
        item.onClick(insertTag);
        return;
      }
      if (item === 'image' && onImageUpload) {
        Taro.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          success: async (res: { tempFiles: { path: string; size: number }[] }) => {
            const tf = res.tempFiles[0];
            if (!tf) return;
            try {
              Taro.showLoading({ title: '上传中…' });
              const url = await onImageUpload({ path: tf.path, name: 'image.jpg', size: tf.size });
              Taro.hideLoading();
              insertTag('![图片](', url + ')');
            } catch {
              Taro.hideLoading();
              Taro.showToast({ title: '上传失败', icon: 'error' });
            }
          },
        });
        return;
      }
      if (item === '|') return;
      const tag = BUILTIN_TAGS[item as BuiltinTool];
      if (tag) {
        insertTag(tag.before, tag.after);
      }
    },
    [insertTag, onImageUpload],
  );

  return (
    <View
      className={`rte-mp-shell ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      {/* Toolbar */}
      <View
        className='rte-mp-toolbar'
        role='toolbar'
        aria-label='格式化工具栏'
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '8rpx',
          padding: '12rpx 16rpx',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
        }}
      >
        {toolbar.map((item, idx) => {
          if (item === '|') {
            return (
              <View
                key={`sep-${idx}`}
                style={{ width: '2rpx', height: '32rpx', background: '#e8e8e8', margin: '0 8rpx' }}
              />
            );
          }
          if (isCustom(item)) {
            return (
              <View key={item.key} onClick={() => item.onClick(insertTag)}>
                {item.render(false)}
              </View>
            );
          }
          const tag = BUILTIN_TAGS[item as BuiltinTool];
          if (!tag) return null;
          return (
            <View
              key={item}
              onClick={() => handleToolClick(item)}
              aria-label={item}
              style={{
                padding: '8rpx 16rpx',
                borderRadius: '6rpx',
                background: '#fff',
                border: '1px solid #e8e8e8',
                fontSize: '24rpx',
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '48rpx',
                fontWeight: item === 'bold' ? 700 : 400,
                fontStyle: item === 'italic' ? 'italic' : 'normal',
              }}
            >
              <Text>{tag.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Editor area */}
      <Textarea
        className='rte-mp-editor'
        aria-label='编辑区'
        value={value ?? internalValue}
        onInput={handleInput}
        placeholder={placeholder}
        disabled={disabled}
        autoHeight
        style={{
          minHeight: typeof minHeight === 'number' ? `${minHeight * 2}rpx` : `${minHeight}`,
          maxHeight: maxHeight ? (typeof maxHeight === 'number' ? `${maxHeight * 2}rpx` : `${maxHeight}`) : undefined,
          width: '100%',
          padding: '24rpx',
          fontSize: '28rpx',
          lineHeight: 1.6,
          boxSizing: 'border-box',
        }}
      />
    </View>
  );
}
