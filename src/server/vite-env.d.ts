// The Worker is bundled by Vite, which replaces import.meta.env.MODE at build time.
interface ImportMeta {
  readonly env: { readonly MODE: string };
}
