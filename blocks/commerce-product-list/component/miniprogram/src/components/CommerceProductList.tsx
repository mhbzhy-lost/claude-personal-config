import { View, Text } from '@tarojs/components';
import { Loading } from '@antmjs/vantui';
import { useCallback } from 'react';
import { CardFlow } from '@cf/card-flow-mp';
import type { CardFlowMode, ResponsiveColumns } from '@cf/card-flow-mp';
import { FilterBar } from './FilterBar';
import { ProductCard } from './ProductCard';
import { useProducts } from '../hooks/useProducts';
import type { BlockConfig, ProductFilters, ProductWithState } from '../types';

export interface CommerceProductListProps {
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

export function CommerceProductList({
  config,
  initialFilters,
  onSelect,
  renderEmpty,
  layout = 'grid',
  columns,
}: CommerceProductListProps) {
  const products = useProducts(config, initialFilters);

  const onScroll = useCallback(
    (e: { scrollTop: number; scrollHeight: number }) => {
      const { scrollTop, scrollHeight } = e;
      const clientHeight = 600; // approximate
      if (products.loading || !products.hasMore) return;
      if (scrollTop + clientHeight >= scrollHeight - 240) {
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
    <View className='cpl-mp-list' aria-label='商品列表'>
        <View className='cpl-mp-list__toolbar'>
          <FilterBar
            filters={products.filters}
            onChange={products.setFilters}
            categories={config.categories}
            locale={locale}
          />
        </View>
        <View className='cpl-mp-list__error'>
          <View className='cpl-mp-list__error-text'>
            {locale.error ?? '加载失败'}
          </View>
          <View className='cpl-mp-list__error-sub'>
            {products.error?.message}
          </View>
          <View
            className='cpl-mp-list__retry'
            onClick={() => void products.refresh()}
          >
            {locale.retry ?? '重试'}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className='cpl-mp-list'>
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
                .catch(() => undefined)
            }
            onCartCountChange={(count) =>
              products
                .setCartCount(p.id, count)
                .catch(() => undefined)
            }
          />
        )}
        mode={layout}
        columns={columns}
        gap={16}
        header={
          <View className='cpl-mp-list__toolbar'>
            <FilterBar
              filters={products.filters}
              onChange={products.setFilters}
              categories={config.categories}
              locale={locale}
            />
          </View>
        }
        emptyState={
          initialLoading ? (
            <View className='cpl-mp-list__skeleton'>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} className='cpl-mp-list__skeleton-item' />
              ))}
            </View>
          ) : (
            (renderEmpty?.() ?? (
              <View className='cpl-mp-list__empty'>
                <Text>{locale.empty ?? '暂无商品'}</Text>
              </View>
            ))
          )
        }
        footer={
          <>
            {products.loading && products.items.length > 0 && (
              <View className='cpl-mp-list__loading'>
                <Loading />
              </View>
            )}
            {!products.hasMore && products.items.length > 0 && (
              <View className='cpl-mp-list__end'>
                <Text>没有更多了 · 共 {products.total} 件</Text>
              </View>
            )}
          </>
        }
        loading={products.loading}
        onScroll={onScroll}
        height='100vh'
      />
    </View>
  );
}


