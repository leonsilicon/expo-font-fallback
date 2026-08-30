/**
 * Plugin-local copy of the public plugin config type. Kept in sync with
 * `src/types.ts` (`FontFallbackPluginConfig`) but duplicated here so the plugin
 * compiles as a self-contained CommonJS tree with no imports outside `plugin/`.
 */
export type FontFallbackPluginConfig = {
  fonts: string[];
  chains: Record<string, string[]>;
  /**
   * Logical name (font file base name) to apply to any `<Text>` that does not
   * specify its own `fontFamily`. Must be one of `fonts`. When set, text with no
   * `fontFamily` resolves as if it had this family, so that family's chain (if
   * any) also applies. Omit to keep the current behavior (no default).
   */
  defaultFamily?: string;
  /**
   * Multi-weight families keyed by the DISPLAY family name — the string JS
   * passes as `fontFamily`. `faces` lists the logical font names (file base
   * names, all of which must be in `fonts`) that make up the family; each
   * face's weight and italic are read from its file. `chain` lists logical
   * names to fall back to for glyphs a face lacks.
   *
   * Android registers ONE cascaded `Typeface` per family that carries every
   * face, so `fontWeight` selects the real face and missing glyphs walk the
   * chain (a plain `chains` entry is built from a single file and cannot do
   * either). iOS resolves the family through CoreText and applies the per-face
   * `chains`, so `families` only validates the names there. `defaultFamily`
   * may name a `families` key.
   */
  families?: Record<string, { faces: string[]; chain?: string[] }>;
  fontNames?: Record<string, { ios?: string; android?: string }>;
  android?: {
    belowApi29?: 'base-only' | 'warn';
    /**
     * Font file names (with or without extension, e.g. `noto-sans` or
     * `noto-sans.ttf`) that another plugin already bundles into the Android app
     * as a font RESOURCE (`res/font/`, e.g. `expo-font`). These fonts are still
     * used for chain and name resolution, but this plugin will not copy them
     * into `assets/fonts/` — doing so ships the same file twice in the
     * APK/AAB, which is significant for multi-megabyte CJK faces.
     *
     * The runtime resolves such names from `res/font/` instead. Android
     * resource names replace hyphens with underscores, matching `expo-font`'s
     * own naming, so `noto-sans-sc` is looked up as `R.font.noto_sans_sc`.
     */
    skipBundlingFonts?: string[];
  };
  ios?: {
    interceptReactNativeFontResolver?: boolean;
    /**
     * Font file names (with or without extension, e.g. `noto-sans` or
     * `noto-sans.ttf`) that another plugin already bundles into the iOS app
     * (e.g. `expo-font`). These fonts are still used for chain and name
     * resolution, but this plugin will not copy them or add them to the Xcode
     * resources build phase — doing so produces a second `CpResource` for the
     * same output file and fails the build with "Multiple commands produce …".
     */
    skipBundlingFonts?: string[];
  };
  dev?: {
    warnOnMissingGlyphs?: boolean;
  };
};
