import { useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';

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
    <View className='ct-composer'>
      <Textarea
        autoFocus={autoFocus}
        placeholder={placeholder ?? '说点什么...'}
        value={value}
        onInput={(e) => setValue(e.detail.value)}
        maxlength={10000}
        className='ct-composer-textarea'
        disableDefaultPadding
        aria-label='写评论'
      />
      <View className='ct-composer-foot'>
        {err ? <Text className='ct-composer-err'>{err}</Text> : <View />}
        <View className='ct-composer-actions'>
          {onCancel && (
            <View className='ct-composer-cancel' onClick={onCancel} aria-label='取消'>
              <Text>取消</Text>
            </View>
          )}
          <View
            className={`ct-composer-submit ${(!value.trim() || submitting) ? 'ct-composer-submit-disabled' : ''}`}
            onClick={() => void send()}
            aria-label='提交评论'
          >
            <Text>{submitting ? '发送中...' : '发送'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
