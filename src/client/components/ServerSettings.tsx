import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { explainConnectionError, requestTicket, type ServerLocation } from '../../core/connection';
import { activateProfile, profileForServer, readProfiles, saveKey } from '../profiles';
import { client, currentProfile } from '../store';
import { ServerConnection } from './ServerConnection';
import { Button } from './ui/button';
import { Input } from './ui/input';

const note = 'text-xs leading-relaxed text-muted-foreground';

// Shown when the server refused this device's key (wrong, or rotated to cut off a lost device).
function SignIn({ server }: { server: ServerLocation }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
          await requestTicket(server.baseUrl, key);
          saveKey(currentProfile.id, key);
          client.reconnect();
          toast('Signed in. Syncing again.');
        } catch (cause) {
          setError(explainConnectionError(cause, 'Could not sign in.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="leading-relaxed">
        This device is signed out. Your notes are still here; enter the owner key to sync again.
      </p>
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={server.baseUrl}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      <label htmlFor="sign-in-key" className="block">
        Owner key
      </label>
      <div className="flex gap-2">
        <Input
          id="sign-in-key"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={key}
          disabled={busy}
          className="min-w-0 flex-1 max-phone:text-base"
          onChange={(event) => setKey(event.target.value)}
        />
        <Button type="submit" disabled={busy || !key}>
          {busy ? <LoaderCircle className="animate-spin" /> : null}Sign in
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function ServerSettings({ signedOut }: { signedOut: boolean }) {
  const server = currentProfile.server;
  const saved = readProfiles().profiles.filter((profile) => profile.id !== currentProfile.id);
  return (
    <div className="space-y-3">
      {server ? (
        <>
          <p className={`${note} break-all`}>Current: {server.baseUrl}</p>
          {signedOut && <SignIn server={server} />}
          <ServerConnection
            action="Switch to this server"
            onConnect={async (next, key) => {
              const profile = profileForServer(next);
              saveKey(profile.id, key);
              await activateProfile(profile, client.stop);
            }}
          />
          <p className={note}>
            Switching opens a separate notebook. Saved thoughts stay with their server; use export
            and import to move them. Other open tabs keep their current connection until reloaded.
            Save your current draft before switching.
          </p>
        </>
      ) : (
        <>
          <p className={note}>
            This notebook lives only in this browser. Connect a server to sync it across devices and
            keep a copy off this device.
          </p>
          <ServerConnection
            action="Connect and sync"
            notice={
              <p className="leading-relaxed text-muted-foreground">
                Your notes on this device will be added to this server’s notebook.
              </p>
            }
            onConnect={async (next, key) => {
              saveKey(currentProfile.id, key);
              await activateProfile({ ...currentProfile, server: next }, client.stop);
            }}
          />
        </>
      )}
      {saved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Other notebooks</p>
          {saved.map((profile) => (
            <Button
              key={profile.id}
              variant="outline"
              className="h-auto min-h-10 w-full justify-start text-left text-xs break-all whitespace-normal"
              onClick={() =>
                void activateProfile(profile, client.stop).catch((cause) =>
                  toast.error(cause instanceof Error ? cause.message : 'Could not switch.'),
                )
              }
            >
              {profile.server?.baseUrl ?? 'This device only'}
            </Button>
          ))}
          <p className={note}>Saved notebooks open offline.</p>
        </div>
      )}
    </div>
  );
}
