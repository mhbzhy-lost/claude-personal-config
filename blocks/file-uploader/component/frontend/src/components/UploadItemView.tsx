import { Button, Progress, Tag } from 'antd';
import { CloseOutlined, FileOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadItem, UploadStatus } from '../types';
import { formatBytes } from '../utils/file';

interface UploadItemViewProps {
  item: UploadItem;
  showProgress: boolean;
  onRemove: () => void;
  onRetry: () => void;
}

const STATUS_TAG: Record<UploadStatus, { color: string; label: string }> = {
  queued: { color: 'default', label: '等待中' },
  uploading: { color: 'processing', label: '上传中' },
  success: { color: 'success', label: '完成' },
  failed: { color: 'error', label: '失败' },
  cancelled: { color: 'warning', label: '已取消' },
};

export function UploadItemView({ item, showProgress, onRemove, onRetry }: UploadItemViewProps) {
  const tag = STATUS_TAG[item.status];
  const isImage = !!item.previewUrl;

  return (
    <div className="fu-item">
      <div className="fu-item__thumb">
        {isImage ? (
          <img src={item.thumb ?? item.previewUrl} alt={item.file.name} loading="lazy" />
        ) : (
          <FileOutlined style={{ fontSize: 24, color: '#888' }} />
        )}
      </div>
      <div className="fu-item__body">
        <div className="fu-item__row1">
          <span className="fu-item__name" title={item.file.name}>
            {item.file.name}
          </span>
          <Tag color={tag.color}>{tag.label}</Tag>
        </div>
        <div className="fu-item__row2">
          <span className="fu-item__size">{formatBytes(item.file.size)}</span>
          {item.error && <span className="fu-item__error">{item.error}</span>}
        </div>
        {showProgress && item.status === 'uploading' && (
          <Progress percent={Math.round(item.progress)} size="small" style={{ margin: 0 }} />
        )}
      </div>
      <div className="fu-item__actions">
        {item.status === 'failed' && (
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            aria-label="重试"
            onClick={onRetry}
          />
        )}
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="移除"
          onClick={onRemove}
        />
      </div>
    </div>
  );
}
