import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp, Divider, Typography } from 'antd';
import { CommentsThread } from '@ct/comment-thread';

const DEMO_USER_ID = '01KRDTH9Y1DGZ04MTGZSWHV2DQ';
const FAKE_ARTICLE_ID = '01KRDTH9Y1DGZ04MTGZSWHV2DR';

function MockArticlePage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
      <Typography.Title>评论 widget 演示</Typography.Title>
      <Typography.Paragraph type="secondary">
        这个页面模拟"宿主"——例如博客文章 / 商品详情 / 订单详情。
        下方 <code>&lt;CommentsThread&gt;</code> 嵌入在宿主组件树里，
        通过 <code>resourceType</code> + <code>resourceId</code> 锚定。
      </Typography.Paragraph>
      <Typography.Paragraph>
        这是一段假装的文章正文。Lorem ipsum dolor sit amet, consectetur
        adipiscing elit. 业务方做的页面会在这种地方渲染真正的文章。
      </Typography.Paragraph>
      <Divider />
      <CommentsThread
        config={{
          apiBaseUrl: window.location.origin,
          auth: {
            type: 'header',
            headerName: 'X-Dev-User-Id',
            getValue: () => DEMO_USER_ID,
          },
        }}
        resourceType="article"
        resourceId={FAKE_ARTICLE_ID}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <AntdApp>
        <MockArticlePage />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>
);
