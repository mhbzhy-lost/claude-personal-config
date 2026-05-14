import type { ReactNode } from 'react';

export interface NavBarProps {
  title?: ReactNode;
  onBack?: () => void;
  hideBack?: boolean;
  right?: ReactNode;
  transparent?: boolean;
  zIndex?: number;
  safeAreaTop?: boolean;
  className?: string;
}

export interface NavBarPageProps extends NavBarProps {
  children: ReactNode;
  background?: string;
}
