import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import { ProductList } from '@cpl/product-list';

const DEMO_USER_ID = '01KR9D7VAY4FYDVK7C2DZH8KM0';

const CATEGORIES = [
  { value: 'clothing/men', label: '男装' },
  { value: 'clothing/women', label: '女装' },
  { value: 'electronics/phones', label: '手机' },
  { value: 'electronics/laptops', label: '笔记本' },
  { value: 'home/furniture', label: '家具' },
  { value: 'home/decor', label: '家居' },
  { value: 'food/snacks', label: '零食' },
  { value: 'beauty/skincare', label: '护肤' },
  { value: 'sports/outdoor', label: '运动' },
  { value: 'books/fiction', label: '小说' },
];

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <ProductList
        config={{
          apiBaseUrl: window.location.origin,
          auth: {
            type: 'header',
            headerName: 'X-Dev-User-Id',
            getValue: () => DEMO_USER_ID,
          },
          categories: CATEGORIES,
        }}
        onSelect={(p) => console.log('clicked', p.name)}
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
