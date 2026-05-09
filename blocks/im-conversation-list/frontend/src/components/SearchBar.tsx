import { Input } from 'antd';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = '搜索' }: Props) {
  return (
    <Input.Search
      placeholder={placeholder}
      value={value}
      allowClear
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
