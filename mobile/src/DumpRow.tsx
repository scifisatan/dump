import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { Dump } from '../../src/shared/schema';
import { useSession } from './notebook';
import { useColors } from './theme';
import { Menu, type MenuItem } from './menu';
import { Icon, icons, ListDot, type IconName } from './ui';
import { host, placeOf, placeTitle, timeLabel, type Notebook, type Place } from './views';

export const failed = (error: unknown) =>
  Alert.alert('That didn’t work', error instanceof Error ? error.message : String(error));

// One dump. The circle marks it done; a long press opens every action. Swiping right marks it
// done, and swiping left offers Remove, which needs a tap because there is no undo.
export function DumpRow({
  dump,
  book,
  showList,
  highlighted,
  reveal,
}: {
  dump: Dump;
  book: Notebook;
  // Where dumps of several lists mix, each shows its own.
  showList: boolean;
  highlighted?: boolean;
  // In search results: leaves the search for the dump's own view.
  reveal?: (place: Place) => void;
}) {
  const { client } = useSession();
  const colors = useColors();
  const swipe = useRef<SwipeableMethods>(null);
  const list = showList ? book.list(dump.list) : undefined;
  const sorting = book.sorting.has(dump.id);

  const act = (work: () => void) => {
    try {
      work();
    } catch (error) {
      failed(error);
    }
  };
  const toggle = () => {
    void Haptics.selectionAsync();
    act(() => client.setDone(dump.id, !dump.done));
  };
  const openLink = () => {
    if (dump.url) void WebBrowser.openBrowserAsync(dump.url).catch(failed);
  };

  const actions: MenuItem[] = [
    ...(dump.url ? [{ id: 'link', title: 'Open Link', icon: icons.link }] : []),
    ...(reveal ? [{ id: 'reveal', title: `Show in ${placeTitle(placeOf(dump), book)}` }] : []),
    {
      id: 'done',
      title: dump.done ? 'Mark as Not Done' : 'Mark as Done',
      icon: dump.done ? icons.open : icons.checked,
    },
    {
      id: 'move',
      title: 'Move To',
      icon: icons.move,
      items: [
        { id: 'file:', title: 'Inbox', checked: dump.list === null },
        ...book.lists.map((item) => ({
          id: `file:${item.id}`,
          title: item.label,
          checked: dump.list === item.id,
        })),
      ],
    },
    { id: 'copy', title: 'Copy', icon: icons.copy },
    { id: 'remove', title: 'Remove', icon: icons.remove, destructive: true },
  ];
  const select = (id: string) => {
    if (id === 'link') openLink();
    else if (id === 'reveal') reveal?.(placeOf(dump));
    else if (id === 'done') toggle();
    else if (id === 'copy') void Clipboard.setStringAsync(dump.text);
    else if (id === 'remove') act(() => client.remove(dump.id));
    else if (id.startsWith('file:')) act(() => client.file(dump.id, id.slice(5) || null));
  };

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.5}
      leftThreshold={64}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <SwipeAction
          color={colors.lime}
          tint={colors.onLime}
          icon={dump.done ? icons.open : icons.check}
          label={dump.done ? 'Not Done' : 'Done'}
        />
      )}
      renderRightActions={() => (
        <SwipeAction
          color={colors.destructive}
          tint="#ffffff"
          icon={icons.remove}
          label="Remove"
          onPress={() => act(() => client.remove(dump.id))}
        />
      )}
      onSwipeableOpen={(direction) => {
        if (direction !== SwipeDirection.RIGHT) return;
        toggle();
        swipe.current?.close();
      }}
    >
      <Menu actions={actions} onSelect={select} longPress>
        <View
          style={[styles.row, { backgroundColor: highlighted ? colors.soft : colors.background }]}
          accessible
          accessibilityLabel={dump.text}
          accessibilityActions={[
            { name: 'activate', label: dump.done ? 'Mark as not done' : 'Mark as done' },
            { name: 'remove', label: 'Remove' },
          ]}
          onAccessibilityAction={({ nativeEvent }) =>
            nativeEvent.actionName === 'remove' ? act(() => client.remove(dump.id)) : toggle()
          }
        >
          <Pressable
            onPress={toggle}
            hitSlop={10}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dump.done }}
            accessibilityLabel={dump.done ? 'Mark as not done' : 'Mark as done'}
            style={styles.check}
          >
            <Icon
              name={dump.done ? icons.checked : icons.open}
              size={22}
              color={dump.done ? colors.tint : colors.faint}
            />
          </Pressable>
          <View style={styles.body}>
            <Text
              style={[
                styles.text,
                { color: dump.done ? colors.muted : colors.foreground },
                dump.done && styles.struck,
              ]}
            >
              {dump.text}
            </Text>
            {list || sorting || dump.tags.length > 0 || dump.url ? (
              <View style={styles.meta}>
                {list ? (
                  <View style={styles.chip}>
                    <ListDot color={list.color} size={7} />
                    <Text style={[styles.metaText, { color: colors.muted }]}>{list.label}</Text>
                  </View>
                ) : sorting ? (
                  <Text style={[styles.metaText, { color: colors.muted }]}>Sorting…</Text>
                ) : null}
                {dump.tags.map((tag) => (
                  <Text key={tag} style={[styles.metaText, { color: colors.tint }]}>
                    #{tag}
                  </Text>
                ))}
                {dump.url ? (
                  <Pressable
                    onPress={openLink}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${host(dump.url)}`}
                    hitSlop={6}
                    style={[styles.link, { backgroundColor: colors.fill }]}
                  >
                    <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
                      {host(dump.url)}
                    </Text>
                    <Icon name={icons.link} size={10} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
          <Text style={[styles.time, { color: colors.faint }]}>{timeLabel(dump.created_at)}</Text>
        </View>
      </Menu>
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  color,
  tint,
  icon,
  label,
  onPress,
}: {
  color: string;
  tint: string;
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, { backgroundColor: color }]}
    >
      <Icon name={icon} size={20} color={tint} />
      <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  check: { paddingTop: 1 },
  body: { flex: 1, gap: 5 },
  text: { fontSize: 17, lineHeight: 23 },
  struck: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: 200,
  },
  time: { fontSize: 13, paddingTop: 3, fontVariant: ['tabular-nums'] },
  action: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionLabel: { fontSize: 12, fontWeight: '600' },
});
