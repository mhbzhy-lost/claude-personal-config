import { theme } from 'antd';
import type { CSSProperties } from 'react';

export function useTokenStyle(): CSSProperties {
  const { token } = theme.useToken();
  return {
    '--cpl-color-error': token.colorError,
  } as CSSProperties;
}
