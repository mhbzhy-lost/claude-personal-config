import { useCallback } from 'react';
import { App, Button, Col, Empty, Result, Row, Skeleton, Spin } from 'antd';
import { CardFlow } from '@cf/card-flow';
import type { CardFlowMode, ResponsiveColumns } from '@cf/card-flow';
import { FilterBar } from './FilterBar';
import { ProductCard } from './ProductCard';
import { useProducts } from '../hooks/useProducts';
import { useTokenStyle } from '../utils/tokenStyle';
import type { BlockConfig, ProductFilters, ProductWithState } from '../types';

export interface ProductListProps {
  config: BlockConfig;
  /** Optional initial filters (e.g. pre-set category). */
  initialFilters?: ProductFilters;
  /** Called when the user clicks a product. */
  onSelect?: (p: ProductWithState) => void;
  /** Override default empty render. */
  renderEmpty?: () => React.ReactNode;
  /**
   * Card layout mode (forwarded to CardFlow).
   * - 'grid' (default): equal-height grid, classic catalog
   * - 'waterfall': 2-column masonry, ideal for image-heavy / variable-height
   * - 'single': one card per row, mobile-style feed
   */
  layout?: CardFlowMode;
  /**
   * Column count (forwarded to CardFlow; ignored when `layout='single'`).
   * Default: `{ xs: 2, sm: 3, md: 4, lg: 4, xl: 6 }`.
   */
  columns?: number | ResponsiveColumns;
}

const STYLE_HOST: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#fafafa',
};

const STYLE_TOOLBAR: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f0f0f0',
  background: '#fff',
};

export function ProductList({
  config,
  initialFilters,
  onSelect,
  renderEmpty,
  layout = 'grid',
  columns,
}: ProductListProps) {
  const products = useProducts(config, initialFilters);
  const { message } = App.useApp();
  const tokenStyle = useTokenStyle();

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (products.loading || !products.hasMore) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
        void products.loadMore();
      }
    },
    [products],
  );

  const locale = config.locale ?? {};
  const authenticated = !!config.auth && !!products.me;

  const initialLoading = products.loading && products.items.length === 0;
  const errorEmpty = products.error && products.items.length === 0;

  if (errorEmpty) {
    return (
      <div className="cpl-list" style={{ ...STYLE_HOST, ...tokenStyle }}>
        <div style={STYLE_TOOLBAR}>
          <FilterBar
            filters={products.filters}
            onChange={products.setFilters}
            categories={config.categories}
            locale={locale}
          />
        </div>
        <Result
          status="error"
          title={locale.error ?? '加载失败'}
          subTitle={products.error?.message}
          extra={
            <Button type="primary" onClick={() => void products.refresh()}>
              {locale.retry ?? '重试'}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="cpl-list" style={{ ...STYLE_HOST, ...tokenStyle }}>
      <CardFlow<ProductWithState>
        items={products.items}
        getItemId={(p) => p.id}
        renderItem={(p) => (
          <ProductCard
            product={p}
            authenticated={authenticated}
            onClick={() => onSelect?.(p)}
            onFavoriteToggle={() =>
              products
                .setFavorite(p.id, !p.user_state?.is_favorite)
                .catch((e) => message.error((e as Error).message))
            }
            onCartCountChange={(count) =>
              products
                .setCartCount(p.id, count)
                .catch((e) => message.error((e as Error).message))
            }
          />
        )}
        mode={layout}
        columns={columns}
        gap={16}
        header={
          <div style={STYLE_TOOLBAR}>
            <FilterBar
              filters={products.filters}
              onChange={products.setFilters}
              categories={config.categories}
              locale={locale}
            />
          </div>
        }
        emptyState={
          initialLoading ? (
            <div style={{ padding: 16, width: '100%' }}>
              <Row gutter={[16, 16]}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Col key={i} xs={12} sm={8} md={6}>
                    <Skeleton.Image style={{ width: '100%', height: 180 }} />
                    <Skeleton paragraph={{ rows: 2 }} active />
                  </Col>
                ))}
              </Row>
            </div>
          ) : (
            (renderEmpty?.() ?? <Empty description={locale.empty ?? '暂无商品'} />)
          )
        }
        footer={
          <>
            {products.loading && products.items.length > 0 && (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <Spin />
              </div>
            )}
            {!products.hasMore && products.items.length > 0 && (
              <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 13 }}>
                没有更多了 · 共 {products.total} 件
              </div>
            )}
          </>
        }
        loading={products.loading}
        onScroll={onScroll}
        ariaLabel="商品列表"
      />
    </div>
  );
}
