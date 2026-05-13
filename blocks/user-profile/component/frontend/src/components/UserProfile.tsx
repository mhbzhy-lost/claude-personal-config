import { useState } from 'react';
import { Avatar, Button, Result, Space, Statistic, Tabs, Typography } from 'antd';
import { CheckCircleFilled, EditOutlined, UserOutlined } from '@ant-design/icons';
import { useUserProfile } from '../hooks/useUserProfile';
import type { UserProfileData, UserProfileProps } from '../types';

const STAT_LABELS: Record<string, string> = {
  posts: '帖子',
  followers: '粉丝',
  following: '关注',
};

/**
 * User profile "shape" component — cover + avatar + name/bio + stats + actions
 * (follow/edit) + tabs. Shape only; real persistence and follow business
 * rules are the host's job.
 */
export function UserProfile({
  data: dataProp,
  config,
  userId,
  tabs,
  activeTabKey,
  onTabChange,
  onFollow,
  onUnfollow,
  onEdit,
  headerExtra,
  className,
  height = '100%',
}: UserProfileProps) {
  const fetched = useUserProfile(dataProp ? undefined : config, dataProp ? undefined : userId);
  const data: UserProfileData | null = dataProp ?? fetched.data;
  const loading = !dataProp && fetched.loading;
  const error = !dataProp ? fetched.error : null;

  const [internalTab, setInternalTab] = useState<string | undefined>();
  const tabKey = activeTabKey ?? internalTab ?? tabs?.[0]?.key;

  if (loading) {
    return (
      <div className="up-shell up-shell--center" style={{ height }}>
        <Typography.Text type="secondary">加载中…</Typography.Text>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={['up-shell', className].filter(Boolean).join(' ')} style={{ height }}>
        <Result
          status="error"
          title="加载失败"
          subTitle={error?.message ?? '没有可显示的用户数据'}
          extra={<Button onClick={() => fetched.refresh()}>重试</Button>}
        />
      </div>
    );
  }

  return (
    <div className={['up-shell', className].filter(Boolean).join(' ')} style={{ height }}>
      <div className="up-cover" aria-hidden>
        {data.cover && <img className="up-cover__img" src={data.cover} alt="" />}
      </div>

      <header className="up-header">
        <div className="up-header__avatar-wrap">
          <Avatar
            src={data.avatar}
            icon={!data.avatar ? <UserOutlined /> : undefined}
            size={96}
          />
        </div>

        <div className="up-header__body">
          <div className="up-header__row1">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {data.name}
              {data.verified && (
                <CheckCircleFilled
                  style={{ color: '#1677ff', marginLeft: 6, fontSize: 16 }}
                  aria-label="已认证"
                />
              )}
            </Typography.Title>
            {data.handle && (
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                @{data.handle}
              </Typography.Text>
            )}
          </div>

          {data.bio && <Typography.Paragraph style={{ marginTop: 4 }}>{data.bio}</Typography.Paragraph>}

          <div className="up-meta">
            {data.location && <span>📍 {data.location}</span>}
            {data.website && (
              <a href={data.website} target="_blank" rel="noopener noreferrer" className="up-link">
                🔗 {data.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {data.joined_at && <span>🗓 加入于 {new Date(data.joined_at).getFullYear()}</span>}
          </div>

          <div className="up-stats" role="list">
            {Object.entries(data.stats).map(([k, v]) => {
              if (v === undefined) return null;
              return (
                <div className="up-stat" key={k}>
                  <Statistic value={v} title={STAT_LABELS[k] ?? k} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="up-header__actions">
          <Space size={8}>
            {data.is_self && onEdit && (
              <Button icon={<EditOutlined />} onClick={onEdit}>
                编辑资料
              </Button>
            )}
            {!data.is_self && data.is_following && onUnfollow && (
              <Button onClick={() => void onUnfollow(data.id)}>已关注</Button>
            )}
            {!data.is_self && !data.is_following && onFollow && (
              <Button type="primary" onClick={() => void onFollow(data.id)}>
                关注
              </Button>
            )}
            {headerExtra}
          </Space>
        </div>
      </header>

      {tabs && tabs.length > 0 && (
        <Tabs
          className="up-tabs"
          activeKey={tabKey}
          onChange={(k) => {
            setInternalTab(k);
            onTabChange?.(k);
          }}
          items={tabs.map((t) => ({
            key: t.key,
            label: t.count !== undefined ? `${t.label} · ${t.count}` : t.label,
            children: <div className="up-tab-content">{t.render()}</div>,
          }))}
        />
      )}
    </div>
  );
}
