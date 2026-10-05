import { useLayoutEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScreenProps } from '../App';
import { DumpRow } from '../DumpRow';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import {
  EmptyState,
  headerItems,
  Icon,
  icons,
  ListDot,
  Row,
  Section,
  syncLabel,
  syncTint,
} from '../ui';
import { Menu } from '../menu';
import { notebook, search, type Place } from '../views';
import { confirmDeleteList } from './Notebook';

// The notebook's views, as the Mac sidebar has them: the inbox, the lists and Done, with search
// across everything.
export function Home({ navigation }: ScreenProps<'Home'>) {
  const { client, profile } = useSession();
  const snapshot = useSnapshot();
  const colors = useColors();
  const book = notebook(snapshot);
  const [query, setQuery] = useState('');
  const results = search(query, book);
  const searching = query.trim().length > 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: 'Search',
        hideWhenScrolling: false,
        onChangeText: (event) => setQuery(event.nativeEvent.text),
        onCancelButtonPress: () => setQuery(''),
        textColor: colors.foreground,
        tintColor: colors.tint,
      },
      ...headerItems(
        [
          {
            kind: 'button',
            label: 'Settings',
            icon: icons.settings,
            onPress: () => navigation.navigate('Settings'),
          },
        ],
        colors,
      ),
    });
  }, [navigation, colors]);

  const show = (place: Place, reveal?: string) => navigation.push('Notebook', { place, reveal });

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
              icon={icons.inbox}
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
  const sync = snapshot.sync;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Section>
        <Row onPress={() => show({ kind: 'inbox' })} last>
          <Icon name={icons.inbox} size={20} color={colors.tint} />
          <Text style={[styles.label, { color: colors.foreground }]}>Inbox</Text>
          {count(book.open.length)}
          <Icon name={icons.chevron} size={13} color={colors.faint} />
        </Row>
      </Section>
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
      <Section
        footer={
          snapshot.syncError && sync !== 'synced'
            ? snapshot.syncError
            : (profile.server?.baseUrl ??
              'Connect your server in Settings to sync with your other devices.')
        }
      >
        <Row
          onPress={() => navigation.navigate('Settings')}
          last
          accessibilityLabel="Sync settings"
        >
          <View style={[styles.status, { backgroundColor: syncTint(sync, colors) }]} />
          <Text style={[styles.label, { color: colors.foreground }]}>{syncLabel(sync)}</Text>
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
  status: { width: 9, height: 9, borderRadius: 4.5, marginHorizontal: 5.5 },
  noResults: { paddingTop: 80 },
});
