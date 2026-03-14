/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#22C55E'; // Vibrant Spring Green
const tintColorDark = '#4ADE80'; // Even lighter for dark mode

export const Colors = {
  light: {
    text: '#334155', // Slate 700 - softer than 800
    background: '#FFFFFF', // Pure White
    tint: tintColorLight,
    icon: '#94A3B8', // Slate 400
    tabIconDefault: '#CBD5E1', // Slate 300
    tabIconSelected: tintColorLight,
    card: '#F8FAFC', // Slate 50 - Very light grey card
    border: '#F1F5F9', // Slate 100 - very soft border
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  dark: {
    text: '#F8FAFC', 
    background: '#111827', // Slightly lighter grey-black (Slate 950/900 mix)
    tint: tintColorDark,
    icon: '#94A3B8',
    tabIconDefault: '#475569',
    tabIconSelected: tintColorDark,
    card: '#1F2937', // Slate 800
    border: '#374151', // Slate 700
    success: '#4ADE80',
    warning: '#FBBF24',
    error: '#F87171',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
