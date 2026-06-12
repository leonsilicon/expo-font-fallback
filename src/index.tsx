import NativeExpoFontFallback from './NativeExpoFontFallback';
import { installDefaultFontPatch } from './defaultFontPatch';
import type {
  InstallOptions,
  FontFallbackConfig,
  GlyphCoverageReport,
} from './types';

export type {
  FontFallbackPluginConfig,
  InstallOptions,
  FontFallbackConfig,
  GlyphCoverageReport,
} from './types';

/**
 * The Expo config plugin (`expo-font-fallback`) is responsible for bundling
 * the configured fonts and embedding the fallback chains. This runtime API
 * activates the chains against React Native's text rendering.
 *
 * Call {@link FontFallback.install} once, before your first React render.
 *
 * @example
 * import { FontFallback } from 'expo-font-fallback';
 * FontFallback.install({ warnOnMissingGlyphs: __DEV__ });
 */
export const FontFallback = {
  /**
   * Configure and activate the fallback chains embedded by the config plugin.
   * Safe to call more than once; subsequent calls re-apply the configuration.
   */
  install(options: InstallOptions = {}): boolean {
    const ok = NativeExpoFontFallback.install(
      options.warnOnMissingGlyphs ?? false,
      options.logResolvedFonts ?? false,
      options.defaultFamily ?? ''
    );

    // Apply the configured default family to bare `<Text>` at the JS layer. This
    // is what makes the app-wide default work on Android (whose attribute-less
    // text path can't be redirected from native); on iOS it complements the
    // native resolver. The runtime override wins over the embedded value.
    const defaultFamily =
      options.defaultFamily && options.defaultFamily.length > 0
        ? options.defaultFamily
        : this.getConfig().defaultFamily;
    installDefaultFontPatch(defaultFamily);

    return ok;
  },

  isInstalled(): boolean {
    return NativeExpoFontFallback.isInstalled();
  },

  /** The fallback configuration embedded by the config plugin. */
  getConfig(): FontFallbackConfig {
    const json = NativeExpoFontFallback.getConfigJSON();
    try {
      return JSON.parse(json) as FontFallbackConfig;
    } catch {
      return { chains: {} };
    }
  },

  /**
   * Analyze which font in `baseFamily`'s chain covers each character of
   * `text`, and report any uncovered codepoints. Intended for development use.
   */
  checkText(text: string, baseFamily: string): GlyphCoverageReport {
    const json = NativeExpoFontFallback.checkText(text, baseFamily);
    return JSON.parse(json) as GlyphCoverageReport;
  },
};
