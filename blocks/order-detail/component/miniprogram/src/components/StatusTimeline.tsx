import { View, Text } from '@tarojs/components';
import type { OrderStatusEvent } from '../types';
import { STATUS_COLOR, STATUS_LABEL, formatDateTime } from '../utils/format';

interface Props {
  events: OrderStatusEvent[];
}

export function StatusTimeline({ events }: Props) {
  return (
    <View className='od-mp-timeline'>
      {events.map((e, i) => (
        <View key={i} className='od-mp-timeline__item'>
          <View
            className='od-mp-timeline__dot'
            style={{ background: STATUS_COLOR[e.status] }}
          />
          <View className='od-mp-timeline__body'>
            <View className='od-mp-timeline__line'>
              <Text style={{ color: STATUS_COLOR[e.status], fontWeight: 600, fontSize: '13px' }}>
                {STATUS_LABEL[e.status]}
              </Text>
              <Text className='od-mp-timeline__time'>
                {formatDateTime(e.occurred_at)}
              </Text>
            </View>
            {e.note && (
              <View className='od-mp-timeline__note'>
                <Text>{e.note}</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
