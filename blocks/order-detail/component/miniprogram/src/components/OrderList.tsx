import { View, Text, ScrollView } from '@tarojs/components';
import { Button, Loading, Empty } from '@antmjs/vantui';
import { useOrders } from '../hooks/useOrders';
import type { BlockConfig, OrderStatus, OrderSummary } from '../types';
import { OrderRow } from './OrderRow';

export interface OrderListProps {
  config: BlockConfig;
  selectedId?: string | null;
  onSelect?: (o: OrderSummary) => void;
}

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'shipped', label: '已发货' },
  { value: 'delivered', label: '已送达' },
];

export function OrderList({ config, selectedId, onSelect }: OrderListProps) {
  const orders = useOrders(config);

  return (
    <View className='od-mp-list'>
      <View className='od-mp-list__header'>
        <ScrollView
          scrollX
          className='od-mp-list__filters'
          aria-label='订单筛选'
          style={{ whiteSpace: 'nowrap' }}
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = (orders.status ?? 'all') === opt.value;
            return (
              <View
                key={opt.value}
                className={`od-mp-list__filter-chip ${active ? 'od-mp-list__filter-chip--active' : ''}`}
                onClick={() => orders.setStatus(opt.value === 'all' ? undefined : (opt.value as OrderStatus))}
              >
                <Text>{opt.label}</Text>
              </View>
            );
          })}
        </ScrollView>
        <Text className='od-mp-list__total'>共 {orders.total} 单</Text>
      </View>

      {orders.error && orders.items.length === 0 && (
        <View className='od-mp-list__error'>
          <Text style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>加载失败</Text>
          <Text style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>{orders.error.message}</Text>
          <Button type='primary' onClick={() => void orders.refresh()}>重试</Button>
        </View>
      )}

      {orders.loading && orders.items.length === 0 && (
        <View className='od-mp-list__skeleton'>
          {[0, 1, 2].map((i) => (
            <View key={i} className='od-mp-list__skeleton-item' />
          ))}
        </View>
      )}

      {!orders.loading && !orders.error && orders.items.length === 0 && (
        <View className='od-mp-list__empty'>
          <Empty description='暂无订单' />
        </View>
      )}

      <ScrollView className='od-mp-list__body' scrollY>
        {orders.items.map((o) => (
          <View
            key={o.id}
            onClick={() => onSelect?.(o)}
          >
            <OrderRow order={o} selected={selectedId === o.id} />
          </View>
        ))}

        {orders.hasMore && (
          <View className='od-mp-list__load-more'>
            <Button
              size='small'
              loading={orders.loading}
              onClick={() => void orders.loadMore()}
            >
              加载更多
            </Button>
          </View>
        )}

        {!orders.hasMore && orders.items.length > 0 && (
          <View className='od-mp-list__end'>
            <Text>没有更多了</Text>
          </View>
        )}

        {orders.loading && orders.items.length > 0 && (
          <View className='od-mp-list__loading'>
            <Loading />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
