/**
 * Plugin-local copy of the public plugin config type. Kept in sync with
 * `src/types.ts` (`FontFallbackPluginConfig`) but duplicated here so the plugin
 * compiles as a self-contained CommonJS tree with no imports outside `plugin/`.
 */
export type FontFallbackPluginConfig = {
  fonts: string[];
  chains: Record<string, string[]>;
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
