import { useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { ServerLocation } from '../../core/connection';
import { toast } from '../lib/toast';
import { registry } from '../profiles';
import { session } from '../store';
import { ServerConnection, ServerUsername } from './ServerConnection';

function SignIn({ server }: { server: ServerLocation }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Banner
      status="error"
      title="This device is signed out."
      description="Your notes are still here; enter the owner key to sync again."
      collapsible={false}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await session.signIn(key);
            toast('Signed in. Syncing again.');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not sign in.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <ServerUsername server={server.baseUrl} />
        <HStack gap={2} vAlign="end">
          <TextInput
            label="Owner key"
            type="password"
            htmlName="password"
            autoComplete="current-password"
            isRequired
            value={key}
            isDisabled={busy}
            containerClassName="min-w-0 flex-1"
            status={error ? { type: 'error', message: error } : undefined}
            onChange={setKey}
          />
          <Button type="submit" label="Sign in" isLoading={busy} isDisabled={!key} />
        </HStack>
      </form>
    </Banner>
  );
}

export function ServerSettings({ signedOut }: { signedOut: boolean }) {
  const server = session.get().profile.server;
  const saved = registry.others();
  return (
    <VStack gap={3}>
      {server ? (
        <>
          <Text type="supporting" wordBreak="break-all">
            Current: {server.baseUrl}
          </Text>
          {signedOut && <SignIn server={server} />}
          <ServerConnection action="Switch to this server" onConnect={session.connect} />
          <Text type="supporting">
            Switching opens a separate notebook. Saved thoughts stay with their server; use export
            and import to move them. Other open tabs keep their current connection until reloaded.
            Save your current draft before switching.
          </Text>
        </>
      ) : (
        <>
          <Text type="supporting">
            This notebook lives only in this browser. Connect a server to sync it across devices and
            keep a copy off this device.
          </Text>
          <ServerConnection
            action="Connect and sync"
            notice={
              <Text type="supporting">
                Your notes on this device will be added to this server’s notebook.
              </Text>
            }
            onConnect={session.connect}
          />
        </>
      )}
      {saved.length > 0 && (
        <VStack gap={2}>
          <Text weight="medium">Other notebooks</Text>
          {saved.map((profile) => (
            <Button
              key={profile.id}
              width="100%"
              label={profile.server?.baseUrl ?? 'This device only'}
              onClick={() =>
                void session
                  .switchTo(profile)
                  .catch((cause) =>
                    toast.error(cause instanceof Error ? cause.message : 'Could not switch.'),
                  )
              }
            />
          ))}
          <Text type="supporting">Saved notebooks open offline.</Text>
        </VStack>
      )}
    </VStack>
  );
}
