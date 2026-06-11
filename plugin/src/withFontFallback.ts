import { type ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins';
import type { FontFallbackPluginConfig } from './pluginTypes';
import { resolveConfig } from './resolveNames';
import { withFontFallbackIos } from './ios';
import { withFontFallbackAndroid } from './android';

const pkg = require('../../package.json');

/**
 * Expo config plugin for `expo-font-fallback`.
 *
 * Bundles the configured fonts into the iOS and Android projects and embeds the
 * fallback chains (`font_fallback_chains.json`) that the runtime
 * `FontFallback.install()` activates.
 *
 * Not compatible with Expo Go — requires a custom dev client or a release build.
 */
const withFontFallback: ConfigPlugin<FontFallbackPluginConfig> = (
  config,
  props
) => {
  if (!props || !props.fonts) {
    throw new Error(
      '[expo-font-fallback] Missing plugin configuration. Provide `fonts` and `chains`.'
    );
  }

  // Resolve & validate up-front so prebuild fails loudly on misconfiguration.
  const resolved = resolveConfig(
    config._internal?.projectRoot ?? process.cwd(),
    props
  );

  config = withFontFallbackIos(config, resolved);
  config = withFontFallbackAndroid(config, resolved);

  return config;
};

export { withFontFallback };
export default createRunOncePlugin(withFontFallback, pkg.name, pkg.version);
