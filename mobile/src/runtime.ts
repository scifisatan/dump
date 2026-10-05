// Web APIs that the shared core, TinyBase and Zod use and React Native's Hermes lacks or has only
// in part, plus the Origin header Dump servers expect. index.ts imports this before anything else:
// TinyBase reads crypto, TextEncoder and structuredClone as its modules load.
import 'core-js/actual/dom-exception';
import 'core-js/actual/structured-clone';
import 'core-js/actual/url';
import 'core-js/actual/url-search-params';
import { getRandomValues, randomUUID } from 'expo-crypto';
import { clientOrigin } from './origin';

const install = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

if (typeof globalThis.crypto?.getRandomValues !== 'function')
  install('crypto', { getRandomValues, randomUUID });

// React Native's AbortController (the abort-controller package) predates abort reasons,
// throwIfAborted, AbortSignal.timeout and AbortSignal.any, which the core's requests use.
if (!('reason' in AbortSignal.prototype)) {
  const reasons = new WeakMap<AbortSignal, unknown>();
  Object.defineProperty(AbortSignal.prototype, 'reason', {
    get(this: AbortSignal) {
      return reasons.get(this);
    },
    configurable: true,
  });
  class Controller extends AbortController {
    abort(reason: unknown = new DOMException('signal is aborted without reason', 'AbortError')) {
      if (this.signal.aborted) return;
      reasons.set(this.signal, reason);
      super.abort();
    }
  }
  install('AbortController', Controller);
}
if (typeof AbortSignal.prototype.throwIfAborted !== 'function')
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    value(this: AbortSignal) {
      if (this.aborted) throw this.reason;
    },
    writable: true,
    configurable: true,
  });
if (typeof AbortSignal.timeout !== 'function')
  AbortSignal.timeout = (milliseconds: number) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      milliseconds,
    );
    return controller.signal;
  };
if (typeof AbortSignal.any !== 'function')
  AbortSignal.any = (signals: Iterable<AbortSignal>) => {
    const controller = new AbortController();
    const list = [...signals];
    const aborted = list.find((signal) => signal.aborted);
    if (aborted) controller.abort(aborted.reason);
    else
      for (const signal of list)
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    return controller.signal;
  };

// Dump servers refuse requests without an allowed Origin, which a native app does not send (and
// React Native's WebSocket sends the server's own). Requests to a server's API present the web
// app's origin, as the Mac app's do; others, such as the development server's, are left alone.
const serverApi = (url: string) => {
  try {
    return new URL(url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

const nativeFetch = globalThis.fetch;
install('fetch', (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!serverApi(url)) return nativeFetch(input, init);
  const headers = new Headers(init.headers);
  headers.set('Origin', clientOrigin(url));
  return nativeFetch(input, { ...init, headers });
});

// React Native's WebSocket takes request headers as a third argument, which DOM types lack.
type NativeSocket = new (
  url: string,
  protocols?: string | string[],
  options?: { headers: { origin: string } },
) => WebSocket;
// SAFETY: React Native installs its WebSocket class, whose constructor accepts these options.
const NativeWebSocket = globalThis.WebSocket as unknown as NativeSocket;
class OriginWebSocket extends NativeWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const href = String(url);
    super(
      href,
      protocols,
      serverApi(href) ? { headers: { origin: clientOrigin(href) } } : undefined,
    );
  }
}
install('WebSocket', OriginWebSocket);
