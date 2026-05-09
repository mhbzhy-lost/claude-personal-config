import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp, Layout } from 'antd';
import { ConversationList } from '@imcl/conversation-list';

const DEV_USER_ID = '01KR5Y935AR1JJT0RJ31ABG5YD';

function App() {
  return (
    <Layout style={{ height: '100vh' }}>
      <Layout.Sider width={400} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
        <ConversationList
          config={{
            apiBaseUrl: window.location.origin,
            auth: {
              type: 'header',
              headerName: 'X-Dev-User-Id',
              getValue: () => DEV_USER_ID,
            },
          }}
          onSelect={(c) => console.log('selected', c.id)}
        />
      </Layout.Sider>
      <Layout.Content style={{ background: '#fafafa', padding: 24 }}>
        <p style={{ color: '#999' }}>
          消息列表 · @imcl/conversation-list 演示。一个 import 全搞定。
        </p>
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
