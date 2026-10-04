export interface Env {
  DUMP: DurableObjectNamespace;
  // Jev list classification is on exactly when this key is set (`.env.local` in dev, a Worker
  // secret in production). Without it, dumps stay in the inbox. E2e servers load their own env
  // file without it, so tests never call Jev.
  JEV_API_KEY?: string;
  // Comma-separated web client origins allowed to connect to this server.
  ALLOWED_CLIENT_ORIGINS?: string;
  // The owner's secret (a Worker secret; `.env.local` or the dev task locally). See auth.ts.
  OWNER_KEY?: string;
}
