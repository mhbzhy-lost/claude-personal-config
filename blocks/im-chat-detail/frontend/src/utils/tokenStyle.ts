import { theme } from 'antd';
import type { CSSProperties } from 'react';

export function useTokenStyle(): CSSProperties {
  const { token } = theme.useToken();
  return {
    '--chat-color-primary': token.colorPrimary,
    '--chat-color-error': token.colorError,
  } as CSSProperties;
}
