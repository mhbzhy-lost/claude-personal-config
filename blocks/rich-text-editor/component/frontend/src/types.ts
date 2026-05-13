import type { ReactNode } from 'react';

export type OutputFormat = 'html' | 'json';

/** Built-in toolbar buttons. */
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

/** Custom toolbar button — host supplies rendering + click. */
export interface CustomTool {
  key: string;
  /** Triggered with the active editor instance (from useEditor). */
  onClick: (editor: unknown) => void;
  /** Render the button itself (icon + accessible label). */
  render: (active: boolean) => ReactNode;
}

export type ToolbarItem = BuiltinTool | '|' | CustomTool;

export interface RichTextEditorProps {
  // -------- Value (controlled) --------

  /** Initial / controlled content as HTML string. */
  value?: string;
  /** Fired with the current document on every change. */
  onChange?: (output: string) => void;

  /** Format of the `onChange` payload. Default 'html'. */
  output?: OutputFormat;

  // -------- Toolbar --------

  /** Toolbar items in order. Use '|' for separator. Default = recommended preset. */
  toolbar?: ToolbarItem[];

  // -------- Image upload --------

  /**
   * Implement to enable the "image" toolbar button. Receives a `File`,
   * returns the public URL. The block inserts `<img src={url}>` after the
   * promise resolves.
   */
  onImageUpload?: (file: File) => Promise<string>;

  // -------- States --------

  placeholder?: string;
  disabled?: boolean;

  // -------- a11y / style --------

  ariaLabel?: string;
  className?: string;
  /** Minimum height (px). Default 240. */
  minHeight?: number;
  /** Maximum height (px). Editor scrolls past this. Default undefined (no cap). */
  maxHeight?: number;
}
