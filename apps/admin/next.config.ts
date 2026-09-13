import type { NextConfig } from 'next';
// pg is a native-ish node module; keep it external so Next doesn't try to bundle it.
// turbopack.root pins the workspace root to this monorepo — a stray ~/package-lock.json
// otherwise makes Next infer $HOME as the root, which breaks proxy (middleware) registration.
const config: NextConfig = {
  serverExternalPackages: ['pg', '@vegan-bangkok/db'],
  turbopack: { root: new URL('../..', import.meta.url).pathname },
};
export default config;
