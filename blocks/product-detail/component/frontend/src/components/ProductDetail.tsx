import { useState } from 'react';
import { Button, InputNumber, Rate, Result, Space, Tag, Typography } from 'antd';
import { useProductDetail } from '../hooks/useProductDetail';
import type { ProductDetailData, ProductDetailProps, ProductSku } from '../types';

function formatPrice(n: number, ccy: string): string {
  if (ccy === 'CNY') return `¥${n.toFixed(2)}`;
  return `${ccy} ${n.toFixed(2)}`;
}

/**
 * Product detail "shape" component — image gallery placeholder, SKU picker,
 * action buttons, review list, and meta section. Visual structure only;
 * host is expected to:
 *   1. Provide `data` (or `config + productId` to fetch from the stub backend)
 *   2. Wire `onAddToCart` / `onBuyNow` / `onSubmitReview` to real business
 *
 * This block is intentionally a **shape reference** for "商品详情" pages.
 * Real business rules (inventory, payment, shipping, ...) belong in the host.
 */
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
  height = '100%',
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
      <div className="pd-shell pd-shell--center" style={{ height }}>
        <Typography.Text type="secondary">加载中…</Typography.Text>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={['pd-shell', className].filter(Boolean).join(' ')} style={{ height }}>
        <Result
          status="error"
          title="加载失败"
          subTitle={error?.message ?? '没有可显示的商品数据'}
          extra={<Button onClick={() => fetched.refresh()}>重试</Button>}
        />
      </div>
    );
  }

  const ccy = data.currency ?? 'CNY';
  const cover = data.media[0]?.url;

  return (
    <div className={['pd-shell', className].filter(Boolean).join(' ')} style={{ height }}>
      <div className="pd-grid">
        {/* Image gallery (host can replace with media-gallery block for richer UX) */}
        <div className="pd-gallery" aria-label="商品图集">
          {cover ? (
            <img className="pd-gallery__cover" src={cover} alt={data.media[0].alt ?? '商品图'} />
          ) : (
            <div className="pd-gallery__placeholder" aria-hidden />
          )}
          <div className="pd-gallery__thumbs" role="list">
            {data.media.map((m) => (
              <img
                key={m.id}
                className="pd-gallery__thumb"
                src={m.thumb ?? m.url}
                alt={m.alt ?? ''}
                loading="lazy"
              />
            ))}
          </div>
        </div>

        {/* Right panel: title / price / SKU / actions */}
        <div className="pd-info">
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            {data.title}
          </Typography.Title>
          {data.subtitle && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              {data.subtitle}
            </Typography.Text>
          )}
          {data.rating !== undefined && (
            <div className="pd-rating">
              <Rate disabled allowHalf value={data.rating} style={{ fontSize: 14 }} />
              <Typography.Text type="secondary">
                {data.rating.toFixed(1)} · {data.rating_count ?? 0} 评价
              </Typography.Text>
            </div>
          )}
          {selectedSku && (
            <div className="pd-price">
              <span className="pd-price__amount">{formatPrice(selectedSku.price, ccy)}</span>
              {selectedSku.stock === 0 && <Tag color="error">售罄</Tag>}
              {selectedSku.stock > 0 && selectedSku.stock < 10 && (
                <Tag color="warning">仅剩 {selectedSku.stock} 件</Tag>
              )}
            </div>
          )}

          <div className="pd-skus" role="radiogroup" aria-label="选择规格">
            {data.skus.map((sku) => {
              const active = sku.id === selSkuId;
              return (
                <button
                  key={sku.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={'pd-sku' + (active ? ' pd-sku--active' : '')}
                  disabled={sku.stock === 0}
                  onClick={() => pickSku(sku)}
                >
                  {sku.label}
                </button>
              );
            })}
          </div>

          <div className="pd-qty">
            <span style={{ marginRight: 8 }}>数量</span>
            <InputNumber
              min={1}
              max={selectedSku?.stock ?? 1}
              value={qty}
              onChange={(v) => setQty(Number(v ?? 1))}
              disabled={!selectedSku || selectedSku.stock === 0}
            />
          </div>

          <Space size={8} style={{ marginTop: 16 }}>
            {onAddToCart && (
              <Button
                onClick={() => selectedSku && void onAddToCart(selectedSku, qty)}
                disabled={!selectedSku || selectedSku.stock === 0}
              >
                加入购物车
              </Button>
            )}
            {onBuyNow && (
              <Button
                type="primary"
                onClick={() => selectedSku && void onBuyNow(selectedSku, qty)}
                disabled={!selectedSku || selectedSku.stock === 0}
              >
                立即购买
              </Button>
            )}
          </Space>
        </div>
      </div>

      {data.description && (
        <section className="pd-section" aria-label="商品描述">
          <Typography.Title level={5}>商品介绍</Typography.Title>
          <Typography.Paragraph>{data.description}</Typography.Paragraph>
        </section>
      )}

      {data.reviews && data.reviews.length > 0 && (
        <section className="pd-section" aria-label="评价">
          <Typography.Title level={5}>评价 · {data.rating_count ?? data.reviews.length}</Typography.Title>
          <div className="pd-reviews">
            {data.reviews.map((r) => (
              <div key={r.id} className="pd-review">
                <div className="pd-review__head">
                  <span className="pd-review__author">{r.author}</span>
                  <Rate disabled value={r.rating} style={{ fontSize: 12 }} />
                </div>
                <div className="pd-review__body">{r.body}</div>
              </div>
            ))}
          </div>
          {onSubmitReview && (
            <Button type="link" onClick={() => onSubmitReview({ rating: 5, body: '' })}>
              写评价
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
