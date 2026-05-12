import type { ReactNode } from 'react';

export interface NavBarProps {
  /** Page title — string or any ReactNode (e.g. with icon). */
  title?: ReactNode;
  /** Custom click handler for the back button. Default: `history.back()`. */
  onBack?: () => void;
  /** Hide the back button entirely (e.g. on root-level pages). */
  hideBack?: boolean;
  /** Right-side slot. Common: search / share / more buttons. */
  right?: ReactNode;
  /** Transparent navbar — for immersive headers. Default false. */
  transparent?: boolean;
  /** Override z-index. Default 1000. */
  zIndex?: number;
  /** Apply iOS safe-area-inset-top as padding. Default true. */
  safeAreaTop?: boolean;
  /** Add CSS class to the root element. */
  className?: string;
}

export interface NavBarPageProps extends NavBarProps {
  /** Page content rendered below the navbar. */
  children: ReactNode;
  /** Background color for the page area (under navbar). Default '#fff'. */
  background?: string;
}
