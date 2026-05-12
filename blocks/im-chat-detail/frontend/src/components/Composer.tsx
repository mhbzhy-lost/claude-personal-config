import { useState } from 'react';
import { Button, Input } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface Props {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setValue('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-composer">
      <Input.TextArea
        autoSize={{ minRows: 1, maxRows: 4 }}
        placeholder={disabled ? '无法发送' : '说点什么... (⌘/Ctrl+Enter 发送)'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={(e) => {
          if ((e.metaKey || e.ctrlKey) && !sending) {
            e.preventDefault();
            void send();
          }
        }}
        disabled={disabled}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={() => void send()}
        disabled={disabled || !value.trim()}
        loading={sending}
      >
        发送
      </Button>
    </div>
  );
}
