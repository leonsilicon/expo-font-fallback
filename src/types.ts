/**
 * Public type definitions shared between the runtime API, the native
 * TurboModule spec, and the Expo config plugin.
 */

/**
 * Configuration accepted by the Expo config plugin in `app.config.ts`.
 */
export type FontFallbackPluginConfig = {
  /**
   * Paths (relative to the project root) of the font files to bundle. Both
   * `.ttf` and `.otf` are supported.
   */
  fonts: string[];

  /**
   * Ordered fallback chains keyed by the *base* font family name. When text
   * styled with the base family contains glyphs the base font cannot render,
   * the platform walks this list in order before reaching the system cascade.
   *
   * The keys and values are font *names* — by default the file name without
   * extension. If the internal PostScript name differs (common for CJK fonts),
   * supply an explicit mapping via {@link FontFallbackPluginConfig.fontNames}.
   */
  chains: Record<string, string[]>;

  /**
   * Logical name (font file base name) to apply to any `<Text>` that does not
   * specify its own `fontFamily`. Must be one of {@link FontFallbackPluginConfig.fonts}.
   *
   * When set, a bare `<Text>` (no `style.fontFamily`) is treated as if it had
   * this family, so that family's fallback {@link FontFallbackPluginConfig.chains chain}
   * also applies — your bundled fonts are tried before the platform system font.
   * Bare weighted text (e.g. `fontWeight: 'bold'`) resolves to the matching face
   * of this family. Omit to keep the current behavior (no app-wide default).
   */
  defaultFamily?: string;

  /**
   * Optional explicit mapping from a font file path to its platform font
   * names. Use this when the PostScript name baked into the font differs from
   * the file name (e.g. `NotoSansSC-Regular.otf` whose PostScript name is
   * `NotoSansCJKsc-Regular`).
   */
  fontNames?: Record<string, { ios?: string; android?: string }>;

  android?: {
    /**
     * Behavior on API levels below 29 where `Typeface.CustomFallbackBuilder`
     * is unavailable. `"base-only"` registers just the base font (default);
     * `"warn"` additionally logs a development warning.
     */
    belowApi29?: 'base-only' | 'warn';
  };

  ios?: {
    /**
     * Whether to install the dyld interpose that re-attaches the cascade list
     * to fonts resolved by React Native's Fabric text path. Defaults to `true`.
     * Disable only if you intend to drive fallback through an explicit
     * component instead.
     */
    interceptReactNativeFontResolver?: boolean;
  };

  dev?: {
    warnOnMissingGlyphs?: boolean;
  };
};

/**
 * Options accepted by {@link FontFallback.install}.
 */
export type InstallOptions = {
  /**
   * Log a development warning when text is rendered whose glyphs are not
   * covered by the base font or any configured fallback. Defaults to `false`.
   */
  warnOnMissingGlyphs?: boolean;

  /**
   * Log the resolved fallback chains at install time. Useful while debugging
   * font-name mismatches. Defaults to `false`.
   */
  logResolvedFonts?: boolean;

  /**
   * Runtime override of the plugin-embedded
   * {@link FontFallbackPluginConfig.defaultFamily}. Pass a logical font name to
   * change the app-wide default applied to text with no `fontFamily`. Omit to
   * use the value embedded by the config plugin.
   */
  defaultFamily?: string;
};

/**
 * The fallback configuration as embedded by the config plugin and loaded by
 * the native modules at runtime.
 */
export type FontFallbackConfig = {
  chains: Record<string, string[]>;
  /**
   * The app-wide default family applied to text with no `fontFamily`, as
   * embedded by the config plugin. Absent when no default is configured.
   */
  defaultFamily?: string;
};

/**
 * Result of {@link FontFallback.checkText}: per-character coverage analysis of
 * a string against a base family and its configured fallback chain.
 */
export type GlyphCoverageReport = {
  baseFamily: string;
  /** Codepoints not covered by the base font or any configured fallback. */
  missingCodepoints: Array<{ char: string; codepoint: string }>;
  /** Map of character -> the font family that first covered it. */
  coveredBy: Record<string, string>;
};
