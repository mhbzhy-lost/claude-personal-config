import { View } from '@tarojs/components';
import { NavBar } from './NavBar';
import type { NavBarPageProps } from '../types';

export function NavBarPage({ children, background = '#fff', ...navBarProps }: NavBarPageProps) {
  return (
    <View className='tn-mp-navbar-page' style={{ background }}>
      <NavBar {...navBarProps} />
      <View className='tn-mp-navbar-page__content'>{children}</View>
    </View>
  );
}
