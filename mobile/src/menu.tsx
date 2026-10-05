import { MenuView, type MenuAction } from '@react-native-menu/menu';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSyncExternalStore, type ReactNode } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import type { IconName } from './ui';

export type MenuItem = {
  id: string;
  title: string;
  icon?: IconName;
  destructive?: boolean;
  checked?: boolean;
  items?: MenuItem[];
};

// Expo Go lacks the native menu module, so there the same actions open in an action sheet.
const nativeMenus = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// A native menu: UIMenu on iOS, a popup menu on Android. `longPress` opens it as a context menu.
export function Menu(props: {
  actions: MenuItem[];
  onSelect: (id: string) => void;
  longPress?: boolean;
  children: ReactNode;
}) {
  return nativeMenus ? <NativeMenu {...props} /> : <SheetMenu {...props} />;
}

function NativeMenu({
  actions,
  onSelect,
  longPress,
  children,
}: {
  actions: MenuItem[];
  onSelect: (id: string) => void;
  longPress?: boolean;
  children: ReactNode;
}) {
  return (
    <MenuView
      actions={actions.map(menuAction)}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      shouldOpenOnLongPress={longPress}
    >
      {children}
    </MenuView>
  );
}

function menuAction(entry: MenuItem): MenuAction {
  return {
    id: entry.id,
    title: entry.title,
    image: Platform.OS === 'ios' ? entry.icon?.ios : undefined,
    state: entry.checked ? 'on' : undefined,
    attributes: entry.destructive ? { destructive: true } : undefined,
    subactions: entry.items?.map(menuAction),
  };
}

function SheetMenu({
  actions,
  onSelect,
  longPress,
  children,
}: {
  actions: MenuItem[];
  onSelect: (id: string) => void;
  longPress?: boolean;
  children: ReactNode;
}) {
  const open = () => showSheet({ actions, onSelect });
  if (!longPress) return <Pressable onPress={open}>{children}</Pressable>;
  // A gesture, not a Pressable, so the buttons inside keep their own taps.
  const gesture = Gesture.LongPress().minDuration(400).runOnJS(true).onStart(open);
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}

type Sheet = { title?: string; actions: MenuItem[]; onSelect: (id: string) => void };

let sheet: Sheet | null = null;
const listeners = new Set<() => void>();
const setSheet = (next: Sheet | null) => {
  sheet = next;
  listeners.forEach((listener) => listener());
};

// The system action sheet on iOS. Android has none, so SheetHost draws one.
function showSheet(next: Sheet) {
  if (Platform.OS !== 'ios') return setSheet(next);
  const { actions, title } = next;
  const destructive = actions.findIndex((action) => action.destructive);
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map(label), 'Cancel'],
      cancelButtonIndex: actions.length,
      destructiveButtonIndex: destructive < 0 ? undefined : destructive,
    },
    (index) => choose(next, actions[index]),
  );
}

function choose(from: Sheet, action: MenuItem | undefined) {
  if (!action) return;
  if (action.items)
    showSheet({ title: action.title, actions: action.items, onSelect: from.onSelect });
  else from.onSelect(action.id);
}

const label = (action: MenuItem) => (action.checked ? `✓ ${action.title}` : action.title);

export function SheetHost() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => sheet,
  );
  const colors = useColors();
  const { bottom } = useSafeAreaInsets();
  if (nativeMenus || Platform.OS === 'ios') return null;
  return (
    <Modal
      visible={current !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setSheet(null)}
    >
      <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: bottom + 8 }]}>
          {current?.title ? (
            <Text style={[styles.title, { color: colors.muted }]}>{current.title}</Text>
          ) : null}
          {current?.actions.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => {
                setSheet(null);
                choose(current, action);
              }}
              android_ripple={{ color: colors.fill }}
              style={styles.option}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: action.destructive ? colors.destructive : colors.foreground },
                ]}
              >
                {label(action)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000059' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  title: { fontSize: 13, paddingHorizontal: 20, paddingVertical: 8 },
  option: { paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { fontSize: 17 },
});
