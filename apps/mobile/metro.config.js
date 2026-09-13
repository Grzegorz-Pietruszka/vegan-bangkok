const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot); // calls Expo's getDefaultConfig internally
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// @rnmapbox/maps ships index.js (web-capable, statically imports mapbox-gl/dist/mapbox-gl.css)
// AND index.native.js (native, web-free) — but its package.json `exports` only declares a
// `default` condition pointing at index.js. Metro's package-`exports` resolution (ON by default
// in SDK 57) honours that exact path and never falls back to the `.native` platform variant, so
// the web entry — and mapbox-gl.css, which isn't installed — leaks into the iOS bundle.
// Redirect the bare specifier to the native entry on non-web platforms; its relative imports are
// plain paths, so platform-extension resolution keeps the rest of the subtree native.
const rnmapboxNativeEntry = path.resolve(
  path.dirname(require.resolve('@rnmapbox/maps/package.json')),
  'lib/module/index.native.js',
);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName === '@rnmapbox/maps' && platform !== 'web') {
    return resolve(context, rnmapboxNativeEntry, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
