// Whether this browser has a notebook decides what `/` shows (notebook or landing page) before
// any notebook code loads, so this module stays dependency-free. profiles.ts owns the contents.
export const REGISTRY_KEY = 'dump-connections';
export const hasNotebook = () => localStorage.getItem(REGISTRY_KEY) !== null;
