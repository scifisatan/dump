export interface Env {
  DUMP: DurableObjectNamespace;
  ASSETS: Fetcher;
  // Jev list classification is on exactly when this key is set (`.env.local` in dev, a Worker
  // secret in production). Without it, dumps stay in the inbox.
  JEV_API_KEY?: string;
}

// Test builds never call the real Jev; e2e tests stand in for /api/classify instead.
export const jevKey = (env: Env) =>
  import.meta.env.MODE === 'test' ? undefined : env.JEV_API_KEY || undefined;
