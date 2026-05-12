import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp, Button, List, Space, Typography } from 'antd';
import { SearchOutlined, ShareAltOutlined, MoreOutlined } from '@ant-design/icons';
import { NavBarPage } from '@ui/top-navbar';

type Screen = 'home' | 'detail' | 'profile';

function App() {
  const [screen, setScreen] = useState<Screen>('home');

  if (screen === 'home') {
    return (
      <NavBarPage title="商品列表" hideBack right={<Button type="text" icon={<SearchOutlined />} />}>
        <List
          dataSource={['运动鞋', '电脑包', '机械键盘']}
          renderItem={(item) => (
            <List.Item style={{ padding: '12px 16px' }} onClick={() => setScreen('detail')}>
              <Typography.Text>{item}</Typography.Text>
            </List.Item>
          )}
        />
        <div style={{ padding: 16 }}>
          <Button block onClick={() => setScreen('profile')}>进个人页（沉浸式头图）</Button>
        </div>
      </NavBarPage>
    );
  }

  if (screen === 'detail') {
    return (
      <NavBarPage
        title="商品详情"
        onBack={() => setScreen('home')}
        right={
          <Space size={2}>
            <Button type="text" icon={<ShareAltOutlined />} />
            <Button type="text" icon={<MoreOutlined />} />
          </Space>
        }
      >
        <div style={{ padding: 24 }}>
          <Typography.Title level={4}>商品详情页</Typography.Title>
          <Typography.Paragraph>这是被 NavBar 装饰的二级页面。</Typography.Paragraph>
        </div>
      </NavBarPage>
    );
  }

  // profile: 沉浸式头图（transparent navbar）
  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg,#1677ff,#52c41a)',
          height: 240,
        }}
      />
      <NavBarPage transparent title="个人主页" onBack={() => setScreen('home')} background="transparent">
        <div style={{ padding: 24, position: 'relative' }}>
          <div style={{ height: 160 }} />
          <div style={{ background: '#fff', borderRadius: 12, padding: 24 }}>
            <Typography.Title level={4}>用户名</Typography.Title>
            <Typography.Paragraph>下方内容卡覆盖在头图下半部。transparent NavBar 文字加白色阴影，沉浸式。</Typography.Paragraph>
          </div>
        </div>
      </NavBarPage>
    </div>
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
