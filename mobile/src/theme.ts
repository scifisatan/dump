import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';

// The web app's surfaces (src/client/styles.css): off-white and charcoal, with lime actions.
// Each list's color is only a category accent.
const light = {
  background: '#f7f7f5',
  foreground: '#30332b',
  card: '#ffffff',
  muted: '#767970',
  faint: '#a6a99e',
  border: '#e5e7df',
  fill: '#f0f1ed',
  lime: '#d8ee79',
  onLime: '#30332b',
  tint: '#526124',
  soft: '#edf2db',
  destructive: '#b84f63',
  synced: '#5f9e4f',
  pending: '#c98a2e',
};
export type Colors = typeof light;
const dark: Colors = {
  background: '#191b17',
  foreground: '#e3e7da',
  card: '#23261f',
  muted: '#a0a792',
  faint: '#6f7566',
  border: '#363d2e',
  fill: '#2b2f25',
  lime: '#d8ee79',
  onLime: '#30332b',
  tint: '#d8ee79',
  soft: '#343d23',
  destructive: '#f293a5',
  synced: '#8cc77b',
  pending: '#e2b062',
};

export const useColors = () => (useColorScheme() === 'dark' ? dark : light);

export function navigationTheme(colors: Colors, scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.background,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
  };
}
