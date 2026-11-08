import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { checkServer, type ServerCheck, type ServerLocation } from '../../core/connection';
import { Button } from './ui/button';
import { Input } from './ui/input';

// `npm run dev` serves the API and this key locally (the `api` task); production builds know
// no server and no key.
const DEV_SERVER = import.meta.env.DEV ? 'http://localhost:6190' : '';
const DEV_KEY = import.meta.env.DEV ? 'dump-local-development-owner-key' : '';

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
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <label htmlFor="server-address" className="block text-xs">
          Server address
        </label>
        <div className="flex gap-2">
          <Input
            id="server-address"
            type="url"
            required
            placeholder="https://dump.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={address}
            disabled={busy}
            className="min-w-0 flex-1 max-phone:text-base"
            onChange={(event) => {
              setAddress(event.target.value);
              setChecked(null);
              setError('');
            }}
          />
          <Button type="submit" variant="outline" disabled={busy || !address.trim()}>
            {busy && !checked ? <LoaderCircle className="animate-spin" /> : null}Check
          </Button>
        </div>
      </form>
      {checked && (
        <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <Check size={15} />
            Dump server found
          </p>
          <p className="break-all text-muted-foreground">{checked.baseUrl}</p>
          <p>Automatic filing {checked.classify ? 'available' : 'off'}</p>
          {checked.auth === 'unconfigured' ? (
            <p className="leading-relaxed text-destructive">
              This server has no owner key yet. Set <code>OWNER_KEY</code> on it, redeploy, then
              check again.
            </p>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void connect(checked);
              }}
            >
              {/* Lets password managers save one key per server. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={checked.baseUrl}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
              <label htmlFor="owner-key" className="block">
                Owner key
              </label>
              <Input
                id="owner-key"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={key}
                disabled={busy}
                className="max-phone:text-base"
                onChange={(event) => {
                  setKey(event.target.value);
                  setError('');
                }}
              />
              {notice}
              <Button type="submit" disabled={busy || !key}>
                {busy ? <LoaderCircle className="animate-spin" /> : null}
                {action}
              </Button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
