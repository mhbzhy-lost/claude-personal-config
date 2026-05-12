import { Checkbox, Input, InputNumber, Select, Space } from 'antd';
import type { ProductFilters, SortKey } from '../types';

interface Props {
  filters: ProductFilters;
  onChange: (next: Partial<ProductFilters>) => void;
  categories?: { value: string; label: string }[];
  locale?: {
    filterCategory?: string;
    filterPrice?: string;
    filterInStock?: string;
    sort?: string;
  };
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'created_desc', label: '最新' },
  { value: 'sold_desc', label: '销量' },
  { value: 'price_asc', label: '价格 ↑' },
  { value: 'price_desc', label: '价格 ↓' },
  { value: 'rating_desc', label: '评分' },
];

export function FilterBar({ filters, onChange, categories, locale = {} }: Props) {
  return (
    <Space wrap size={[12, 8]} className="cpl-filter-bar">
      <Input.Search
        placeholder="搜索商品"
        value={filters.q ?? ''}
        allowClear
        onChange={(e) => onChange({ q: e.target.value || undefined })}
        style={{ width: 220 }}
      />
      {categories && categories.length > 0 && (
        <Select
          placeholder={locale.filterCategory ?? '分类'}
          value={filters.category ?? null}
          allowClear
          options={categories}
          onChange={(v) => onChange({ category: v || undefined })}
          style={{ width: 160 }}
        />
      )}
      <Space size={4}>
        <span style={{ color: '#666', fontSize: 13 }}>{locale.filterPrice ?? '价格'}</span>
        <InputNumber
          placeholder="最低"
          min={0}
          value={filters.price_min !== undefined ? filters.price_min / 100 : null}
          onChange={(v) => onChange({ price_min: v != null ? Math.round(Number(v) * 100) : undefined })}
          style={{ width: 90 }}
        />
        <span>–</span>
        <InputNumber
          placeholder="最高"
          min={0}
          value={filters.price_max !== undefined ? filters.price_max / 100 : null}
          onChange={(v) => onChange({ price_max: v != null ? Math.round(Number(v) * 100) : undefined })}
          style={{ width: 90 }}
        />
      </Space>
      <Checkbox
        checked={filters.in_stock_only ?? false}
        onChange={(e) => onChange({ in_stock_only: e.target.checked || undefined })}
      >
        {locale.filterInStock ?? '仅有货'}
      </Checkbox>
      <Select
        value={filters.sort ?? 'created_desc'}
        options={SORT_OPTIONS}
        onChange={(v: SortKey) => onChange({ sort: v })}
        style={{ width: 120 }}
      />
    </Space>
  );
}
