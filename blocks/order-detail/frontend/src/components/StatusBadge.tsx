import type { OrderStatus } from '../types';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/format';

interface Props {
  status: OrderStatus;
}

export function StatusBadge({ status }: Props) {
  return (
    <span
      className="od-status-badge"
      style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
