import { useState } from 'react';
import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components';
import { useProductDetail } from '../hooks/useProductDetail';
import type { ProductDetailData, ProductDetailProps, ProductSku } from '../types';

function formatPrice(n: number, ccy: string): string {
  if (ccy === 'CNY') return `¥${n.toFixed(2)}`;
  return `${ccy} ${n.toFixed(2)}`;
}

function StarRating({ value }: { value: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Text key={i} className={`pd-star ${i <= value ? 'pd-star-filled' : 'pd-star-empty'}`}>
        {i <= value ? '★' : '☆'}
      </Text>
    );
  }
  return <View className='pd-rating-stars'>{stars}</View>;
}

export function ProductDetail({
  data: dataProp,
  config,
  productId,
  selectedSkuId,
  onSelectSku,
  onAddToCart,
  onBuyNow,
  onSubmitReview,
  className,
  height = '100vh',
}: ProductDetailProps) {
  const fetched = useProductDetail(dataProp ? undefined : config, dataProp ? undefined : productId);
  const data: ProductDetailData | null = dataProp ?? fetched.data;
  const loading = !dataProp && fetched.loading;
  const error = !dataProp ? fetched.error : null;

  const [qty, setQty] = useState(1);
  const [internalSkuId, setInternalSkuId] = useState<string | undefined>();
  const selSkuId = selectedSkuId ?? internalSkuId ?? data?.skus[0]?.id;
  const selectedSku = data?.skus.find((s) => s.id === selSkuId) ?? data?.skus[0];

  const pickSku = (sku: ProductSku) => {
    setInternalSkuId(sku.id);
    onSelectSku?.(sku);
  };

  if (loading) {
    return (
      <View className='pd-shell pd-shell-center'>
        <Text className='pd-loading'>加载中...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className='pd-shell pd-shell-center'>
        <Text className='pd-error'>加载失败: {error?.message ?? '没有可显示的商品数据'}</Text>
        <View className='pd-error-btn' onClick={() => fetched.refresh()}>
          <Text>重试</Text>
        </View>
      </View>
    );
  }

  const ccy = data.currency ?? 'CNY';

  return (
    <View className={['pd-shell', className].filter(Boolean).join(' ')} style={{ height: typeof height === 'number' ? `${height * 2}rpx` : height }}>
      {/* Image Gallery */}
      {data.media.length > 0 && (
        <Swiper
          className='pd-gallery'
          indicatorDots
          indicatorColor='rgba(255,255,255,0.5)'
          indicatorActiveColor='#fff'
          circular
          aria-label='商品图集'
        >
          {data.media.map((m) => (
            <SwiperItem key={m.id}>
              <Image
                className='pd-gallery-img'
                src={m.url}
                mode='aspectFill'
              />
            </SwiperItem>
          ))}
        </Swiper>
      )}

      <View className='pd-info'>
        <Text className='pd-title'>{data.title}</Text>
        {data.subtitle && (
          <Text className='pd-subtitle'>{data.subtitle}</Text>
        )}
        {data.rating !== undefined && (
          <View className='pd-rating'>
            <StarRating value={Math.round(data.rating)} />
            <Text className='pd-rating-text'>
              {data.rating.toFixed(1)} · {data.rating_count ?? 0} 评价
            </Text>
          </View>
        )}
        {selectedSku && (
          <View className='pd-price'>
            <Text className='pd-price-amount'>{formatPrice(selectedSku.price, ccy)}</Text>
            {selectedSku.stock === 0 && <Text className='pd-tag pd-tag-error'>售罄</Text>}
            {selectedSku.stock > 0 && selectedSku.stock < 10 && (
              <Text className='pd-tag pd-tag-warn'>仅剩 {selectedSku.stock} 件</Text>
            )}
          </View>
        )}

        {/* SKU Selector */}
        <View className='pd-skus'>
          <Text className='pd-section-label'>选择规格</Text>
          <View className='pd-sku-list'>
            {data.skus.map((sku) => {
              const active = sku.id === selSkuId;
              return (
                <View
                  key={sku.id}
                  className={`pd-sku ${active ? 'pd-sku-active' : ''} ${sku.stock === 0 ? 'pd-sku-disabled' : ''}`}
                  onClick={() => sku.stock > 0 && pickSku(sku)}
                  aria-label={`${sku.label}${sku.stock === 0 ? ' 售罄' : ''}`}
                >
                  <Text>{sku.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Quantity */}
        <View className='pd-qty'>
          <Text className='pd-section-label'>数量</Text>
          <View className='pd-qty-stepper'>
            <View
              className={`pd-qty-btn ${qty <= 1 ? 'pd-qty-btn-disabled' : ''}`}
              onClick={() => qty > 1 && setQty(qty - 1)}
              aria-label='减少数量'
            >
              <Text>-</Text>
            </View>
            <Text className='pd-qty-val'>{qty}</Text>
            <View
              className={`pd-qty-btn ${(!selectedSku || qty >= selectedSku.stock) ? 'pd-qty-btn-disabled' : ''}`}
              onClick={() => selectedSku && qty < selectedSku.stock && setQty(qty + 1)}
              aria-label='增加数量'
            >
              <Text>+</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className='pd-actions'>
          {onAddToCart && (
            <View
              className={`pd-btn pd-btn-cart ${(!selectedSku || selectedSku.stock === 0) ? 'pd-btn-disabled' : ''}`}
              onClick={() => selectedSku && selectedSku.stock > 0 && void onAddToCart(selectedSku, qty)}
              aria-label='加入购物车'
            >
              <Text>加入购物车</Text>
            </View>
          )}
          {onBuyNow && (
            <View
              className={`pd-btn pd-btn-buy ${(!selectedSku || selectedSku.stock === 0) ? 'pd-btn-disabled' : ''}`}
              onClick={() => selectedSku && selectedSku.stock > 0 && void onBuyNow(selectedSku, qty)}
              aria-label='立即购买'
            >
              <Text>立即购买</Text>
            </View>
          )}
        </View>
      </View>

      {/* Description */}
      {data.description && (
        <View className='pd-section'>
          <Text className='pd-section-title'>商品介绍</Text>
          <Text className='pd-desc'>{data.description}</Text>
        </View>
      )}

      {/* Reviews */}
      {data.reviews && data.reviews.length > 0 && (
        <View className='pd-section'>
          <Text className='pd-section-title'>评价 · {data.rating_count ?? data.reviews.length}</Text>
          {data.reviews.map((r) => (
            <View key={r.id} className='pd-review'>
              <View className='pd-review-head'>
                <Text className='pd-review-author'>{r.author}</Text>
                <StarRating value={r.rating} />
              </View>
              <Text className='pd-review-body'>{r.body}</Text>
            </View>
          ))}
          {onSubmitReview && (
            <View className='pd-review-submit' onClick={() => onSubmitReview({ rating: 5, body: '' })}>
              <Text>写评价</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
