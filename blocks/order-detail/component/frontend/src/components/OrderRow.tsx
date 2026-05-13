import type { OrderSummary } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { StatusBadge } from './StatusBadge';

export interface OrderRowProps {
  order: OrderSummary;
  selected?: boolean;
}

/**
 * Pure presentational row for an order summary.
 * Used by both `OrderList` (which adds its own scroll/filter shell) and
 * `OrderMasterDetail` (where the master-detail block owns the shell).
 *
 * No onClick wiring — host or wrapper attaches click handling.
 */
export function OrderRow({ order, selected = false }: OrderRowProps) {
  return (
    <div
      className={`od-list-item ${selected ? 'od-list-item-selected' : ''}`}
      data-order-id={order.id}
    >
      {order.cover_image && (
        <img className="od-list-item-img" src={order.cover_image} alt="" loading="lazy" />
      )}
      <div className="od-list-item-meta">
        <div className="od-list-item-row1">
          <span className="od-list-item-number">{order.order_number}</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="od-list-item-row2">
          <span className="od-list-item-time">{formatDateTime(order.created_at)}</span>
          <span className="od-list-item-count">{order.item_count} 件</span>
          <span className="od-list-item-total">{formatPrice(order.total, order.currency)}</span>
        </div>
      </div>
    </div>
  );
}
