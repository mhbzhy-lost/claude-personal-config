import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

interface DropzoneProps {
  accept?: string;
  multiple?: boolean;
  paste?: boolean;
  text?: ReactNode;
  hint?: ReactNode;
  ariaLabel?: string;
  onFiles: (files: File[]) => void;
}

export function Dropzone({
  accept,
  multiple = true,
  paste,
  text,
  hint,
  ariaLabel = '文件上传区域',
  onFiles,
}: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFiles(Array.from(files));
    },
    [onFiles],
  );

  // Clipboard paste support (window-scoped when enabled).
  useEffect(() => {
    if (!paste) return;
    function onPaste(e: ClipboardEvent) {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      handleFiles(files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [paste, handleFiles]);

  return (
    <div
      className={'fu-dropzone' + (dragging ? ' fu-dropzone--drag' : '')}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <CloudUploadOutlined style={{ fontSize: 28, color: '#888' }} />
      <div className="fu-dropzone__text">
        {text ?? '点击或拖拽文件到此处'}
        {paste ? <span className="fu-dropzone__paste">(支持 Cmd/Ctrl+V 粘贴)</span> : null}
      </div>
      {hint ? <div className="fu-dropzone__hint">{hint}</div> : null}
      <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
        选择文件
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          // reset so picking the same file twice fires onChange again
          e.target.value = '';
        }}
      />
    </div>
  );
}
