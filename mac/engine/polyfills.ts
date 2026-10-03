// JavaScriptCore has the language but none of the web platform. These are the browser APIs that
// the shared client core, TinyBase and Zod use, with the platform work (timers, randomness, HTTP,
// WebSockets) done natively. This module must run before any of them load: TinyBase reads
// TextEncoder, crypto and structuredClone when its modules initialize.
import 'core-js/actual/dom-exception';
import 'core-js/actual/structured-clone';
import 'core-js/actual/url';
import 'core-js/actual/url-search-params';
import { describe, host, native, report } from './native';

const install = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

const text = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return describe(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
const logger =
  (level: string) =>
  (...values: unknown[]) =>
    native.log(level, values.map(text).join(' '));
install('console', {
  log: logger('info'),
  info: logger('info'),
  debug: logger('debug'),
  warn: logger('warn'),
  error: logger('error'),
});

// Timers. The host fires each one once; intervals re-arm themselves.
let nextTimer = 1;
const timers = new Map<number, { run: () => void; every?: number }>();
function schedule(callback: unknown, delay: unknown, args: unknown[], repeat: boolean) {
  const id = nextTimer++;
  const milliseconds = Math.max(0, Number(delay) || 0);
  if (typeof callback !== 'function') return id;
  timers.set(id, {
    run: () => callback(...args),
    every: repeat ? Math.max(milliseconds, 1) : undefined,
  });
  native.setTimer(id, milliseconds);
  return id;
}
function cancel(id: unknown) {
  if (typeof id === 'number' && timers.delete(id)) native.clearTimer(id);
}
host.timer = (id: number) => {
  const timer = timers.get(id);
  if (!timer) return;
  if (timer.every === undefined) timers.delete(id);
  else native.setTimer(id, timer.every);
  report(timer.run);
};
install('setTimeout', (callback: unknown, delay?: unknown, ...args: unknown[]) =>
  schedule(callback, delay, args, false),
);
install('setInterval', (callback: unknown, delay?: unknown, ...args: unknown[]) =>
  schedule(callback, delay, args, true),
);
install('clearTimeout', cancel);
install('clearInterval', cancel);
install('queueMicrotask', (callback: () => void) => {
  void Promise.resolve().then(() => report(callback));
});

install('crypto', {
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    view.set(native.randomBytes(view.length));
    return array;
  },
  randomUUID: () => native.uuid(),
});

// UTF-8 exactly as browsers encode it, lone surrogates included (as U+FFFD): TinyBase hashes these
// bytes, and the hashes must match every other device's.
function codePoints(input: string, visit: (point: number) => void) {
  for (let index = 0; index < input.length; index++) {
    let point = input.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdfff) {
      const next = input.charCodeAt(index + 1);
      if (point <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + (next - 0xdc00);
        index++;
      } else point = 0xfffd;
    }
    visit(point);
  }
}
const utf8Length = (input: string) => {
  let length = 0;
  codePoints(input, (point) => {
    length += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  });
  return length;
};
class TextEncoder {
  readonly encoding = 'utf-8';
  encode(input = ''): Uint8Array {
    const bytes = new Uint8Array(utf8Length(input));
    let at = 0;
    codePoints(input, (point) => {
      if (point < 0x80) bytes[at++] = point;
      else if (point < 0x800) {
        bytes[at++] = 0xc0 | (point >> 6);
        bytes[at++] = 0x80 | (point & 0x3f);
      } else if (point < 0x10000) {
        bytes[at++] = 0xe0 | (point >> 12);
        bytes[at++] = 0x80 | ((point >> 6) & 0x3f);
        bytes[at++] = 0x80 | (point & 0x3f);
      } else {
        bytes[at++] = 0xf0 | (point >> 18);
        bytes[at++] = 0x80 | ((point >> 12) & 0x3f);
        bytes[at++] = 0x80 | ((point >> 6) & 0x3f);
        bytes[at++] = 0x80 | (point & 0x3f);
      }
    });
    return bytes;
  }
}
install('TextEncoder', TextEncoder);

// Events: enough of EventTarget for AbortSignal and WebSocket. Listener errors are reported and
// do not stop the remaining listeners, as in a browser.
type ShimEvent = { type: string; [key: string]: unknown };
type Listener = ((event: ShimEvent) => void) | { handleEvent(event: ShimEvent): void };
class Target {
  #listeners = new Map<string, { listener: Listener; once: boolean }[]>();
  addEventListener(
    type: string,
    listener: Listener | null,
    options?: boolean | { once?: boolean },
  ) {
    if (!listener) return;
    const entries = this.#listeners.get(type) ?? [];
    if (entries.some((entry) => entry.listener === listener)) return;
    entries.push({ listener, once: typeof options === 'object' && !!options?.once });
    this.#listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: Listener | null) {
    const entries = this.#listeners.get(type);
    if (entries)
      this.#listeners.set(
        type,
        entries.filter((entry) => entry.listener !== listener),
      );
  }
  dispatchEvent(event: ShimEvent) {
    event.target = this;
    const handler = (this as unknown as Record<string, unknown>)[`on${event.type}`];
    if (typeof handler === 'function') report(() => handler.call(this, event));
    // A copy: listeners added during dispatch wait for the next event, as in browsers.
    const entries = this.#listeners.get(event.type)?.slice() ?? [];
    for (const entry of entries) {
      if (entry.once) this.removeEventListener(event.type, entry.listener);
      const { listener } = entry;
      report(() =>
        typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event),
      );
    }
    return true;
  }
}

class AbortSignal extends Target {
  aborted = false;
  reason: unknown = undefined;
  onabort: ((event: ShimEvent) => void) | null = null;
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
  static abort(reason?: unknown) {
    const controller = new AbortController();
    controller.abort(reason);
    return controller.signal;
  }
  static timeout(milliseconds: number) {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      milliseconds,
    );
    return controller.signal;
  }
  static any(signals: AbortSignal[]) {
    const controller = new AbortController();
    const aborted = signals.find((signal) => signal.aborted);
    if (aborted) controller.abort(aborted.reason);
    else
      for (const signal of signals)
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    return controller.signal;
  }
}
class AbortController {
  readonly signal = new AbortSignal();
  abort(reason: unknown = new DOMException('signal is aborted without reason', 'AbortError')) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason;
    this.signal.dispatchEvent({ type: 'abort' });
  }
}
install('AbortSignal', AbortSignal);
install('AbortController', AbortController);

class Headers {
  #values = new Map<string, string>();
  constructor(init?: unknown) {
    if (init instanceof Headers) init.forEach((value, name) => this.append(name, value));
    else if (Array.isArray(init)) for (const [name, value] of init) this.append(name, value);
    else if (init && typeof init === 'object')
      for (const [name, value] of Object.entries(init)) this.append(name, String(value));
  }
  append(name: string, value: string) {
    const key = name.toLowerCase();
    const previous = this.#values.get(key);
    this.#values.set(key, previous === undefined ? String(value) : `${previous}, ${value}`);
  }
  set(name: string, value: string) {
    this.#values.set(name.toLowerCase(), String(value));
  }
  get(name: string) {
    return this.#values.get(name.toLowerCase()) ?? null;
  }
  has(name: string) {
    return this.#values.has(name.toLowerCase());
  }
  delete(name: string) {
    this.#values.delete(name.toLowerCase());
  }
  forEach(visit: (value: string, name: string, headers: Headers) => void) {
    for (const [name, value] of this.#values) visit(value, name, this);
  }
  entries() {
    return this.#values.entries();
  }
  [Symbol.iterator]() {
    return this.#values.entries();
  }
}
install('Headers', Headers);

class Response {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText = '';
  readonly headers: Headers;
  readonly url: string;
  bodyUsed = false;
  #body: string;
  constructor(status: number, headers: Headers, body: string, url: string) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.headers = headers;
    this.#body = body;
    this.url = url;
  }
  async text() {
    if (this.bodyUsed) throw new TypeError('Body has already been read.');
    this.bodyUsed = true;
    return this.#body;
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

// fetch, as the core uses it: string bodies, no caching or cookies, and no redirects (the host
// treats one as a network failure, like `redirect: 'error'`). Network failures reject with a
// TypeError, as in browsers.
let nextRequest = 1;
const requests = new Map<number, { settle: (response: Response | TypeError) => void }>();
install(
  'fetch',
  (input: string | URL | { url: string }, init: Record<string, unknown> = {}) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal as AbortSignal | undefined;
      if (signal?.aborted) return reject(signal.reason);
      const id = nextRequest++;
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : String(input.url);
      const abort = () => {
        requests.delete(id);
        native.cancelRequest(id);
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
      requests.set(id, {
        settle(result) {
          requests.delete(id);
          signal?.removeEventListener('abort', abort);
          if (result instanceof Response) resolve(result);
          else reject(result);
        },
      });
      const headers: [string, string][] = [];
      new Headers(init.headers).forEach((value, name) => headers.push([name, value]));
      const body = init.body;
      native.request(
        id,
        String(init.method ?? 'GET').toUpperCase(),
        url,
        JSON.stringify(headers),
        body === undefined || body === null ? null : String(body),
      );
    }),
);
host.response = (
  id: number,
  status: number,
  headers: string,
  body: string,
  url: string,
  error: string | null,
) =>
  requests
    .get(id)
    ?.settle(
      error === null
        ? new Response(status, new Headers(JSON.parse(headers)), body, url)
        : new TypeError(error),
    );

const [CONNECTING, OPEN, CLOSING, CLOSED] = [0, 1, 2, 3];
let nextSocket = 1;
const sockets = new Map<number, WebSocket>();
class WebSocket extends Target {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;
  readonly url: string;
  readonly protocol = '';
  readonly extensions = '';
  binaryType = 'blob';
  readyState = CONNECTING;
  bufferedAmount = 0;
  onopen: ((event: ShimEvent) => void) | null = null;
  onmessage: ((event: ShimEvent) => void) | null = null;
  onerror: ((event: ShimEvent) => void) | null = null;
  onclose: ((event: ShimEvent) => void) | null = null;
  readonly #id = nextSocket++;
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    sockets.set(this.#id, this);
    native.socketOpen(this.#id, this.url);
  }
  send(data: unknown) {
    if (this.readyState === CONNECTING)
      throw new DOMException('Still in CONNECTING state.', 'InvalidStateError');
    if (this.readyState !== OPEN) return;
    const message = String(data);
    this.bufferedAmount += utf8Length(message);
    native.socketSend(this.#id, message);
  }
  close(code = 1000, reason = '') {
    if (this.readyState >= CLOSING) return;
    this.readyState = CLOSING;
    native.socketClose(this.#id, code, reason);
  }
}
install('WebSocket', WebSocket);
// `data` is the message for `message`, the byte count for `sent`, and the reason for `close`.
host.socket = (id: number, type: string, data: string, code: number) => {
  const socket = sockets.get(id);
  if (!socket) return;
  if (type === 'open') {
    socket.readyState = OPEN;
    socket.dispatchEvent({ type: 'open' });
  } else if (type === 'message') {
    socket.dispatchEvent({ type: 'message', data });
  } else if (type === 'sent') {
    socket.bufferedAmount = Math.max(0, socket.bufferedAmount - Number(data));
  } else if (type === 'error') {
    socket.dispatchEvent({ type: 'error' });
  } else if (type === 'close') {
    sockets.delete(id);
    socket.readyState = CLOSED;
    socket.bufferedAmount = 0;
    socket.dispatchEvent({ type: 'close', code, reason: data, wasClean: code === 1000 });
  }
};
