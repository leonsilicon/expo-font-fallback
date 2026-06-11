import path from 'path';
import type { FontFallbackPluginConfig } from './pluginTypes';
import { readFontNames } from './fontNames';

export type ResolvedFont = {
  /** Absolute source path of the font file. */
  sourcePath: string;
  /** File base name without extension, e.g. `NotoSansSC-Regular`. */
  fileBaseName: string;
  /** Lowercased extension including dot, e.g. `.otf`. */
  ext: string;
  /** Internal PostScript name (iOS lookup key). */
  postScriptName: string;
  /** The name used as the logical identifier in `chains` (the file base name). */
  logicalName: string;
};

export type ResolvedConfig = {
  fonts: ResolvedFont[];
  /** Chains expressed in PostScript names — for iOS. */
  iosChains: Record<string, string[]>;
  /** Chains expressed in file base names — for Android. */
  androidChains: Record<string, string[]>;
};

const SUPPORTED_EXTS = new Set(['.ttf', '.otf']);

/**
 * Validate the plugin config and resolve every logical font name used in
 * `chains` to its platform-specific lookup name. Throws on misconfiguration so
 * prebuild fails loudly rather than producing a silently broken bundle.
 */
export function resolveConfig(
  projectRoot: string,
  config: FontFallbackPluginConfig
): ResolvedConfig {
  if (!config.fonts?.length) {
    throw new Error(
      '[expo-font-fallback] `fonts` must list at least one file.'
    );
  }

  const fonts: ResolvedFont[] = [];
  const byLogicalName = new Map<string, ResolvedFont>();

  for (const rel of config.fonts) {
    const sourcePath = path.resolve(projectRoot, rel);
    const ext = path.extname(sourcePath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) {
      throw new Error(
        `[expo-font-fallback] Unsupported font extension "${ext}" for ${rel}. ` +
          'Only .ttf and .otf are supported.'
      );
    }

    const fileBaseName = path.basename(sourcePath, path.extname(sourcePath));
    const override = config.fontNames?.[rel];

    let postScriptName: string;
    if (override?.ios) {
      postScriptName = override.ios;
    } else {
      const names = safeReadNames(sourcePath, rel);
      postScriptName = names.postScriptName ?? fileBaseName;
    }

    const resolved: ResolvedFont = {
      sourcePath,
      fileBaseName,
      ext,
      postScriptName,
      logicalName: fileBaseName,
    };

    if (byLogicalName.has(resolved.logicalName)) {
      throw new Error(
        `[expo-font-fallback] Duplicate font name "${resolved.logicalName}" ` +
          '(two files share a base name). Rename one of them.'
      );
    }
    byLogicalName.set(resolved.logicalName, resolved);
    fonts.push(resolved);
  }

  const iosChains: Record<string, string[]> = {};
  const androidChains: Record<string, string[]> = {};

  for (const [base, fallbacks] of Object.entries(config.chains ?? {})) {
    const baseFont = byLogicalName.get(base);
    if (!baseFont) {
      throw new Error(
        `[expo-font-fallback] Chain base "${base}" is not among the configured ` +
          '`fonts`. The key must match a font file base name.'
      );
    }
    const resolvedFallbacks = fallbacks.map((name) => {
      const f = byLogicalName.get(name);
      if (!f) {
        throw new Error(
          `[expo-font-fallback] Fallback "${name}" in chain "${base}" is not ` +
            'among the configured `fonts`.'
        );
      }
      return f;
    });

    // iOS keys and values are PostScript names; Android uses file base names.
    iosChains[baseFont.postScriptName] = resolvedFallbacks.map(
      (f) => f.postScriptName
    );
    androidChains[baseFont.fileBaseName] = resolvedFallbacks.map(
      (f) => f.fileBaseName
    );
  }

  return { fonts, iosChains, androidChains };
}

function safeReadNames(sourcePath: string, rel: string) {
  try {
    return readFontNames(sourcePath);
  } catch (e) {
    throw new Error(
      `[expo-font-fallback] Could not read font file ${rel}: ${
        (e as Error).message
      }. Does the path exist?`
    );
  }
}
