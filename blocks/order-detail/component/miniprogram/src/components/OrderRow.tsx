import { View, Text, Image } from '@tarojs/components';
import type { OrderSummary } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { StatusBadge } from './StatusBadge';

export interface OrderRowProps {
  order: OrderSummary;
  selected?: boolean;
}

export function OrderRow({ order, selected = false }: OrderRowProps) {
  return (
    <View
      className={`od-mp-list-item ${selected ? 'od-mp-list-item--selected' : ''}`}
      data-order-id={order.id}
      aria-label={`订单 ${order.order_number}`}
    >
      {order.cover_image && (
        <Image
          className='od-mp-list-item__img'
          src={order.cover_image}
          mode='aspectFill'
          lazyLoad
        />
      )}
      <View className='od-mp-list-item__meta'>
        <View className='od-mp-list-item__row1'>
          <Text className='od-mp-list-item__number'>{order.order_number}</Text>
          <StatusBadge status={order.status} />
        </View>
        <View className='od-mp-list-item__row2'>
          <Text className='od-mp-list-item__time'>{formatDateTime(order.created_at)}</Text>
          <Text className='od-mp-list-item__count'>{order.item_count} 件</Text>
          <Text className='od-mp-list-item__total'>{formatPrice(order.total, order.currency)}</Text>
        </View>
      </View>
    </View>
  );
}
