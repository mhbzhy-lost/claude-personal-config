import { View, Text } from '@tarojs/components';
import { MasterDetail } from '@md/master-detail-mp';
import type { MasterDetailLayout } from '@md/master-detail-mp';
import { useOrders } from '../hooks/useOrders';
import type { BlockConfig, OrderStatus, OrderSummary } from '../types';
import { OrderRow } from './OrderRow';
import { OrderDetail } from './OrderDetail';
import { useState } from 'react';
import { Button, Empty, Loading } from '@antmjs/vantui';

export interface OrderMasterDetailProps {
  config: BlockConfig;
  /** Initial selected order id. Optional. */
  initialSelectedId?: string | null;
  /** Layout mode forwarded to MasterDetail. Default 'auto'. */
  layout?: MasterDetailLayout;
  /** Breakpoint forwarded to MasterDetail. Default 768 px. */
  splitBreakpoint?: number;
  /** Split ratio forwarded to MasterDetail. Default [1, 2]. */
  splitRatio?: [number, number];
  /** Height of the whole component. Default '100vh'. */
  height?: string | number;
  /** Fired after selection changes (host wants to sync URL etc). Optional. */
  onSelectChange?: (id: string | null, order: OrderSummary | null) => void;
}

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'shipped', label: '已发货' },
  { value: 'delivered', label: '已送达' },
];

export function OrderMasterDetail({
  config,
  initialSelectedId = null,
  layout = 'auto',
  splitBreakpoint = 768,
  splitRatio = [1, 2],
  height = '100vh',
  onSelectChange,
}: OrderMasterDetailProps) {
  const orders = useOrders(config);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  const onSelect = (id: string | null) => {
    setSelectedId(id);
    if (onSelectChange) {
      const order = id == null ? null : (orders.items.find((o) => o.id === id) ?? null);
      onSelectChange(id, order);
    }
  };

  if (orders.error && orders.items.length === 0) {
    return (
      <View style={{ display: 'flex', flexDirection: 'column', height, padding: '40px', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>加载失败</Text>
        <Text style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>{orders.error.message}</Text>
        <Button type='primary' onClick={() => void orders.refresh()}>重试</Button>
      </View>
    );
  }

  return (
    <View className='od-mp-master-detail' style={{ height, display: 'flex', flexDirection: 'column' }}>
      {/* Filter toolbar */}
      <View className='od-mp-list__header' style={{ flexShrink: 0 }} aria-label='订单筛选'>
        <View style={{ display: 'flex', overflow: 'auto' }}>
          {FILTER_OPTIONS.map((opt) => {
            const active = (orders.status ?? 'all') === opt.value;
            return (
              <View
                key={opt.value}
                className={`od-mp-list__filter-chip ${active ? 'od-mp-list__filter-chip--active' : ''}`}
                onClick={() => orders.setStatus(opt.value === 'all' ? undefined : (opt.value as OrderStatus))}
                style={{ flexShrink: 0 }}
              >
                <Text>{opt.label}</Text>
              </View>
            );
          })}
        </View>
        <Text className='od-mp-list__total'>共 {orders.total} 单</Text>
      </View>

      {/* Master-Detail body */}
      <View style={{ flex: 1, minHeight: 0 }}>
        <MasterDetail<OrderSummary>
          items={orders.items}
          getItemId={(o) => o.id}
          selectedId={selectedId}
          onSelect={onSelect}
          renderItem={(o, sel) => <OrderRow order={o} selected={sel} />}
          renderDetail={(id) => <OrderDetail config={config} orderId={id} />}
          placeholder={<Empty description='选择一个订单查看详情' />}
          emptyList={
            orders.loading ? (
              <View style={{ padding: '16px' }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} className='od-mp-list__skeleton-item' style={{ height: '72px', marginBottom: '12px' }} />
                ))}
              </View>
            ) : (
              <Empty description='暂无订单' />
            )
          }
          renderBackButton={(onBack) => (
            <View style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }} onClick={onBack}>
              <Text style={{ color: '#1677ff', fontSize: '14px' }}>← 返回</Text>
            </View>
          )}
          loading={orders.loading}
          layout={layout}
          splitBreakpoint={splitBreakpoint}
          splitRatio={splitRatio}
          height='100%'
        />
      </View>

      {/* Load more button */}
      {orders.hasMore && (
        <View style={{ textAlign: 'center', padding: '12px', flexShrink: 0 }}>
          <Button
            size='small'
            loading={orders.loading}
            onClick={() => void orders.loadMore()}
          >
            加载更多
          </Button>
        </View>
      )}
    </View>
  );
}
