import { NavBar } from './NavBar';
import type { NavBarPageProps } from '../types';

export function NavBarPage({
  children,
  background = '#fff',
  ...navBarProps
}: NavBarPageProps) {
  return (
    <div className="ui-navbar-page" style={{ background }}>
      <NavBar {...navBarProps} />
      <div className="ui-navbar-page-content">{children}</div>
    </div>
  );
}
