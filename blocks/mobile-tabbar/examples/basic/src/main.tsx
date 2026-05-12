import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp, Typography, Input, List } from 'antd';
import {
  HomeOutlined, HomeFilled,
  MessageOutlined, MessageFilled,
  CompassOutlined, CompassFilled,
  UserOutlined,
} from '@ant-design/icons';
import { TabbarShell } from '@ui/mobile-tabbar';

function HomePage() {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>首页</Typography.Title>
      <Typography.Paragraph>切到别的 tab 再切回来，下方输入保留：</Typography.Paragraph>
      <Input.TextArea placeholder="试试输入然后切 tab" rows={3} />
    </div>
  );
}

function MessagesPage() {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>消息</Typography.Title>
      <List
        dataSource={['对话 A', '对话 B', '对话 C']}
        renderItem={(item) => <List.Item style={{ padding: '12px 0' }}>{item}</List.Item>}
      />
    </div>
  );
}

function DiscoverPage() {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>发现</Typography.Title>
      <Typography.Paragraph>红点 badge（badge: true）。</Typography.Paragraph>
    </div>
  );
}

function ProfilePage() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>我的</Typography.Title>
      <Typography.Paragraph>本 tab 内部计数器：{count}</Typography.Paragraph>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        切到别的 tab 再切回，计数器值保留（keepAlive=true）。
      </Typography.Paragraph>
    </div>
  );
}

function App() {
  return (
    <TabbarShell
      tabs={[
        { key: 'home', icon: <HomeOutlined />, activeIcon: <HomeFilled />, label: '首页', render: () => <HomePage /> },
        { key: 'msg', icon: <MessageOutlined />, activeIcon: <MessageFilled />, label: '消息', render: () => <MessagesPage />, badge: 12 },
        { key: 'disc', icon: <CompassOutlined />, activeIcon: <CompassFilled />, label: '发现', render: () => <DiscoverPage />, badge: true },
        { key: 'me', icon: <UserOutlined />, label: '我的', render: () => <ProfilePage /> },
      ]}
      defaultActiveKey="home"
      onChange={(k) => console.log('switch to', k)}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>
);
