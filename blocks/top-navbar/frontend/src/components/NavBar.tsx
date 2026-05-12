import { LeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { NavBarProps } from '../types';

export function NavBar({
  title,
  onBack,
  hideBack = false,
  right,
  transparent = false,
  zIndex = 1000,
  safeAreaTop = true,
  className,
}: NavBarProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  const cls = [
    'ui-navbar',
    transparent ? 'ui-navbar-transparent' : '',
    safeAreaTop ? 'ui-navbar-safe-area' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} style={{ zIndex }} role="navigation" aria-label="顶部导航">
      <div className="ui-navbar-inner">
        <div className="ui-navbar-left">
          {!hideBack && (
            <Button
              type="text"
              size="large"
              icon={<LeftOutlined />}
              onClick={handleBack}
              aria-label="返回"
              className="ui-navbar-back"
            />
          )}
        </div>
        <div className="ui-navbar-title" aria-live="polite">
          {typeof title === 'string' || typeof title === 'number' ? (
            <span className="ui-navbar-title-text">{title}</span>
          ) : (
            title
          )}
        </div>
        <div className="ui-navbar-right">{right}</div>
      </div>
    </div>
  );
}
