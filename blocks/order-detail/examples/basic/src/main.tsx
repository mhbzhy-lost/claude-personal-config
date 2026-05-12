import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp, Layout } from 'antd';
import { OrderList, OrderDetail } from '@od/order-detail';

const DEMO_USER_ID = '01KRD7H5SBR3PR8R4DTH7XZG3W';

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const config = {
    apiBaseUrl: window.location.origin,
    auth: { type: 'header' as const, headerName: 'X-Dev-User-Id', getValue: () => DEMO_USER_ID },
  };
  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider width={420} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
        <OrderList config={config} selectedId={selectedId} onSelect={(o) => setSelectedId(o.id)} />
      </Layout.Sider>
      <Layout.Content>
        <OrderDetail config={config} orderId={selectedId} />
      </Layout.Content>
    </Layout>
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
