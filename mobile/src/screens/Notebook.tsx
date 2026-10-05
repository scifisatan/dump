import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import type { ScreenProps } from '../App';
import { Composer, KeyboardSpace } from '../Composer';
import { DumpRow, failed } from '../DumpRow';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import { EmptyState, headerItems, icons, type HeaderItem } from '../ui';
import { dumpsIn, notebook, placeTitle, prefixFor, rows, unfiled, type Row } from '../views';

// One view (the inbox, a list, or Done): dumps grouped by day with the newest at the bottom, and a
// composer pinned below them, as on the web and the Mac.
export function NotebookScreen({ navigation, route }: ScreenProps<'Notebook'>) {
  const { place, reveal } = route.params;
  const { client } = useSession();
  const snapshot = useSnapshot();
  const colors = useColors();
  const book = notebook(snapshot);
  const list = place.kind === 'list' ? book.list(place.id) : undefined;
  const gone = snapshot.ready && place.kind === 'list' && !list;
  const data = rows(dumpsIn(place, book));
  const sortable = place.kind === 'inbox' ? unfiled(book).length : 0;
  const done = book.done.length;
  const listRef = useRef<FlatList<Row>>(null);
  const [highlight, setHighlight] = useState(reveal);

  // A list deleted here or on another device leaves its view.
  useEffect(() => {
    if (gone) navigation.popTo('Home');
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
    navigation.setOptions({ title, ...headerItems(items, colors) });
  }, [navigation, title, sortable, done, place, client, colors]);

  // After a search, start at the dump that was chosen.
  const revealIndex = reveal ? data.findIndex((row) => row.key === reveal) : -1;
  const [initialReveal] = useState(revealIndex);
  useEffect(() => {
    if (initialReveal < 0) return;
    const frame = requestAnimationFrame(() =>
      listRef.current?.scrollToIndex({ index: initialReveal, viewPosition: 0.5, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [initialReveal]);

  return (
    <View style={styles.screen}>
      {!snapshot.ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
          <Text style={{ color: colors.muted }}>Opening your notebook…</Text>
        </View>
      ) : data.length === 0 ? (
        <Empty place={place.kind} prefix={list ? prefixFor(list) : null} />
      ) : (
        <FlatList
          ref={listRef}
          inverted
          data={data}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <Text style={[styles.day, { color: colors.muted }]}>{item.label}</Text>
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
              () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }),
              50,
            );
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.content}
        />
      )}
      {/* Done holds only finished dumps, so it has no composer. */}
      {place.kind === 'done' ? (
        <KeyboardSpace />
      ) : (
        <>
          <Composer
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

function Empty({ place, prefix }: { place: 'inbox' | 'list' | 'done'; prefix: string | null }) {
  if (place === 'done')
    return (
      <EmptyState
        icon={icons.done}
        title="Small wins will live here."
        message="Check off a thought when you’re finished with it."
      />
    );
  if (place === 'list')
    return (
      <EmptyState
        icon={icons.move}
        title="Room for something good."
        message={`Dump something here, or type ${prefix ?? '!list'} anywhere.`}
      />
    );
  return (
    <EmptyState
      icon={icons.inbox}
      title="A clear inbox. A clearer head."
      message="Drop a thought, a link, or that thing you don’t want to forget."
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
});
