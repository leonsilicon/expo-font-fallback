import type { FontFallbackPluginConfig } from './pluginTypes';

// Re-export the underlying ConfigPlugin function and its props type for
// consumers that want them.
export { withFontFallback } from './withFontFallback';
export type { FontFallbackPluginConfig } from './pluginTypes';

const pkg = require('../../package.json');

/**
 * Plugin factory for use in an `app.config.ts` `plugins` array.
 *
 * Returns an Expo plugin tuple `[pluginReference, props]`. The reference is
 * this package's name, which Expo resolves to its `app.plugin.js` entry (the
 * run-once-guarded plugin). This mirrors the array form
 * `['expo-font-fallback', props]` while composing like other factory-style
 * plugins.
 *
 * @example
 * import withFontFallback from 'expo-font-fallback/plugin';
 *
 * export default {
 *   expo: {
 *     plugins: [
 *       withFontFallback({
 *         fonts: ['./assets/fonts/Inter-Regular.ttf', './assets/fonts/NotoSansSC-Regular.otf'],
 *         chains: { 'Inter-Regular': ['NotoSansSC-Regular'] },
 *       }),
 *     ],
 *   },
 * };
 */
function withFontFallbackPlugin(
  props: FontFallbackPluginConfig
): [string, FontFallbackPluginConfig] {
  return [pkg.name, props];
}

export default withFontFallbackPlugin;
