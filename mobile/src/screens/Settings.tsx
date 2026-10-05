import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ScreenProps } from '../App';
import { failed } from '../DumpRow';
import {
  connect,
  inspect,
  signIn,
  switchTo,
  useSession,
  useSnapshot,
  type ServerCheck,
} from '../notebook';
import { originOverride, setOriginOverride, standardOrigin, HOSTED_ORIGIN } from '../origin';
import { readProfiles } from '../profiles';
import { useColors, type Colors } from '../theme';
import { Button, Mark, Row, Section, syncLabel, syncTint } from '../ui';

// Sync and connections, following the web app's rules (ServerSettings.tsx) as the Mac does.
export function Settings({ navigation }: ScreenProps<'Settings'>) {
  const session = useSession();
  const snapshot = useSnapshot();
  const colors = useColors();
  const server = session.profile.server;
  const [switching, setSwitching] = useState(false);
  const others = readProfiles().profiles.filter((profile) => profile.id !== session.profile.id);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <Button title="Done" onPress={() => navigation.goBack()} />,
    });
  }, [navigation]);

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      {session.firstRun ? (
        <View style={[styles.welcome, { backgroundColor: colors.card }]}>
          <Mark size={40} />
          <View style={styles.welcomeText}>
            <Text style={[styles.headline, { color: colors.foreground }]}>Dump is ready</Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Your notes are saved on this phone right away. Connect your server below to sync them
              with your other devices.
            </Text>
          </View>
        </View>
      ) : null}
      {session.openError ? (
        <Text style={[styles.message, { color: colors.destructive }]}>{session.openError}</Text>
      ) : null}

      <Section
        title="Sync"
        footer={snapshot.syncError && snapshot.sync !== 'synced' ? snapshot.syncError : undefined}
      >
        <Row last={!server}>
          <View style={[styles.status, { backgroundColor: syncTint(snapshot.sync, colors) }]} />
          <Text style={[styles.label, { color: colors.foreground }]}>
            {syncLabel(snapshot.sync)}
          </Text>
          {snapshot.sync === 'error' ? (
            <Button title="Retry" onPress={() => void session.client.syncNow()} />
          ) : null}
        </Row>
        {server ? (
          <Row last>
            <Text style={[styles.label, { color: colors.foreground }]}>Server</Text>
            <Text selectable style={[styles.value, { color: colors.muted }]} numberOfLines={1}>
              {server.baseUrl}
            </Text>
          </Row>
        ) : null}
      </Section>

      {server && snapshot.sync === 'signed-out' ? <SignIn colors={colors} /> : null}

      {server ? (
        <Section
          title="Another server"
          footer="Switching opens that server’s own notebook. Notes stay with their server; move them with export and import in the web app."
        >
          {switching ? (
            <ServerConnection action="Switch to This Server" colors={colors} />
          ) : (
            <Row onPress={() => setSwitching(true)} last>
              <Text style={[styles.label, { color: colors.tint }]}>Switch to another server…</Text>
            </Row>
          )}
        </Section>
      ) : (
        <Section
          title="Connect your server"
          footer="This notebook lives only on this phone. Your notes here will be added to the server’s notebook."
        >
          <ServerConnection action="Connect and Sync" colors={colors} />
        </Section>
      )}

      {others.length > 0 ? (
        <Section title="Other notebooks on this phone">
          {others.map((profile, index) => (
            <Row
              key={profile.id}
              last={index === others.length - 1}
              onPress={() => void switchTo(profile).catch(failed)}
              accessibilityLabel={`Open ${profile.server?.baseUrl ?? 'This phone only'}`}
            >
              <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>
                {profile.server ? new URL(profile.server.baseUrl).host : 'This phone only'}
              </Text>
              <Text style={{ color: colors.tint, fontSize: 17 }}>Open</Text>
            </Row>
          ))}
        </Section>
      ) : null}

      <Advanced
        colors={colors}
        server={server?.baseUrl}
        retry={() => void session.client.syncNow()}
      />
    </KeyboardAwareScrollView>
  );
}

// Finds a Dump server, then checks its owner key before anything is saved.
function ServerConnection({ action, colors }: { action: string; colors: Colors }) {
  const [address, setAddress] = useState('');
  const [key, setKey] = useState('');
  const [checked, setChecked] = useState<ServerCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const check = () =>
    void run(async () => {
      setChecked(await inspect(address));
    });
  const join = () =>
    void run(async () => {
      if (checked) await connect(checked, key);
    });

  return (
    <View style={styles.form}>
      <TextInput
        value={address}
        onChangeText={(text) => {
          setAddress(text);
          setChecked(null);
          setError(null);
        }}
        placeholder="https://dump-api.example.com"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        returnKeyType="go"
        onSubmitEditing={check}
        accessibilityLabel="Server address"
        style={[styles.field, { color: colors.foreground, borderColor: colors.border }]}
      />
      {checked ? (
        <>
          <Text style={[styles.body, { color: colors.muted }]}>
            Found a Dump server. Automatic filing {checked.classify ? 'is available' : 'is off'}.
          </Text>
          {checked.auth === 'owner-key' ? (
            <>
              <TextInput
                value={key}
                onChangeText={setKey}
                placeholder="Owner key"
                placeholderTextColor={colors.faint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={join}
                accessibilityLabel="Owner key"
                style={[styles.field, { color: colors.foreground, borderColor: colors.border }]}
              />
              <Button title={action} kind="prominent" onPress={join} disabled={busy || !key} />
            </>
          ) : (
            <Text style={[styles.body, { color: colors.destructive }]}>
              This server has no owner key yet. Set OWNER_KEY on it, redeploy, then check again.
            </Text>
          )}
        </>
      ) : (
        <Button title="Check" kind="prominent" onPress={check} disabled={busy || !address.trim()} />
      )}
      {busy ? <ActivityIndicator color={colors.muted} /> : null}
      {error ? <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

// Shown when the server refused this phone's key, because it is wrong or was rotated.
function SignIn({ colors }: { colors: Colors }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy || !key) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(key);
      setKey('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title="Sign in"
      footer="This phone is signed out. Your notes are still here; enter the owner key to sync again."
    >
      <View style={styles.form}>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="Owner key"
          placeholderTextColor={colors.faint}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          onSubmitEditing={() => void submit()}
          accessibilityLabel="Owner key"
          style={[styles.field, { color: colors.foreground, borderColor: colors.border }]}
        />
        <Button
          title="Sign In"
          kind="prominent"
          onPress={() => void submit()}
          disabled={busy || !key}
        />
        {error ? <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text> : null}
      </View>
    </Section>
  );
}

function Advanced({
  colors,
  server,
  retry,
}: {
  colors: Colors;
  server: string | undefined;
  retry: () => void;
}) {
  const [origin, setOrigin] = useState(originOverride() ?? '');
  const [error, setError] = useState<string | null>(null);
  // A valid address applies as it is typed, so a server checked next already sees it; an invalid
  // one keeps the last valid address and is explained when the field is left.
  const change = (text: string) => {
    setOrigin(text);
    try {
      setOriginOverride(text);
      setError(null);
    } catch {
      // Explained on end editing.
    }
  };
  const finish = () => {
    try {
      setOrigin(setOriginOverride(origin) ?? '');
      setError(null);
      retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <Section
      title="Web app address"
      footer={
        error ??
        'Servers answer only the web app addresses listed in their ALLOWED_CLIENT_ORIGINS, and this phone introduces itself as one. Leave it empty to use the hosted app (or the dev client for a localhost server).'
      }
    >
      <View style={styles.form}>
        <TextInput
          value={origin}
          onChangeText={change}
          onEndEditing={finish}
          placeholder={server ? standardOrigin(server) : HOSTED_ORIGIN}
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          accessibilityLabel="Web app address"
          style={[styles.field, { color: colors.foreground, borderColor: colors.border }]}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  welcome: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  welcomeText: { flex: 1, gap: 4 },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20 },
  message: { fontSize: 15, marginHorizontal: 32, marginTop: 16 },
  label: { flex: 1, fontSize: 17 },
  value: { fontSize: 17, flexShrink: 1 },
  status: { width: 9, height: 9, borderRadius: 4.5 },
  form: { padding: 16, gap: 12 },
  field: {
    fontSize: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
});
