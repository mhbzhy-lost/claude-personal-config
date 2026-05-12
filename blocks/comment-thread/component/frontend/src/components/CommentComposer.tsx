import { useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
}

export function CommentComposer({ placeholder, autoFocus, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    const text = value.trim();
    if (!text) return;
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit(text);
      setValue('');
      onCancel?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ct-composer">
      <Input.TextArea
        autoFocus={autoFocus}
        placeholder={placeholder ?? '说点什么……'}
        rows={3}
        maxLength={10000}
        showCount
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={(e) => {
          if ((e.metaKey || e.ctrlKey) && !submitting) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <Space style={{ marginTop: 8, justifyContent: 'space-between', width: '100%' }}>
        {err ? <Typography.Text type="danger" style={{ fontSize: 12 }}>{err}</Typography.Text> : <span />}
        <Space>
          {onCancel && <Button size="small" onClick={onCancel}>取消</Button>}
          <Button size="small" type="primary" loading={submitting} onClick={() => void send()}>
            发送（⌘/Ctrl+Enter）
          </Button>
        </Space>
      </Space>
    </div>
  );
}
