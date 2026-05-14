import { View, Text } from '@tarojs/components';
import type { OrderStatus } from '../types';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/format';

interface Props {
  status: OrderStatus;
}

export function StatusBadge({ status }: Props) {
  const color = STATUS_COLOR[status] || '#8c8c8c';
  return (
    <View
      className='od-mp-status-badge'
      style={{ color, borderColor: color }}
    >
      <Text>{STATUS_LABEL[status] || status}</Text>
    </View>
  );
}
