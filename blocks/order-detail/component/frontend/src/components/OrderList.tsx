import { Button, Empty, Result, Segmented, Skeleton, Spin } from 'antd';
import { useOrders } from '../hooks/useOrders';
import { useTokenStyle } from '../utils/tokenStyle';
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
  const tokenStyle = useTokenStyle();

  return (
    <div className="od-list" style={tokenStyle}>
      <div className="od-list-header">
        <Segmented
          options={FILTER_OPTIONS}
          value={orders.status ?? 'all'}
          onChange={(v) => orders.setStatus(v === 'all' ? undefined : (v as OrderStatus))}
        />
        <span className="od-list-total">共 {orders.total} 单</span>
      </div>
      {orders.error && orders.items.length === 0 && (
        <Result
          status="error"
          title="加载失败"
          subTitle={orders.error.message}
          extra={<Button type="primary" onClick={() => void orders.refresh()}>重试</Button>}
        />
      )}
      {orders.loading && orders.items.length === 0 && (
        <div style={{ padding: 16 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} avatar paragraph={{ rows: 2 }} active style={{ padding: 8 }} />
          ))}
        </div>
      )}
      {!orders.loading && !orders.error && orders.items.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <Empty description="暂无订单" />
        </div>
      )}
      <div className="od-list-scroll">
        {orders.items.map((o) => (
          <div key={o.id} onClick={() => onSelect?.(o)}>
            <OrderRow order={o} selected={selectedId === o.id} />
          </div>
        ))}
        {orders.hasMore && (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Button type="link" loading={orders.loading} onClick={() => void orders.loadMore()}>
              加载更多
            </Button>
          </div>
        )}
        {!orders.hasMore && orders.items.length > 0 && (
          <div className="od-list-end">没有更多了</div>
        )}
        {orders.loading && orders.items.length > 0 && (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <Spin />
          </div>
        )}
      </div>
    </div>
  );
}
