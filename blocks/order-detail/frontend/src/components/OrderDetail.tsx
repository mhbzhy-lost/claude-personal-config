import { useState } from 'react';
import { App, Button, Divider, Empty, Input, Modal, Result, Skeleton, Space, Typography } from 'antd';
import { useOrder } from '../hooks/useOrder';
import { useTokenStyle } from '../utils/tokenStyle';
import type { BlockConfig } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';

export interface OrderDetailProps {
  config: BlockConfig;
  /** Order ID to load. When null, shows empty state. */
  orderId: string | null;
}

export function OrderDetail({ config, orderId }: OrderDetailProps) {
  const order = useOrder(config, orderId);
  const { message, modal } = App.useApp();
  const tokenStyle = useTokenStyle();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');

  if (!orderId) {
    return (
      <div className="od-detail-empty">
        <Empty description="选择左侧订单查看详情" />
      </div>
    );
  }

  if (order.loading && !order.order) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton active />
      </div>
    );
  }

  if (order.error && !order.order) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle={order.error.message}
        extra={<Button type="primary" onClick={() => void order.refresh()}>重试</Button>}
      />
    );
  }

  const d = order.order;
  if (!d) return null;

  const onCancel = () => {
    modal.confirm({
      title: '确认取消订单？',
      content: '取消后不可恢复，已支付订单需走退款流程。',
      okText: '确认取消',
      cancelText: '再想想',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await order.cancel('用户主动取消');
          message.success('订单已取消');
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const onRefund = async () => {
    if (refundReason.trim().length < 5) {
      message.error('退款原因至少 5 个字');
      return;
    }
    try {
      await order.requestRefund(refundReason.trim());
      message.success('退款已提交');
      setRefundOpen(false);
      setRefundReason('');
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const canCancel = d.status === 'pending';
  const canRefund = d.status === 'paid' || d.status === 'shipped' || d.status === 'delivered';

  return (
    <div className="od-detail" style={tokenStyle}>
      <div className="od-detail-header">
        <Space>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {d.order_number}
          </Typography.Title>
          <StatusBadge status={d.status} />
        </Space>
        <Space>
          {canCancel && <Button danger onClick={onCancel}>取消订单</Button>}
          {canRefund && <Button onClick={() => setRefundOpen(true)}>申请退款</Button>}
        </Space>
      </div>

      <div className="od-detail-section">
        <h4>商品（{d.items.length}）</h4>
        {d.items.map((it) => (
          <div key={it.line_no} className="od-detail-item">
            {it.product_image && <img className="od-detail-item-img" src={it.product_image} alt="" />}
            <div className="od-detail-item-meta">
              <div className="od-detail-item-name">{it.product_name}</div>
              {it.sku && <div className="od-detail-item-sku">SKU: {it.sku}</div>}
            </div>
            <div className="od-detail-item-qty">x{it.quantity}</div>
            <div className="od-detail-item-price">{formatPrice(it.line_total, d.currency)}</div>
          </div>
        ))}
        <Divider style={{ margin: '8px 0' }} />
        <div className="od-detail-totals">
          <div><span>商品小计</span><span>{formatPrice(d.subtotal, d.currency)}</span></div>
          <div><span>运费</span><span>{formatPrice(d.shipping, d.currency)}</span></div>
          <div className="od-detail-totals-grand">
            <span>合计</span><span>{formatPrice(d.total, d.currency)}</span>
          </div>
        </div>
      </div>

      <div className="od-detail-section">
        <h4>收货地址</h4>
        <div className="od-detail-addr">
          <strong>{d.shipping_address.recipient}</strong>
          <span>{d.shipping_address.phone}</span>
          <span>
            {d.shipping_address.country} {d.shipping_address.province}{' '}
            {d.shipping_address.city} {d.shipping_address.street}
            {d.shipping_address.postal_code ? ` (${d.shipping_address.postal_code})` : ''}
          </span>
        </div>
      </div>

      <div className="od-detail-section">
        <h4>状态时间线</h4>
        <StatusTimeline events={d.status_events} />
      </div>

      <div className="od-detail-section od-detail-meta">
        <div>下单时间：{formatDateTime(d.created_at)}</div>
        {d.cancel_reason && <div>取消原因：{d.cancel_reason}</div>}
        {d.refund_reason && <div>退款原因：{d.refund_reason}</div>}
      </div>

      <Modal
        title="申请退款"
        open={refundOpen}
        onCancel={() => setRefundOpen(false)}
        onOk={onRefund}
        okText="提交"
        cancelText="取消"
      >
        <Input.TextArea
          placeholder="请填写退款原因（至少 5 个字）"
          maxLength={500}
          rows={4}
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
