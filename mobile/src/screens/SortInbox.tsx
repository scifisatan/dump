import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScreenProps } from '../App';
import { failed } from '../DumpRow';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import { Button, ListDot } from '../ui';
import { notebook, unfiled } from '../views';

// Sort inbox, as on the web (TriageDialog.tsx): one unfiled dump at a time. Dumps Jev is still
// sorting are left to it.
export function SortInbox({ navigation }: ScreenProps<'SortInbox'>) {
  const { client } = useSession();
  const book = notebook(useSnapshot());
  const colors = useColors();
  const [skipped, setSkipped] = useState(0);
  const queue = unfiled(book);
  const current = queue.length > 0 ? queue[skipped % queue.length] : undefined;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <Button title="Done" onPress={() => navigation.goBack()} />,
    });
  }, [navigation]);

  const act = (work: () => void) => {
    try {
      work();
      void Haptics.selectionAsync();
    } catch (error) {
      failed(error);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground }]}>A little sorting session.</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {queue.length === 0
            ? 'Every thought has a home. A little lighter.'
            : `${queue.length} ${queue.length === 1 ? 'thought' : 'thoughts'} to give a home. There’s no hurry.`}
        </Text>
      </View>
      {current ? (
        <>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text selectable style={[styles.text, { color: colors.foreground }]}>
              {current.text}
            </Text>
          </View>
          <View style={styles.lists}>
            {book.lists.map((list) => (
              <Pressable
                key={list.id}
                onPress={() => act(() => client.file(current.id, list.id))}
                accessibilityRole="button"
                accessibilityLabel={`File in ${list.label}`}
                style={({ pressed }) => [
                  styles.list,
                  {
                    backgroundColor: pressed ? colors.soft : colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ListDot color={list.color} size={9} />
                <Text style={[styles.listLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {list.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Button
              title="Remove"
              kind="destructive"
              onPress={() => act(() => client.remove(current.id))}
            />
            <Button title="Skip" onPress={() => setSkipped((count) => count + 1)} />
          </View>
        </>
      ) : (
        <Button title="Back to My Notebook" kind="prominent" onPress={() => navigation.goBack()} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 20 },
  heading: { gap: 4 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 20 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 18,
  },
  text: { fontSize: 20, lineHeight: 27 },
  lists: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  list: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: '45%',
    flexGrow: 1,
  },
  listLabel: { fontSize: 16, flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
});
