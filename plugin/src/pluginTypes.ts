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
  fontNames?: Record<string, { ios?: string; android?: string }>;
  android?: {
    belowApi29?: 'base-only' | 'warn';
  };
  ios?: {
    interceptReactNativeFontResolver?: boolean;
  };
  dev?: {
    warnOnMissingGlyphs?: boolean;
  };
};
