import { useState } from 'react';
import { Button, Empty, Result, Segmented, Skeleton } from 'antd';
import { LeftOutlined } from '@ant-design/icons';
import { MasterDetail } from '@md/master-detail';
import type { MasterDetailLayout } from '@md/master-detail';
import { useOrders } from '../hooks/useOrders';
import { useTokenStyle } from '../utils/tokenStyle';
import type { BlockConfig, OrderStatus, OrderSummary } from '../types';
import { OrderRow } from './OrderRow';
import { OrderDetail } from './OrderDetail';

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
  /** Height of the whole component. Default '100%'. */
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

/**
 * Pre-wired order list + detail in master-detail layout.
 *
 * Composes `@md/master-detail` (the layout shell) with order-detail's
 * own hooks/components. Use when you want the canonical "左列表右详情"
 * page; if you need a custom layout, mount `OrderList` + `OrderDetail`
 * independently and bring your own shell.
 *
 * Requires `@md/master-detail` SDK to be copied into the host as a
 * peer (`pnpm add file:./sdk/master-detail/frontend`).
 */
export function OrderMasterDetail({
  config,
  initialSelectedId = null,
  layout = 'auto',
  splitBreakpoint = 768,
  splitRatio = [1, 2],
  height = '100%',
  onSelectChange,
}: OrderMasterDetailProps) {
  const orders = useOrders(config);
  const tokenStyle = useTokenStyle();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  const onSelect = (id: string | null) => {
    setSelectedId(id);
    if (onSelectChange) {
      const order = id == null ? null : (orders.items.find((o) => o.id === id) ?? null);
      onSelectChange(id, order);
    }
  };

  // Header toolbar (status filter + total) lives outside MasterDetail
  // since MasterDetail is a pure split/stack shell with no toolbar slot.
  // We render it on top of the shell as a host-owned region.
  return (
    <div className="od-master-detail" style={{ ...tokenStyle, height, display: 'flex', flexDirection: 'column' }}>
      <div className="od-list-header" style={{ flex: '0 0 auto' }}>
        <Segmented
          options={FILTER_OPTIONS}
          value={orders.status ?? 'all'}
          onChange={(v) => orders.setStatus(v === 'all' ? undefined : (v as OrderStatus))}
        />
        <span className="od-list-total">共 {orders.total} 单</span>
      </div>
      {orders.error && orders.items.length === 0 ? (
        <Result
          status="error"
          title="加载失败"
          subTitle={orders.error.message}
          extra={<Button type="primary" onClick={() => void orders.refresh()}>重试</Button>}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <MasterDetail<OrderSummary>
            items={orders.items}
            getItemId={(o) => o.id}
            selectedId={selectedId}
            onSelect={onSelect}
            renderItem={(o, sel) => <OrderRow order={o} selected={sel} />}
            renderDetail={(id) => <OrderDetail config={config} orderId={id} />}
            placeholder={<Empty description="选择一个订单查看详情" />}
            emptyList={
              orders.loading ? (
                <div style={{ padding: 16, width: '100%' }}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} avatar paragraph={{ rows: 2 }} active style={{ padding: 8 }} />
                  ))}
                </div>
              ) : (
                <Empty description="暂无订单" />
              )
            }
            renderBackButton={(onBack) => (
              <Button type="link" icon={<LeftOutlined />} onClick={onBack}>返回</Button>
            )}
            loading={orders.loading}
            layout={layout}
            splitBreakpoint={splitBreakpoint}
            splitRatio={splitRatio}
            height="100%"
          />
        </div>
      )}
      {orders.hasMore && (
        <div style={{ textAlign: 'center', padding: 12, flex: '0 0 auto' }}>
          <Button type="link" loading={orders.loading} onClick={() => void orders.loadMore()}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  );
}
