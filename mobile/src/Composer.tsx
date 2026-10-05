import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPrefix } from '../../src/shared/schema';
import { useSession } from './notebook';
import { useColors } from './theme';
import { Icon, icons, ListDot } from './ui';
import type { Notebook } from './views';

// Captures into the view's list (the inbox leaves filing to `!list` or Jev). A `!list` prefix
// still wins. Return adds a line; the button saves and keeps the keyboard up for the next one.
export function Composer({
  book,
  list,
  ready,
}: {
  book: Notebook;
  list: string | null;
  ready: boolean;
}) {
  const { client } = useSession();
  const colors = useColors();
  const [draft, setDraft] = useState('');
  // Where the last dump went when that is not this view, or why it was not saved.
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const prefix = listPrefix(draft, book.lists);
  const target = prefix ? book.list(prefix.list) : undefined;
  const blank = draft.trim().length === 0;

  const submit = () => {
    if (blank || !ready) return;
    try {
      const dump = client.capture(draft, list);
      setDraft('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // The inbox shows every open dump, so only a list view can lose sight of a new one.
      setNote(
        list !== null && dump.list !== list
          ? { text: `Saved to ${book.list(dump.list)?.label ?? 'Inbox'}` }
          : null,
      );
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : String(error), error: true });
    }
  };

  return (
    <View
      style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.background }]}
    >
      {note ? (
        <View style={styles.caption}>
          {note.error ? null : <Icon name={icons.checked} size={13} color={colors.tint} />}
          <Text
            style={[styles.captionText, { color: note.error ? colors.destructive : colors.muted }]}
          >
            {note.text}
          </Text>
        </View>
      ) : target ? (
        <View style={styles.caption}>
          <ListDot color={target.color} size={7} />
          <Text style={[styles.captionText, { color: colors.muted }]}>{target.label}</Text>
        </View>
      ) : null}
      <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (text) setNote(null);
          }}
          placeholder="What’s on your mind?"
          placeholderTextColor={colors.faint}
          multiline
          editable={ready}
          accessibilityLabel="New dump"
          style={[styles.input, { color: colors.foreground }]}
        />
        <Pressable
          onPress={submit}
          disabled={blank || !ready}
          accessibilityRole="button"
          accessibilityLabel="Save"
          hitSlop={8}
          style={[styles.send, { backgroundColor: blank ? colors.fill : colors.lime }]}
        >
          <Icon name={icons.send} size={17} color={blank ? colors.faint : colors.onLime} />
        </Pressable>
      </View>
    </View>
  );
}

// Space under the composer that follows the keyboard frame by frame, and the home indicator's
// safe area while the keyboard is closed.
export function KeyboardSpace() {
  const { bottom } = useSafeAreaInsets();
  const { height } = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({ height: Math.max(-height.value, bottom) }));
  return <Animated.View style={style} />;
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6 },
  captionText: { fontSize: 13 },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    maxHeight: 140,
    paddingTop: 5,
    paddingBottom: 5,
    textAlignVertical: 'top',
  },
  send: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
