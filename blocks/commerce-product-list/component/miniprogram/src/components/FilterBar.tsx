import { View, Text, Image, Input } from '@tarojs/components';
import { Button, Checkbox, Picker } from '@antmjs/vantui';
import { useState } from 'react';
import type { ProductFilters, SortKey } from '../types';
import './../styles/index.scss';

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
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerType, setPickerType] = useState<'category' | 'sort'>('sort');

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === (filters.sort ?? 'created_desc'))?.label ?? '最新';

  const categoryColumns = categories?.map((c) => ({ text: c.label, value: c.value })) ?? [];
  const sortColumns = SORT_OPTIONS.map((o) => ({ text: o.label, value: o.value }));

  const openPicker = (type: 'category' | 'sort') => {
    setPickerType(type);
    setPickerVisible(true);
  };

  return (
    <View className='cpl-mp-filter-bar'>
      <View className='cpl-mp-filter-bar__search'>
        <Input
          placeholder='搜索商品'
          value={filters.q ?? ''}
          onInput={(e: { detail: { value: string } }) => onChange({ q: e.detail.value || undefined })}
          style={{ flex: 1, fontSize: '13px', height: '32px', padding: '0 10px', background: '#f5f5f5', borderRadius: '4px' }}
        />
        {(filters.q) ? (
          <Text
            style={{ paddingLeft: '8px', color: '#999', fontSize: '16px' }}
            onClick={() => onChange({ q: undefined })}
          >
            ✕
          </Text>
        ) : null}
      </View>

      <View className='cpl-mp-filter-bar__row'>
        {categories && categories.length > 0 && (
          <Button
            size='small'
            plain
            onClick={() => openPicker('category')}
            className='cpl-mp-filter-bar__chip'
          >
            {categories.find((c) => c.value === filters.category)?.label ?? locale.filterCategory ?? '分类'}
          </Button>
        )}

        <View className='cpl-mp-filter-bar__price'>
          <Input
            placeholder='最低'
            type='number'
            value={filters.price_min !== undefined ? String(filters.price_min / 100) : ''}
            onInput={(e: { detail: { value: string } }) => onChange({
              price_min: e.detail.value ? Math.round(Number(e.detail.value) * 100) : undefined,
            })}
            style={{ width: '70px', height: '28px', fontSize: '12px', padding: '0 6px', background: '#f5f5f5', borderRadius: '4px' }}
          />
          <Text style={{ margin: '0 4px', color: '#999', fontSize: '12px' }}>—</Text>
          <Input
            placeholder='最高'
            type='number'
            value={filters.price_max !== undefined ? String(filters.price_max / 100) : ''}
            onInput={(e: { detail: { value: string } }) => onChange({
              price_max: e.detail.value ? Math.round(Number(e.detail.value) * 100) : undefined,
            })}
            style={{ width: '70px', height: '28px', fontSize: '12px', padding: '0 6px', background: '#f5f5f5', borderRadius: '4px' }}
          />
        </View>

        <View className='cpl-mp-filter-bar__checkbox'>
          <Checkbox
            checked={filters.in_stock_only ?? false}
            onChange={(e: { detail: boolean }) => onChange({ in_stock_only: e.detail || undefined })}
            checkedColor='#1677ff'
          >
            {locale.filterInStock ?? '仅有货'}
          </Checkbox>
        </View>

        <Button
          size='small'
          plain
          onClick={() => openPicker('sort')}
          className='cpl-mp-filter-bar__chip'
        >
          {currentSortLabel}
        </Button>
      </View>

      {pickerVisible && (
        <Picker
          show={pickerVisible}
          columns={pickerType === 'category' ? categoryColumns : sortColumns}
          onClose={() => setPickerVisible(false)}
          onConfirm={(e: { detail: { value: { value: string } } }) => {
            const val = e.detail.value?.value;
            if (pickerType === 'category') {
              onChange({ category: val || undefined });
            } else {
              onChange({ sort: val as SortKey });
            }
            setPickerVisible(false);
          }}
        />
      )}
    </View>
  );
}
