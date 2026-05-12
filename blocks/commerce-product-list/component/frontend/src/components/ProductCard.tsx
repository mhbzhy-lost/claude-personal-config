import { Button, InputNumber, Rate, Space, Typography } from 'antd';
import { HeartFilled, HeartOutlined, ShoppingCartOutlined } from '@ant-design/icons';
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
    <div className={`cpl-card ${outOfStock ? 'cpl-card-oos' : ''}`} onClick={onClick}>
      <div className="cpl-card-image-wrap">
        <img className="cpl-card-image" src={product.cover_image} alt={product.name} loading="lazy" />
        {outOfStock && <div className="cpl-card-oos-overlay">已售罄</div>}
        {authenticated && (
          <Button
            className="cpl-card-fav-btn"
            type="text"
            size="small"
            shape="circle"
            aria-label={state?.is_favorite ? '取消收藏' : '收藏'}
            icon={state?.is_favorite ? <HeartFilled style={{ color: '#ff4d4f' }} /> : <HeartOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onFavoriteToggle();
            }}
          />
        )}
      </div>
      <div className="cpl-card-body">
        <Typography.Text strong ellipsis className="cpl-card-name">
          {product.name}
        </Typography.Text>
        <div className="cpl-card-price-row">
          <span className="cpl-card-price">{formatPrice(product.price, product.currency)}</span>
          {product.original_price !== null && product.original_price !== undefined && (
            <span className="cpl-card-original-price">
              {formatPrice(product.original_price, product.currency)}
            </span>
          )}
        </div>
        <div className="cpl-card-meta">
          {product.rating !== null && product.rating !== undefined && (
            <Space size={4}>
              <Rate disabled allowHalf value={product.rating} style={{ fontSize: 12 }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                ({formatCount(product.rating_count)})
              </Typography.Text>
            </Space>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            已售 {formatCount(product.sold_count)}
          </Typography.Text>
        </div>
        {authenticated && !outOfStock && (
          <div className="cpl-card-cart" onClick={(e) => e.stopPropagation()}>
            <ShoppingCartOutlined />
            <InputNumber
              size="small"
              min={0}
              max={product.stock}
              value={state?.cart_count ?? 0}
              onChange={(v) => onCartCountChange(Number(v ?? 0))}
              style={{ width: 80 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
