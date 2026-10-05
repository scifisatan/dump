import Storage from 'expo-sqlite/kv-store';

// The web app origin this app presents to servers, which answer only the origins listed in their
// ALLOWED_CLIENT_ORIGINS (src/server/origins.ts). The owner key is the authentication.
export const HOSTED_ORIGIN = 'https://dump.abishrestha.com.np';
// The web client of `npm run dev`, which the development API allows.
export const DEVELOPMENT_ORIGIN = 'http://localhost:6191';

const OVERRIDE = 'web-app-origin';
let override: string | null | undefined;

const isLocal = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

export function standardOrigin(server: string) {
  return isLocal(new URL(server)) ? DEVELOPMENT_ORIGIN : HOSTED_ORIGIN;
}

export function originOverride() {
  return (override ??= Storage.getItemSync(OVERRIDE));
}

export function clientOrigin(server: string) {
  return originOverride() ?? standardOrigin(server);
}

// A valid override is an http(s) origin with nothing after the host and port; null clears it.
export function setOriginOverride(input: string | null) {
  const trimmed = input?.trim();
  if (!trimmed) {
    Storage.removeItemSync(OVERRIDE);
    override = null;
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Enter a web app address, such as https://dump.example.com.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Use an http or https address without a path, query, or credentials.');
  Storage.setItemSync(OVERRIDE, url.origin);
  override = url.origin;
  return url.origin;
}
