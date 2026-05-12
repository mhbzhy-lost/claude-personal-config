import { useCallback, useRef } from 'react';
import { App, Button, Col, Empty, Result, Row, Skeleton, Spin } from 'antd';
import { FilterBar } from './FilterBar';
import { ProductCard } from './ProductCard';
import { useProducts } from '../hooks/useProducts';
import type { BlockConfig, ProductFilters, ProductWithState } from '../types';

export interface ProductListProps {
  config: BlockConfig;
  /** Optional initial filters (e.g. pre-set category). */
  initialFilters?: ProductFilters;
  /** Called when the user clicks a product. */
  onSelect?: (p: ProductWithState) => void;
  /** Override default empty render. */
  renderEmpty?: () => React.ReactNode;
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

const STYLE_SCROLL: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '16px' };

export function ProductList({
  config,
  initialFilters,
  onSelect,
  renderEmpty,
}: ProductListProps) {
  const products = useProducts(config, initialFilters);
  const { message } = App.useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || products.loading || !products.hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      void products.loadMore();
    }
  }, [products]);

  const locale = config.locale ?? {};
  const authenticated = !!config.auth && !!products.me;

  return (
    <div className="cpl-list" style={STYLE_HOST}>
      <div style={STYLE_TOOLBAR}>
        <FilterBar
          filters={products.filters}
          onChange={products.setFilters}
          categories={config.categories}
          locale={locale}
        />
      </div>
      {products.error && products.items.length === 0 && (
        <Result
          status="error"
          title={locale.error ?? '加载失败'}
          subTitle={products.error.message}
          extra={<Button type="primary" onClick={() => void products.refresh()}>{locale.retry ?? '重试'}</Button>}
        />
      )}
      {products.loading && products.items.length === 0 && (
        <div style={{ padding: 16 }}>
          <Row gutter={[16, 16]}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Col key={i} xs={12} sm={8} md={6}>
                <Skeleton.Image style={{ width: '100%', height: 180 }} />
                <Skeleton paragraph={{ rows: 2 }} active />
              </Col>
            ))}
          </Row>
        </div>
      )}
      {!products.loading && !products.error && products.items.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {renderEmpty?.() ?? <Empty description={locale.empty ?? '暂无商品'} />}
        </div>
      )}
      <div ref={scrollRef} onScroll={onScroll} style={STYLE_SCROLL}>
        <Row gutter={[16, 16]}>
          {products.items.map((p) => (
            <Col key={p.id} xs={12} sm={8} md={6} lg={6} xl={4}>
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
            </Col>
          ))}
        </Row>
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
      </div>
    </div>
  );
}
