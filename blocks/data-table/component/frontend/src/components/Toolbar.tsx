import { Button, Input, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { BatchAction } from '../types';

interface ToolbarProps<T> {
  search?: string;
  onSearchChange?: (s: string) => void;
  searchPlaceholder?: string;
  selected: T[];
  batchActions?: BatchAction<T>[];
  toolbarRight?: ReactNode;
}

export function Toolbar<T>({
  search,
  onSearchChange,
  searchPlaceholder,
  selected,
  batchActions,
  toolbarRight,
}: ToolbarProps<T>) {
  const hasSelection = selected.length > 0;

  return (
    <div className="dt-toolbar">
      <Space size={8} wrap>
        {onSearchChange ? (
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={searchPlaceholder ?? '搜索'}
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ width: 240 }}
          />
        ) : null}
        {hasSelection && batchActions?.length ? (
          <span className="dt-toolbar-selection">
            已选 {selected.length} 项
            {batchActions.map((a) => (
              <Button
                key={a.key}
                size="small"
                icon={a.icon}
                danger={a.danger}
                disabled={a.disabled?.(selected)}
                onClick={() => void a.onClick(selected)}
                style={{ marginLeft: 8 }}
              >
                {a.label}
              </Button>
            ))}
          </span>
        ) : null}
      </Space>
      <Space size={8}>{toolbarRight}</Space>
    </div>
  );
}
