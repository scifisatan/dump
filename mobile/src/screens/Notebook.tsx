import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DAY_EXAMPLES, dumpsIn, needsAttention, notebook } from '../../../src/core/views';
import { prefixFor } from '../../../src/shared/schema';
import type { ScreenProps } from '../App';
import { Composer, KeyboardSpace, type ComposerHandle } from '../Composer';
import { DumpRow, failed } from '../DumpRow';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import { EmptyState, headerItems, Icon, icons, Mark, syncLabel, type HeaderItem } from '../ui';
import { homeRows, placeTitle, rows, type Row } from '../views';

export function NotebookScreen({ navigation, route }: ScreenProps<'Notebook'>) {
  const { place, reveal } = route.params;
  const { client } = useSession();
  const snapshot = useSnapshot();
  const colors = useColors();
  const book = notebook(snapshot);
  const list = place.kind === 'list' ? book.list(place.id) : undefined;
  const gone = snapshot.ready && place.kind === 'list' && !list;
  const home = place.kind === 'home';
  const now = Date.now();
  const data = home ? homeRows(book, now) : rows(dumpsIn(place, book), now);
  const sortable = home ? book.unfiled.length : 0;
  const done = book.done.length;
  const sync = snapshot.sync;
  const storageError = snapshot.storageError;
  const listRef = useRef<FlatList<Row>>(null);
  const composer = useRef<ComposerHandle>(null);
  const [highlight, setHighlight] = useState(reveal);

  useEffect(() => {
    if (gone) navigation.popToTop();
  }, [gone, navigation]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(undefined), 1600);
    return () => clearTimeout(timer);
  }, [highlight]);

  const title = placeTitle(place, book);
  useLayoutEffect(() => {
    const items: HeaderItem[] = [];
    if (sortable > 0)
      items.push({
        kind: 'button',
        label: 'Sort Inbox',
        icon: icons.sort,
        onPress: () => navigation.navigate('SortInbox'),
      });
    if (place.kind === 'list')
      items.push({
        kind: 'menu',
        label: 'List',
        icon: icons.more,
        items: [
          { id: 'edit', title: 'Edit List…', icon: icons.edit },
          { id: 'delete', title: 'Delete List…', icon: icons.remove, destructive: true },
        ],
        onSelect: (id) =>
          id === 'edit'
            ? navigation.navigate('ListEditor', { id: place.id })
            : confirmDeleteList(title, () => client.deleteList(place.id)),
      });
    if (place.kind === 'done' && done > 0)
      items.push({
        kind: 'button',
        label: 'Clear Done',
        icon: icons.remove,
        onPress: () =>
          Alert.alert(
            done === 1 ? 'Clear 1 done dump?' : `Clear ${done} done dumps?`,
            'They’re removed from every device. This can’t be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear Done',
                style: 'destructive',
                onPress: () => {
                  try {
                    client.clearDone();
                  } catch (error) {
                    failed(error);
                  }
                },
              },
            ],
          ),
      });
    const alert = needsAttention({ sync, storageError });
    items.push(
      {
        kind: 'button',
        label: 'Search',
        icon: icons.search,
        onPress: () => navigation.navigate('Search'),
      },
      {
        kind: 'button',
        label: alert ? `Settings: ${storageError ?? syncLabel(sync)}` : 'Settings',
        icon: icons.settings,
        alert,
        onPress: () => navigation.navigate('Settings'),
      },
    );
    navigation.setOptions({
      title: home ? '' : title,
      headerLeft: home ? () => <Mark size={28} /> : undefined,
      ...headerItems(items, colors),
    });
  }, [navigation, title, home, sortable, done, sync, storageError, place, client, colors]);

  const revealIndex = reveal ? data.findIndex((row) => row.key === reveal) : -1;
  const todayIndex = home ? data.findIndex((row) => row.type === 'today') : -1;
  const [anchor] = useState(
    revealIndex >= 0
      ? { index: revealIndex, viewPosition: 0.5 }
      : todayIndex >= 0
        ? { index: todayIndex, viewPosition: 1 }
        : null,
  );
  const anchored = useRef(false);
  const settle = () => {
    if (!anchor || anchored.current) return;
    anchored.current = true;
    listRef.current?.scrollToIndex({ ...anchor, animated: false });
  };

  return (
    <View style={styles.screen}>
      {!snapshot.ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
          <Text style={{ color: colors.muted }}>Opening your notebook…</Text>
        </View>
      ) : place.kind !== 'home' && data.length === 0 ? (
        <Empty place={place.kind} prefix={list ? prefixFor(list) : null} />
      ) : (
        <FlatList
          ref={listRef}
          inverted
          data={data}
          keyExtractor={(row) => row.key}
          // Render down to the anchor row, so it can be measured and scrolled to.
          initialNumToRender={Math.max(10, (anchor?.index ?? 0) + 2)}
          onContentSizeChange={() => requestAnimationFrame(settle)}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <Text
                style={[styles.day, { color: item.overdue ? colors.destructive : colors.muted }]}
              >
                {item.label}
              </Text>
            ) : item.type === 'today' ? (
              <View style={[styles.today, { borderTopColor: colors.border }]}>
                <Text style={[styles.todayTitle, { color: colors.foreground }]}>Today</Text>
                <Text style={[styles.todaySummary, { color: colors.muted }]}>{item.summary}</Text>
              </View>
            ) : item.type === 'quiet' ? (
              <View style={[styles.quiet, { borderColor: colors.border }]}>
                <Text style={[styles.quietTitle, { color: colors.foreground }]}>A clear day.</Text>
                <Text style={[styles.quietMessage, { color: colors.muted }]}>
                  Nothing due and nothing dumped yet. Give a dump a day, and it waits for you here
                  when the day comes.
                </Text>
                <View style={styles.examples}>
                  {DAY_EXAMPLES.map((example) => (
                    <Pressable
                      key={example}
                      onPress={() => composer.current?.fill(example)}
                      accessibilityRole="button"
                      accessibilityHint="Puts it in the composer"
                      style={[
                        styles.example,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      <Icon name={icons.calendar} size={12} color={colors.muted} />
                      <Text style={[styles.exampleText, { color: colors.muted }]}>{example}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : item.type === 'done' ? (
              <Pressable
                onPress={() => navigation.push('Notebook', { place: { kind: 'done' } })}
                accessibilityRole="link"
                style={styles.doneLink}
              >
                <Text style={[styles.doneText, { color: colors.muted }]}>{item.count} done</Text>
                <Icon name={icons.chevron} size={11} color={colors.muted} />
              </Pressable>
            ) : (
              <DumpRow
                dump={item.dump}
                book={book}
                showList={place.kind !== 'list'}
                highlighted={item.key === highlight}
              />
            )
          }
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
            setTimeout(
              () =>
                listRef.current?.scrollToIndex({
                  index,
                  viewPosition: anchor?.viewPosition ?? 0.5,
                  animated: false,
                }),
              50,
            );
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.content}
        />
      )}
      {place.kind === 'done' ? (
        <KeyboardSpace />
      ) : (
        <>
          <Composer
            ref={composer}
            book={book}
            list={place.kind === 'list' ? place.id : null}
            ready={snapshot.ready}
          />
          <KeyboardSpace />
        </>
      )}
    </View>
  );
}

export function confirmDeleteList(label: string, remove: () => void) {
  Alert.alert(
    `Delete “${label}”?`,
    'Its dumps go back to the inbox to be sorted again. This can’t be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete List',
        style: 'destructive',
        onPress: () => {
          try {
            remove();
          } catch (error) {
            failed(error);
          }
        },
      },
    ],
  );
}

function Empty({ place, prefix }: { place: 'list' | 'done'; prefix: string | null }) {
  if (place === 'done')
    return (
      <EmptyState
        icon={icons.done}
        title="Small wins will live here."
        message="Check off a thought when you’re finished with it."
      />
    );
  return (
    <EmptyState
      icon={icons.move}
      title="Room for something good."
      message={`Dump something here, or type ${prefix ?? '!list'} anywhere.`}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  content: { paddingVertical: 8 },
  day: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
  },
  today: {
    marginTop: 18,
    paddingTop: 18,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  todayTitle: { fontSize: 22, fontWeight: '700' },
  todaySummary: { fontSize: 14 },
  quiet: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 6,
  },
  quietTitle: { fontSize: 17, fontWeight: '600' },
  quietMessage: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  examples: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  exampleText: { fontSize: 13 },
  doneLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  doneText: { fontSize: 13 },
});
