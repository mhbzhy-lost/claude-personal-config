import { Avatar, Button } from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  NotificationOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { NotificationItem, NotificationType } from '../types';
import { formatRelative } from '../utils/format';

interface NotificationItemViewProps {
  item: NotificationItem;
  onMarkRead: () => void;
  onRemove?: () => void;
}

const TYPE_META: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  info: { icon: <InfoCircleOutlined />, color: '#1677ff' },
  success: { icon: <CheckCircleOutlined />, color: '#52c41a' },
  warning: { icon: <WarningOutlined />, color: '#faad14' },
  error: { icon: <ExclamationCircleOutlined />, color: '#ff4d4f' },
  system: { icon: <NotificationOutlined />, color: '#8c8c8c' },
};

export function NotificationItemView({ item, onMarkRead, onRemove }: NotificationItemViewProps) {
  const meta = TYPE_META[item.type];

  return (
    <div
      className={'nc-item' + (item.read ? '' : ' nc-item--unread')}
      role="button"
      aria-label={typeof item.title === 'string' ? item.title : '通知项'}
      onClick={() => !item.read && onMarkRead()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !item.read) {
          e.preventDefault();
          onMarkRead();
        }
      }}
      tabIndex={0}
    >
      <div className="nc-item__icon-wrap">
        {item.actor?.avatar ? (
          <Avatar src={item.actor.avatar} size={32} />
        ) : (
          <span className="nc-item__icon" style={{ color: meta.color }}>
            {meta.icon}
          </span>
        )}
      </div>
      <div className="nc-item__body">
        <div className="nc-item__row1">
          {!item.read && <span className="nc-item__dot" aria-label="未读" />}
          <span className="nc-item__title">{item.title}</span>
        </div>
        {item.body && <div className="nc-item__text">{item.body}</div>}
        <div className="nc-item__row3">
          <span className="nc-item__time">{formatRelative(item.timestamp)}</span>
          {item.action && (
            <Button
              type="link"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                item.action!.onClick();
              }}
            >
              {item.action.label}
            </Button>
          )}
        </div>
      </div>
      {onRemove && (
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="移除"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </div>
  );
}
