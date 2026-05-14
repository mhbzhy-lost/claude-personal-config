import { View, Text } from '@tarojs/components';
import { formatDateLabel } from '../utils/time';

export function DateDivider({ iso }: { iso: string }) {
  return (
    <View className='chat-date-divider'>
      <Text>{formatDateLabel(iso)}</Text>
    </View>
  );
}
