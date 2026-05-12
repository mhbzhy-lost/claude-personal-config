import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import { ChatDetail } from '@chat/im-chat-detail';

const ME_ID = '01KRDRHKBNYMSWHD26Y84YWVNG';   // Alice
const PEER_ID = '01KRDRHKBPNZE25ZW0VSZ1ZJBQ'; // Bob

function App() {
  return (
    <div style={{ maxWidth: 480, height: '100vh', margin: '0 auto', boxShadow: '0 0 20px rgba(0,0,0,0.05)' }}>
      <ChatDetail
        config={{
          apiBaseUrl: window.location.origin,
          auth: { type: 'header', headerName: 'X-Dev-User-Id', getValue: () => ME_ID },
        }}
        peerId={PEER_ID}
      />
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
