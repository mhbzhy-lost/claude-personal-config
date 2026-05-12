import type { OrderStatusEvent } from '../types';
import { STATUS_COLOR, STATUS_LABEL, formatDateTime } from '../utils/format';

interface Props {
  events: OrderStatusEvent[];
}

export function StatusTimeline({ events }: Props) {
  return (
    <ol className="od-timeline">
      {events.map((e, i) => (
        <li key={i} className="od-timeline-item">
          <span className="od-timeline-dot" style={{ background: STATUS_COLOR[e.status] }} />
          <div className="od-timeline-body">
            <div className="od-timeline-line">
              <strong style={{ color: STATUS_COLOR[e.status] }}>{STATUS_LABEL[e.status]}</strong>
              <span className="od-timeline-time">{formatDateTime(e.occurred_at)}</span>
            </div>
            {e.note && <div className="od-timeline-note">{e.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
