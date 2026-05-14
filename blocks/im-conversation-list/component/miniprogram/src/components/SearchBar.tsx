import { View, Input } from '@tarojs/components';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = '搜索' }: Props) {
  return (
    <View className='imcl-search'>
      <Input
        className='imcl-search-input'
        placeholder={placeholder}
        value={value}
        onInput={(e) => onChange(e.detail.value)}
        confirmType='search'
        aria-label='搜索会话'
      />
    </View>
  );
}
