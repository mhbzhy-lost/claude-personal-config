import { View, Text, Image } from '@tarojs/components';
import { Button } from '@antmjs/vantui';
import type { ProductWithState } from '../types';
import { formatCount, formatPrice } from '../utils/format';

interface Props {
  product: ProductWithState;
  authenticated: boolean;
  onFavoriteToggle: () => void;
  onCartCountChange: (count: number) => void;
  onClick: () => void;
}

export function ProductCard({
  product,
  authenticated,
  onFavoriteToggle,
  onCartCountChange,
  onClick,
}: Props) {
  const state = product.user_state ?? null;
  const outOfStock = product.stock === 0;

  return (
    <View
      className={`cpl-mp-card ${outOfStock ? 'cpl-mp-card--oos' : ''}`}
      onClick={onClick}
    >
      <View className='cpl-mp-card__image-wrap'>
        <Image
          className='cpl-mp-card__image'
          src={product.cover_image}
          mode='aspectFill'
          lazyLoad
        />
        {outOfStock && (
          <View className='cpl-mp-card__oos-overlay'>
            <Text>已售罄</Text>
          </View>
        )}
        {authenticated && (
          <View
            className='cpl-mp-card__fav-btn'
            aria-label={state?.is_favorite ? '取消收藏' : '收藏'}
            onClick={(e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              onFavoriteToggle();
            }}
          >
            <Text style={{ fontSize: '16px' }}>
              {state?.is_favorite ? '❤' : '♡'}
            </Text>
          </View>
        )}
      </View>

      <View className='cpl-mp-card__body'>
        <Text className='cpl-mp-card__name'>{product.name}</Text>
        <View className='cpl-mp-card__price-row'>
          <Text className='cpl-mp-card__price'>
            {formatPrice(product.price, product.currency)}
          </Text>
          {product.original_price !== null && product.original_price !== undefined && (
            <Text className='cpl-mp-card__original-price'>
              {formatPrice(product.original_price, product.currency)}
            </Text>
          )}
        </View>
        <View className='cpl-mp-card__meta'>
          {product.rating !== null && product.rating !== undefined ? (
            <View className='cpl-mp-card__rating'>
              <Text style={{ color: '#faad14', fontSize: '12px' }}>
                {'★'.repeat(Math.round(product.rating))}{'☆'.repeat(5 - Math.round(product.rating))}
              </Text>
              <Text className='cpl-mp-card__rating-text'>
                {product.rating.toFixed(1)}({formatCount(product.rating_count)})
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Text className='cpl-mp-card__sold'>已售 {formatCount(product.sold_count)}</Text>
        </View>

        {authenticated && !outOfStock && (
          <View
            className='cpl-mp-card__cart'
            onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
            aria-label='购物车'
          >
            <Text style={{ fontSize: '14px', marginRight: '6px' }}>🛒</Text>
            <View className='cpl-mp-card__cart-controls'>
              <Button
                size='small'
                disabled={state?.cart_count === 0}
                onClick={() => onCartCountChange(Math.max(0, (state?.cart_count ?? 0) - 1))}
                style={{ width: '28px', height: '28px', padding: '0', lineHeight: '28px', fontSize: '16px', minWidth: '28px' }}
              >
                <Text>−</Text>
              </Button>
              <Text style={{ minWidth: '24px', textAlign: 'center', fontSize: '13px' }}>
                {state?.cart_count ?? 0}
              </Text>
              <Button
                size='small'
                type='primary'
                disabled={state?.cart_count >= product.stock}
                onClick={() => onCartCountChange(Math.min(product.stock, (state?.cart_count ?? 0) + 1))}
                style={{ width: '28px', height: '28px', padding: '0', lineHeight: '28px', fontSize: '16px', minWidth: '28px' }}
              >
                <Text>+</Text>
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
