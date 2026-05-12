import { theme } from 'antd';
import type { CSSProperties } from 'react';

export function useTokenStyle(): CSSProperties {
  const { token } = theme.useToken();
  return {
    '--od-color-error': token.colorError,
    '--od-color-primary-bg': token.colorPrimaryBg,
  } as CSSProperties;
}
