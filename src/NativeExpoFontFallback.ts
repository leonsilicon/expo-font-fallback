import { Platform, TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * Native TurboModule surface. Kept deliberately small and codegen-friendly:
 * structured data crosses the bridge as JSON strings so the spec stays within
 * codegen's supported type system.
 */
export interface Spec extends TurboModule {
  /**
   * Configure and activate the fallback chains.
   *
   * @param warnOnMissingGlyphs enable development warnings for uncovered glyphs
   * @param logResolvedFonts log the resolved chains at install time
   * @param defaultFamilyOverride override the embedded app-wide default family;
   *   pass an empty string to use the value embedded by the config plugin
   * @returns `true` if installation succeeded
   */
  install(
    warnOnMissingGlyphs: boolean,
    logResolvedFonts: boolean,
    defaultFamilyOverride: string
  ): boolean;

  isInstalled(): boolean;

  /** Returns the embedded fallback configuration as a JSON string. */
  getConfigJSON(): string;

  /**
   * Analyze glyph coverage for `text` against `baseFamily` and its chain.
   * Returns a `GlyphCoverageReport` serialized as JSON.
   */
  checkText(text: string, baseFamily: string): string;
}

/**
 * Web stub. There is no native font-fallback engine on web — the browser
 * handles fallback via the CSS `font-family` cascade — so the runtime API
 * degrades to inert no-ops. Resolving via `Platform.OS` (rather than a separate
 * `.web` file) keeps this working after `react-native-builder-bob` rewrites the
 * import in `index.tsx` to an explicit `.js` extension, which would otherwise
 * defeat Metro's `.web` platform-extension resolution and crash the web bundle
 * at import time in `TurboModuleRegistry.getEnforcing`.
 */
const WebExpoFontFallback: Spec = {
  install: () => false,
  isInstalled: () => false,
  getConfigJSON: () => '{"chains":{}}',
  checkText: (_text: string, baseFamily: string) =>
    JSON.stringify({ baseFamily, missingCodepoints: [], coveredBy: {} }),
};

export default Platform.OS === 'web'
  ? WebExpoFontFallback
  : TurboModuleRegistry.getEnforcing<Spec>('ExpoFontFallback');
