// No imports, so the native apps' runtime shims can depend on it before anything else loads.
export type Setting = { read(): string | null; write(value: string | null): void };
