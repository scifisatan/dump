// Functions the Swift host installs before this bundle runs (mac/Sources/DumpKit/Engine.swift).
// Each asynchronous one answers through a callback on `host` below, always on the main thread.
type Native = {
  log(level: string, message: string): void;
  setTimer(id: number, milliseconds: number): void;
  clearTimer(id: number): void;
  randomBytes(length: number): number[];
  uuid(): string;
  // Answers with host.response. The host adds the Origin header the server expects.
  request(id: number, method: string, url: string, headers: string, body: string | null): void;
  cancelRequest(id: number): void;
  // Answers with host.socket events: open, message, sent, error, close.
  socketOpen(id: number, url: string): void;
  socketSend(id: number, data: string): void;
  socketClose(id: number, code: number, reason: string): void;
  // Notebook files live in the app's data folder; `name` is a bare file name.
  readFile(name: string): string | null;
  // Answers with host.written. Writes are atomic and applied in order.
  writeFile(id: number, name: string, content: string): void;
  isOnline(): boolean;
  ownerKey(profileId: string): string | null;
  changed(): void;
};

export const native = (globalThis as unknown as { __native: Native }).__native;

// Callbacks the host calls into. Modules register their handlers here.
export const host: Record<string, (...args: never[]) => void> = {};
(globalThis as unknown as { __host: typeof host }).__host = host;

// Runs a callback the way a browser event loop would: an exception is reported, not thrown back
// into the host.
export function report(run: () => void) {
  try {
    run();
  } catch (error) {
    native.log('error', `Uncaught ${describe(error)}`);
  }
}

export const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
