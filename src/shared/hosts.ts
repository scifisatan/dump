// No imports, so the phone's runtime shims can use it before anything else loads.
export const isLocalHost = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
