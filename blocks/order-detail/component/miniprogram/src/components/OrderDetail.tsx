import { View, Text, Image } from '@tarojs/components';
import { Button, Dialog, Textarea } from '@antmjs/vantui';
import { useState } from 'react';
import { useOrder } from '../hooks/useOrder';
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
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [cancelShow, setCancelShow] = useState(false);

  if (!orderId) {
    return (
      <View className='od-mp-detail-empty'>
        <Text style={{ color: '#999' }}>选择左侧订单查看详情</Text>
      </View>
    );
  }

  if (order.loading && !order.order) {
    return (
      <View className='od-mp-detail-loading'>
        <View className='od-mp-detail-skeleton' />
        <View className='od-mp-detail-skeleton' style={{ width: '80%' }} />
        <View className='od-mp-detail-skeleton' style={{ width: '60%' }} />
      </View>
    );
  }

  if (order.error && !order.order) {
    return (
      <View className='od-mp-detail-error'>
        <Text style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>加载失败</Text>
        <Text style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>{order.error.message}</Text>
        <Button type='primary' onClick={() => void order.refresh()}>重试</Button>
      </View>
    );
  }

  const d = order.order;
  if (!d) return null;

  const onCancel = () => {
    setCancelShow(false);
    order.cancel('用户主动取消').catch(() => undefined);
  };

  const onRefund = () => {
    if (refundReason.trim().length < 5) return;
    order.requestRefund(refundReason.trim())
      .then(() => {
        setRefundOpen(false);
        setRefundReason('');
      })
      .catch(() => undefined);
  };

  const canCancel = d.status === 'pending';
  const canRefund = d.status === 'paid' || d.status === 'shipped' || d.status === 'delivered';

  return (
    <View className='od-mp-detail'>
      {/* Header */}
      <View className='od-mp-detail__header'>
        <View className='od-mp-detail__header-left'>
          <Text className='od-mp-detail__order-number'>{d.order_number}</Text>
          <StatusBadge status={d.status} />
        </View>
        <View className='od-mp-detail__header-actions'>
          {canCancel && (
            <Button size='small' type='danger' onClick={() => setCancelShow(true)} aria-label='取消订单'>取消订单</Button>
          )}
          {canRefund && (
            <Button size='small' onClick={() => setRefundOpen(true)} aria-label='申请退款'>申请退款</Button>
          )}
        </View>
      </View>

      {/* Items */}
      <View className='od-mp-detail__section'>
        <Text className='od-mp-detail__section-title'>商品（{d.items.length}）</Text>
        {d.items.map((it) => (
          <View key={it.line_no} className='od-mp-detail__item'>
            {it.product_image && (
              <Image className='od-mp-detail__item-img' src={it.product_image} mode='aspectFill' />
            )}
            <View className='od-mp-detail__item-meta'>
              <Text className='od-mp-detail__item-name'>{it.product_name}</Text>
              {it.sku && <Text className='od-mp-detail__item-sku'>SKU: {it.sku}</Text>}
            </View>
            <Text className='od-mp-detail__item-qty'>x{it.quantity}</Text>
            <Text className='od-mp-detail__item-price'>{formatPrice(it.line_total, d.currency)}</Text>
          </View>
        ))}

        <View className='od-mp-detail__totals'>
          <View className='od-mp-detail__totals-row'>
            <Text>商品小计</Text>
            <Text>{formatPrice(d.subtotal, d.currency)}</Text>
          </View>
          <View className='od-mp-detail__totals-row'>
            <Text>运费</Text>
            <Text>{formatPrice(d.shipping, d.currency)}</Text>
          </View>
          <View className='od-mp-detail__totals-grand'>
            <Text>合计</Text>
            <Text>{formatPrice(d.total, d.currency)}</Text>
          </View>
        </View>
      </View>

      {/* Shipping address */}
      <View className='od-mp-detail__section'>
        <Text className='od-mp-detail__section-title'>收货地址</Text>
        <View className='od-mp-detail__addr'>
          <Text style={{ fontWeight: 600 }}>{d.shipping_address.recipient}</Text>
          <Text>{d.shipping_address.phone}</Text>
          <Text>
            {d.shipping_address.country} {d.shipping_address.province}{' '}
            {d.shipping_address.city} {d.shipping_address.street}
            {d.shipping_address.postal_code ? ` (${d.shipping_address.postal_code})` : ''}
          </Text>
        </View>
      </View>

      {/* Status timeline */}
      <View className='od-mp-detail__section'>
        <Text className='od-mp-detail__section-title'>状态时间线</Text>
        <StatusTimeline events={d.status_events} />
      </View>

      {/* Meta */}
      <View className='od-mp-detail__meta'>
        <Text>下单时间：{formatDateTime(d.created_at)}</Text>
        {d.cancel_reason && <Text>取消原因：{d.cancel_reason}</Text>}
        {d.refund_reason && <Text>退款原因：{d.refund_reason}</Text>}
      </View>

      {/* Cancel confirm dialog (vantui Dialog) */}
      <Dialog
        show={cancelShow}
        title='确认取消订单？'
        message='取消后不可恢复，已支付订单需走退款流程。'
        showCancelButton
        confirmButtonText='确认取消'
        cancelButtonText='再想想'
        onConfirm={onCancel}
        onClose={() => setCancelShow(false)}
      />

      {/* Refund dialog */}
      <Dialog
        show={refundOpen}
        title='申请退款'
        showCancelButton
        confirmButtonText='提交'
        cancelButtonText='取消'
        onConfirm={onRefund}
        onClose={() => setRefundOpen(false)}
      >
        <Textarea
          placeholder='请填写退款原因（至少 5 个字）'
          maxlength={500}
          value={refundReason}
          onInput={(e: { detail: { value: string } }) => setRefundReason(e.detail.value)}
          autosize
          style={{ marginTop: '12px' }}
        />
      </Dialog>
    </View>
  );
}
