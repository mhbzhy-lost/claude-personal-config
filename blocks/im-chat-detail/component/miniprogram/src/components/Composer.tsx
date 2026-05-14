import { useState } from 'react';
import { View, Input, Text } from '@tarojs/components';

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
    <View className='chat-composer'>
      <Input
        className='chat-composer-input'
        placeholder={disabled ? '无法发送' : '说点什么...'}
        value={value}
        onInput={(e) => setValue(e.detail.value)}
        disabled={disabled}
        confirmType='send'
        onConfirm={() => { if (!sending) void send(); }}
      />
      <View
        className={`chat-composer-btn ${(!value.trim() || disabled || sending) ? 'chat-composer-btn-disabled' : ''}`}
        onClick={() => void send()}
        aria-label='发送'
      >
        <Text>发送</Text>
      </View>
    </View>
  );
}
