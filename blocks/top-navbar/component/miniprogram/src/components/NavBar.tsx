import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { NavBarProps } from '../types';

/** Return arrow icon as text node — mini programs can't render @ant-design/icons. */
function BackArrow() {
  return <Text style={{ fontSize: '18px', lineHeight: '1' }}>←</Text>;
}

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
    } else {
      Taro.navigateBack().catch(() => {
        // fallback if no page to go back to
        Taro.switchTab({ url: '/pages/index/index' }).catch(() => {});
      });
    }
  };

  const clsBase = 'tn-mp-navbar';
  const cls = [
    clsBase,
    transparent ? `${clsBase}--transparent` : '',
    safeAreaTop ? `${clsBase}--safe` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View className={cls} style={{ zIndex }}>
      <View className={`${clsBase}__inner`}>
        <View className={`${clsBase}__left`}>
          {!hideBack && (
            <View className={`${clsBase}__back`} onClick={handleBack} aria-label="返回">
              <BackArrow />
            </View>
          )}
        </View>
        <View className={`${clsBase}__title`}>
          {typeof title === 'string' || typeof title === 'number' ? (
            <Text className={`${clsBase}__title-text`}>{title}</Text>
          ) : (
            title
          )}
        </View>
        <View className={`${clsBase}__right`}>{right}</View>
      </View>
    </View>
  );
}
