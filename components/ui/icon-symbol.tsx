// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'pencil': 'edit',
  'trash.fill': 'delete',
  'map.fill': 'map',
  'phone.fill': 'phone',
  'globe': 'public',
  'leaf.fill': 'eco',
  'drop.fill': 'opacity',
  'ant.fill': 'bug-report',
  'info.circle.fill': 'info',
  'xmark': 'close',
  'arrow.triangle.2.circlepath': 'sync',
  'checkmark.seal.fill': 'verified',
  'exclamationmark.triangle.fill': 'warning',
  'calendar': 'event',
  'square.dashed': 'grid-view',
  'magnifyingglass': 'search',
  'tag.fill': 'label',
  'doc.text.magnifyingglass': 'find-in-page',
  'rectangle.portrait.and.arrow.right': 'logout',
  'square.and.arrow.up': 'share',
  'figure.walk.circle.fill': 'directions-walk',
  'stop.circle.fill': 'stop',
  'person.fill.checkmark': 'person-add-alt-1',
  'sun.max.fill': 'wb-sunny',
  'cloud.fill': 'cloud',
  'arrow.clockwise': 'refresh',
  'info.circle': 'info-outline',
  'bell.fill': 'notifications',
  'bell.slash.fill': 'notifications-off',
  'xmark.circle.fill': 'cancel',
  'person.crop.circle.badge.exclamationmark': 'person-search',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
