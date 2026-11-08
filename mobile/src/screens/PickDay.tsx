import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { dueLabel, notebook } from '../../../src/core/views';
import { dayChoices, parseDue } from '../../../src/shared/due';
import type { ScreenProps } from '../App';
import { failed } from '../DumpRow';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import { Button } from '../ui';

export function PickDay({ navigation, route }: ScreenProps<'PickDay'>) {
  const { client } = useSession();
  const book = notebook(useSnapshot());
  const colors = useColors();
  const dump = book.dumps.find((item) => item.id === route.params.id);
  const [text, setText] = useState('');
  const now = Date.now();
  const typed = text.trim() ? parseDue(text, now) : null;
  const { today, tomorrow } = dayChoices(now);

  const set = (due: string | null) => {
    try {
      client.setDue(route.params.id, due);
      navigation.goBack();
    } catch (error) {
      failed(error);
    }
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground }]}>Pick a day.</Text>
        {dump ? (
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={2}>
            {dump.due ? `${dueLabel(dump.due, now)} · ` : ''}
            {dump.text}
          </Text>
        ) : null}
      </View>
      <View style={styles.quick}>
        <Button title="Today" onPress={() => set(today)} />
        <Button title="Tomorrow" onPress={() => set(tomorrow)} />
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        placeholder="friday, oct 24, in 3 days…"
        placeholderTextColor={colors.faint}
        returnKeyType="done"
        onSubmitEditing={() => typed && set(typed)}
        accessibilityLabel="Day"
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />
      <Text
        style={[styles.hint, { color: text.trim() && !typed ? colors.destructive : colors.muted }]}
      >
        {!text.trim()
          ? 'Type a day the way you would in a dump.'
          : typed
            ? dueLabel(typed, now)
            : 'That isn’t a day Dump knows. Try “friday” or “oct 24”.'}
      </Text>
      <Button
        title={typed ? `Move to ${dueLabel(typed, now)}` : 'Move'}
        kind="prominent"
        onPress={() => typed && set(typed)}
        disabled={!typed}
      />
      <View style={styles.footer}>
        {dump?.due ? (
          <Button title="Clear Date" kind="destructive" onPress={() => set(null)} />
        ) : (
          <View />
        )}
        <Button title="Cancel" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: 24, paddingTop: 28, gap: 18 },
  heading: { gap: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 20 },
  quick: { flexDirection: 'row', gap: 24 },
  input: {
    fontSize: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { fontSize: 15, marginTop: -8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
