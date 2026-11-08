import { isLocalHost } from '../shared/hosts';
import type { Setting } from './setting';

// The web app origin a native app presents to servers, which answer only the origins listed in
// their ALLOWED_CLIENT_ORIGINS (src/server/origins.ts). The owner key is the authentication.
const HOSTED_ORIGIN = 'https://dump.abishrestha.com.np';
// The web client of `npm run dev`, which the development API allows.
const DEVELOPMENT_ORIGIN = 'http://localhost:6191';

const standardOrigin = (server: string | undefined) =>
  server && isLocalHost(new URL(server).hostname) ? DEVELOPMENT_ORIGIN : HOSTED_ORIGIN;

function readOrigin(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
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
  return url.origin;
}

export function originSetting(setting: Setting) {
  let override: string | null = null;
  let loaded = false;
  const chosen = () => {
    if (!loaded) override = setting.read();
    loaded = true;
    return override;
  };
  return {
    chosen,
    standard: standardOrigin,
    choose(input: string) {
      override = input.trim() ? readOrigin(input) : null;
      loaded = true;
      setting.write(override);
      return override;
    },
    for: (server: string) => chosen() ?? standardOrigin(server),
  };
}
