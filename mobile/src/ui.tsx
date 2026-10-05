import type {
  NativeStackHeaderItemMenuAction,
  NativeStackHeaderItemMenuSubmenu,
  NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { SyncState } from '../../src/core/client';
import { Menu, type MenuItem } from './menu';
import { useColors, type Colors } from './theme';

// One icon for both platforms: an SF Symbol on iOS, a Material Symbol on Android.
export type IconName = { ios: SFSymbol; android: AndroidSymbol };

export const icons = {
  inbox: { ios: 'tray', android: 'inbox' },
  done: { ios: 'checkmark.circle', android: 'task_alt' },
  open: { ios: 'circle', android: 'radio_button_unchecked' },
  checked: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  settings: { ios: 'gearshape', android: 'settings' },
  add: { ios: 'plus', android: 'add' },
  remove: { ios: 'trash', android: 'delete' },
  edit: { ios: 'pencil', android: 'edit' },
  sort: { ios: 'sparkles', android: 'auto_awesome' },
  send: { ios: 'arrow.up', android: 'arrow_upward' },
  link: { ios: 'arrow.up.right', android: 'north_east' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  check: { ios: 'checkmark', android: 'check' },
  move: { ios: 'folder', android: 'drive_file_move' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
} satisfies Record<string, IconName>;

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      style={[{ width: size, height: size }, style]}
    />
  );
}

// A list's color dot; hollow for the inbox.
export function ListDot({ color, size = 8 }: { color?: string; size?: number }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ?? 'transparent',
        borderWidth: color ? 0 : 1,
        borderColor: colors.muted,
      }}
    />
  );
}

// The Dump mark: a lime tile with the asterisk (public/favicon.svg).
export function Mark({ size = 40 }: { size?: number }) {
  const unit = size / 64;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: 18 * unit,
        borderCurve: 'continuous',
        backgroundColor: '#d8ee79',
        transform: [{ rotate: '-5deg' }],
      }}
    >
      {[90, 30, -30].map((degrees) => (
        <View
          key={degrees}
          style={{
            position: 'absolute',
            left: 32 * unit - 17 * unit,
            top: 32 * unit - 3.5 * unit,
            width: 34 * unit,
            height: 7 * unit,
            borderRadius: 3.5 * unit,
            backgroundColor: '#252629',
            transform: [{ rotate: `${degrees}deg` }],
          }}
        />
      ))}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: IconName;
  title: string;
  message: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={34} color={colors.faint} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: colors.muted }]}>{message}</Text>
    </View>
  );
}

// Sync state in one line, as the Mac shows it.
export function syncLabel(sync: SyncState) {
  switch (sync) {
    case 'synced':
      return 'Synced';
    case 'syncing':
    case 'connecting':
      return 'Syncing…';
    case 'offline':
      return 'Offline · saved on this phone';
    case 'error':
      return 'Sync paused · retrying';
    case 'local':
      return 'On this phone only';
    case 'signed-out':
      return 'Signed out · enter the owner key';
  }
}

export function syncTint(sync: SyncState, colors: Colors) {
  switch (sync) {
    case 'synced':
      return colors.synced;
    case 'syncing':
    case 'connecting':
    case 'error':
      return colors.pending;
    case 'offline':
    case 'local':
      return colors.faint;
    case 'signed-out':
      return colors.destructive;
  }
}

// Grouped rows, like iOS Settings.
export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      {title ? <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text> : null}
      <View style={[styles.sectionBody, { backgroundColor: colors.card }]}>{children}</View>
      {typeof footer === 'string' ? (
        <Text style={[styles.sectionFooter, { color: colors.muted }]}>{footer}</Text>
      ) : (
        footer
      )}
    </View>
  );
}

export function Row({
  children,
  onPress,
  last,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  last?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const border = last
    ? null
    : { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth };
  if (!onPress) return <View style={[styles.row, border, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [
        styles.row,
        border,
        pressed && Platform.OS === 'ios' && { backgroundColor: colors.fill },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'plain',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'plain' | 'prominent' | 'destructive';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const text: TextStyle =
    kind === 'prominent'
      ? { color: colors.onLime, fontWeight: '600' }
      : { color: kind === 'destructive' ? colors.destructive : colors.tint };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        kind === 'prominent' && [styles.prominent, { backgroundColor: colors.lime }],
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, text]}>{title}</Text>
    </Pressable>
  );
}

// Header buttons and menus: native bar items on iOS, the same actions as icons on Android.
export type HeaderItem =
  | { kind: 'button'; label: string; icon: IconName; onPress: () => void; prominent?: boolean }
  | {
      kind: 'menu';
      label: string;
      icon: IconName;
      items: MenuItem[];
      onSelect: (id: string) => void;
    };

export function headerItems(items: HeaderItem[], colors: Colors): NativeStackNavigationOptions {
  if (Platform.OS === 'ios')
    return {
      unstable_headerRightItems: () =>
        items.map((item) =>
          item.kind === 'button'
            ? {
                type: 'button',
                label: item.label,
                icon: { type: 'sfSymbol', name: item.icon.ios },
                onPress: item.onPress,
                variant: item.prominent ? 'prominent' : 'plain',
                tintColor: item.prominent ? colors.lime : undefined,
              }
            : {
                type: 'menu',
                label: item.label,
                icon: { type: 'sfSymbol', name: item.icon.ios },
                menu: { items: item.items.map((entry) => nativeMenuEntry(entry, item.onSelect)) },
              },
        ),
    };
  return {
    headerRight: () => (
      <View style={styles.headerItems}>
        {items.map((item) =>
          item.kind === 'button' ? (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              hitSlop={8}
              style={styles.headerButton}
            >
              <Icon name={item.icon} size={22} color={colors.foreground} />
            </Pressable>
          ) : (
            <Menu key={item.label} actions={item.items} onSelect={item.onSelect}>
              <View
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={styles.headerButton}
              >
                <Icon name={item.icon} size={22} color={colors.foreground} />
              </View>
            </Menu>
          ),
        )}
      </View>
    ),
  };
}

function nativeMenuEntry(
  entry: MenuItem,
  onSelect: (id: string) => void,
): NativeStackHeaderItemMenuAction | NativeStackHeaderItemMenuSubmenu {
  const icon = entry.icon && { type: 'sfSymbol' as const, name: entry.icon.ios };
  if (entry.items)
    return {
      type: 'submenu',
      label: entry.title,
      icon,
      items: entry.items.map((child) => nativeMenuEntry(child, onSelect)),
    };
  return {
    type: 'action',
    label: entry.title,
    icon,
    destructive: entry.destructive,
    state: entry.checked ? 'on' : undefined,
    onPress: () => onSelect(entry.id),
  };
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  emptyMessage: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  section: { marginHorizontal: 16, marginTop: 22 },
  sectionTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginLeft: 16,
    marginBottom: 7,
  },
  sectionBody: { borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  sectionFooter: { fontSize: 13, lineHeight: 18, marginHorizontal: 16, marginTop: 7 },
  row: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prominent: {
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: { fontSize: 17 },
  headerItems: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  headerButton: { padding: 4 },
});
