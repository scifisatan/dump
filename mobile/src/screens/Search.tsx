import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import type { ScreenProps } from '../App';
import { DumpRow } from '../DumpRow';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import { EmptyState, Icon, icons, ListDot, Row, Section } from '../ui';
import { Menu } from '../menu';
import { notebook, search, type Place } from '../views';
import { confirmDeleteList } from './Notebook';

// Search across everything, and the way to the lists and Done, as the web app's ⌘K. Choosing a
// view replaces this screen, so going back from it returns home.
export function Search({ navigation }: ScreenProps<'Search'>) {
  const { client } = useSession();
  const snapshot = useSnapshot();
  const colors = useColors();
  const book = notebook(snapshot);
  const [query, setQuery] = useState('');
  const bar = useRef<SearchBarCommands>(null);
  const results = search(query, book);
  const searching = query.trim().length > 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: bar,
        placeholder: 'Search',
        hideWhenScrolling: false,
        autoFocus: true,
        onChangeText: (event) => setQuery(event.nativeEvent.text),
        onCancelButtonPress: () => setQuery(''),
        textColor: colors.foreground,
        tintColor: colors.tint,
      },
    });
  }, [navigation, colors]);

  // The search bar takes focus once the screen has slid in (autoFocus covers only Android).
  useEffect(() => {
    const timer = setTimeout(() => bar.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  const show = (place: Place, reveal?: string) => navigation.replace('Notebook', { place, reveal });

  if (searching)
    return (
      <FlatList
        data={results}
        keyExtractor={(dump) => dump.id}
        renderItem={({ item }) => (
          <DumpRow dump={item} book={book} showList reveal={(place) => show(place, item.id)} />
        )}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.noResults}>
            <EmptyState
              icon={icons.search}
              title={`No results for “${query.trim()}”`}
              message="Check the spelling or try a new search."
            />
          </View>
        }
      />
    );

  const count = (value: number) => (
    <Text style={[styles.count, { color: colors.muted }]}>{value > 0 ? value : ''}</Text>
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Section title="Lists">
        {book.lists.map((list) => (
          <Menu
            key={list.id}
            longPress
            actions={[
              { id: 'edit', title: 'Edit List…', icon: icons.edit },
              { id: 'delete', title: 'Delete List…', icon: icons.remove, destructive: true },
            ]}
            onSelect={(id) =>
              id === 'edit'
                ? navigation.navigate('ListEditor', { id: list.id })
                : confirmDeleteList(list.label, () => client.deleteList(list.id))
            }
          >
            <Row onPress={() => show({ kind: 'list', id: list.id })}>
              <View style={styles.dot}>
                <ListDot color={list.color} size={10} />
              </View>
              <Text style={[styles.label, { color: colors.foreground }]}>{list.label}</Text>
              {count(book.open.filter((dump) => dump.list === list.id).length)}
              <Icon name={icons.chevron} size={13} color={colors.faint} />
            </Row>
          </Menu>
        ))}
        <Row
          onPress={() => navigation.navigate('ListEditor', {})}
          last
          accessibilityLabel="New List"
        >
          <Icon name={icons.add} size={20} color={colors.tint} />
          <Text style={[styles.label, { color: colors.tint }]}>New List</Text>
        </Row>
      </Section>
      <Section>
        <Row onPress={() => show({ kind: 'done' })} last>
          <Icon name={icons.done} size={20} color={colors.tint} />
          <Text style={[styles.label, { color: colors.foreground }]}>Done</Text>
          {count(book.done.length)}
          <Icon name={icons.chevron} size={13} color={colors.faint} />
        </Row>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  label: { flex: 1, fontSize: 17 },
  count: { fontSize: 17, fontVariant: ['tabular-nums'] },
  dot: { width: 20, alignItems: 'center' },
  noResults: { paddingTop: 80 },
});
