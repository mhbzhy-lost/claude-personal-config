import type { ReactNode } from 'react';

export type OutputFormat = 'html' | 'json';

export type BuiltinTool =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'blockquote'
  | 'code-block'
  | 'hr'
  | 'link'
  | 'image'
  | 'undo'
  | 'redo';

export interface CustomTool {
  key: string;
  onClick: (insertTag: (before: string, after: string) => void) => void;
  render: (active: boolean) => ReactNode;
}

export type ToolbarItem = BuiltinTool | '|' | CustomTool;

export interface RichTextEditorProps {
  value?: string;
  onChange?: (output: string) => void;
  output?: OutputFormat;
  toolbar?: ToolbarItem[];
  onImageUpload?: (file: { path: string; name: string; size: number }) => Promise<string>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
}
