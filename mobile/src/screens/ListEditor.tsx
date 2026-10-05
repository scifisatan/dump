import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ScreenProps } from '../App';
import { useSession, useSnapshot } from '../notebook';
import { useColors } from '../theme';
import { Button } from '../ui';
import { notebook } from '../views';
import { confirmDeleteList } from './Notebook';

// The web app's palette (ListEditor.tsx).
const COLORS = ['#9b84d6', '#c49651', '#6395c3', '#849c74', '#cd7f86', '#849299'];

// Creates a list, or renames, recolors or deletes one.
export function ListEditor({ navigation, route }: ScreenProps<'ListEditor'>) {
  const { client } = useSession();
  const book = notebook(useSnapshot());
  const colors = useColors();
  const existing = route.params.id ? book.list(route.params.id) : undefined;
  const [label, setLabel] = useState(existing?.label ?? '');
  const [color, setColor] = useState(existing?.color.toLowerCase() ?? COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const name = label.trim();
  // A list colored elsewhere keeps its color as a choice.
  const palette = COLORS.includes(color) ? COLORS : [...COLORS, color];

  const save = () => {
    if (!name) return;
    try {
      const list = client.saveList(name, color, existing?.id);
      navigation.goBack();
      if (!existing) navigation.push('Notebook', { place: { kind: 'list', id: list.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {existing ? 'Make it yours.' : 'A home for something.'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {existing
            ? 'Update your list’s name and color.'
            : 'Start with a name. You can change it whenever you like.'}
        </Text>
      </View>
      <TextInput
        value={label}
        onChangeText={(text) => {
          setLabel(text);
          setError(null);
        }}
        maxLength={40}
        autoFocus={!existing}
        placeholder="Books, weekend plans, someday…"
        placeholderTextColor={colors.faint}
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="List name"
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />
      <View style={styles.palette} accessibilityRole="radiogroup" accessibilityLabel="Color">
        {palette.map((value) => (
          <Pressable
            key={value}
            onPress={() => setColor(value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: color === value }}
            accessibilityLabel={`Color ${value}`}
            hitSlop={4}
            style={[
              styles.swatchRing,
              { borderColor: color === value ? colors.foreground : 'transparent' },
            ]}
          >
            <View style={[styles.swatch, { backgroundColor: value }]} />
          </Pressable>
        ))}
      </View>
      {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}
      <Button
        title={existing ? 'Save' : 'Create List'}
        kind="prominent"
        onPress={save}
        disabled={!name}
      />
      <View style={styles.footer}>
        {existing ? (
          <Button
            title="Delete List…"
            kind="destructive"
            onPress={() =>
              confirmDeleteList(existing.label, () => {
                client.deleteList(existing.id);
                navigation.goBack();
              })
            }
          />
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
  input: {
    fontSize: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: { padding: 3, borderRadius: 20, borderWidth: 2 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
