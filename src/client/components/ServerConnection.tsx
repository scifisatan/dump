import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Code } from '@astryxdesign/core/Code';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { checkServer, type ServerCheck, type ServerLocation } from '../../core/connection';

// `npm run dev` serves the API and this key locally (the `api` task); production builds know
// no server and no key.
const DEV_SERVER = import.meta.env.DEV ? 'http://localhost:6190' : '';
const DEV_KEY = import.meta.env.DEV ? 'dump-local-development-owner-key' : '';

/** Lets password managers save one key per server: a username field they can read. */
export function ServerUsername({ server }: { server: string }) {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={server}
      readOnly
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
    />
  );
}

export function ServerConnection({
  action = 'Connect to this server',
  notice,
  onConnect,
}: {
  action?: string;
  notice?: ReactNode;
  onConnect: (server: ServerLocation, key: string, signal: AbortSignal) => Promise<void>;
}) {
  const [address, setAddress] = useState(DEV_SERVER);
  const [key, setKey] = useState(DEV_KEY);
  const [checked, setChecked] = useState<ServerCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    setError('');
    setBusy(true);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      await task(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not connect to this server.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const check = () =>
    run(async (signal) => {
      setChecked(null);
      setChecked(await checkServer(address, signal));
    });

  const connect = (server: ServerCheck) =>
    run(async (signal) => {
      await onConnect(server, key, signal);
    });

  return (
    <VStack gap={3}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <HStack gap={2} vAlign="end">
          <TextInput
            label="Server address"
            type="url"
            placeholder="https://dump.example.com"
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
            inputMode="url"
            value={address}
            isDisabled={busy}
            containerClassName="min-w-0 flex-1"
            onChange={(value) => {
              setAddress(value);
              setChecked(null);
              setError('');
            }}
          />
          <Button
            type="submit"
            label="Check"
            isLoading={busy && !checked}
            isDisabled={!address.trim()}
          />
        </HStack>
      </form>
      {checked && (
        <Card variant="muted" padding={3}>
          <VStack gap={3}>
            <HStack gap={2} vAlign="center">
              <Icon icon={Check} size="sm" color="success" />
              <Text weight="medium">Dump server found</Text>
            </HStack>
            <Text type="supporting" wordBreak="break-all">
              {checked.baseUrl}
            </Text>
            <Text type="supporting">Automatic filing {checked.classify ? 'available' : 'off'}</Text>
            {checked.auth === 'unconfigured' ? (
              <Text color="inherit" className="text-error">
                This server has no owner key yet. Set <Code size="inherit">OWNER_KEY</Code> on it,
                redeploy, then check again.
              </Text>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void connect(checked);
                }}
              >
                <VStack gap={3}>
                  <ServerUsername server={checked.baseUrl} />
                  <TextInput
                    label="Owner key"
                    type="password"
                    htmlName="password"
                    autoComplete="current-password"
                    value={key}
                    isDisabled={busy}
                    onChange={(value) => {
                      setKey(value);
                      setError('');
                    }}
                  />
                  {notice}
                  <Button
                    type="submit"
                    variant="primary"
                    label={action}
                    isLoading={busy}
                    isDisabled={!key}
                  />
                </VStack>
              </form>
            )}
          </VStack>
        </Card>
      )}
      {error && (
        <Text role="alert" type="supporting" color="inherit" className="text-error">
          {error}
        </Text>
      )}
    </VStack>
  );
}
