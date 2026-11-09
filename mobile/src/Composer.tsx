import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dueLabel, type Notebook } from '../../src/core/views';
import { parseDue } from '../../src/shared/due';
import { listPrefix } from '../../src/shared/schema';
import { useSession } from './notebook';
import { useColors } from './theme';
import { Icon, icons, ListDot } from './ui';

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
  const latest = useRef('');
  const type = (text: string) => {
    latest.current = text;
    setDraft(text);
  };
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);
  const prefix = listPrefix(draft, book.lists);
  const target = prefix ? book.list(prefix.list) : undefined;
  const read = parseDue(draft, Date.now());
  const due = read === skipped ? null : read;
  const blank = draft.trim().length === 0;

  // iOS applies a pending autocorrection as the tap on the button ends, and that change reaches JS
  // just after the press. The button saves a frame later, so the dump gets the corrected word and
  // the day it names, and the composer clears after the correction instead of being refilled by it.
  const save = () => {
    const text = latest.current;
    if (text.trim().length === 0 || !ready) return;
    const day = parseDue(text, Date.now());
    try {
      const dump = client.capture(text, list, day === skipped ? null : day);
      type('');
      setSkipped(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setNote(
        list !== null && dump.list !== list
          ? { text: `Saved to ${book.listLabel(dump.list)}` }
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
      ) : target || due ? (
        <View style={styles.caption}>
          {target ? (
            <>
              <ListDot color={target.color} size={7} />
              <Text style={[styles.captionText, { color: colors.muted }]}>{target.label}</Text>
            </>
          ) : null}
          {due ? (
            <View style={[styles.due, { backgroundColor: colors.fill }]}>
              <Icon name={icons.calendar} size={12} color={colors.muted} />
              <Text
                style={[styles.captionText, { color: colors.muted }]}
                accessibilityLabel={`Due ${dueLabel(due, Date.now())}`}
              >
                {dueLabel(due, Date.now())}
              </Text>
              <Pressable
                onPress={() => setSkipped(due)}
                accessibilityRole="button"
                accessibilityLabel="Save without a date"
                hitSlop={10}
              >
                <Icon name={icons.close} size={11} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            type(text);
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
          onPress={() => requestAnimationFrame(save)}
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
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 7,
    paddingRight: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
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
