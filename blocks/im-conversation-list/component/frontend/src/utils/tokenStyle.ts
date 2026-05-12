import { theme } from 'antd';
import type { CSSProperties } from 'react';

export function useTokenStyle(): CSSProperties {
  const { token } = theme.useToken();
  return {
    '--imcl-color-warning': token.colorWarning,
    '--imcl-color-primary-bg': token.colorPrimaryBg,
  } as CSSProperties;
}
