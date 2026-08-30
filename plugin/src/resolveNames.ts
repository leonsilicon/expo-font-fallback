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
  /**
   * Whether this plugin should bundle the font (copy it into the project and add
   * it as an Xcode/Gradle resource). `false` for fonts already shipped by
   * another plugin — they are still used for chain/name resolution but not
   * re-bundled, which would otherwise collide at build time. See
   * `ios.skipBundlingFonts`.
   */
  bundle: boolean;
  /**
   * The Android counterpart of {@link bundle}. `false` for fonts already shipped
   * as an Android font resource by another plugin (e.g. `expo-font`'s
   * `res/font/`) — they are not copied into `assets/fonts/`, and the runtime
   * resolves them from resources instead. See `android.skipBundlingFonts`.
   */
  bundleAndroid: boolean;
};

export type ResolvedConfig = {
  fonts: ResolvedFont[];
  /** Chains expressed in PostScript names — for iOS. */
  iosChains: Record<string, string[]>;
  /** Chains expressed in file base names — for Android. */
  androidChains: Record<string, string[]>;
  /** Default family as a PostScript name (iOS), if configured. */
  iosDefaultFamily?: string;
  /** Default family as a file base name (Android), if configured. */
  androidDefaultFamily?: string;
  /**
   * Multi-weight families keyed by display name, with faces and chain expressed
   * in file base names — for Android. See `FontFallbackPluginConfig.families`.
   */
  androidFamilies: Record<string, { faces: string[]; chain: string[] }>;
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

  // Fonts the host already bundles via another plugin — reference-only here.
  // Entries may be given with or without extension (e.g. `noto-sans` or
  // `noto-sans.ttf`); both forms are matched.
  const skipBundlingAndroid = new Set(
    (config.android?.skipBundlingFonts ?? []).map((name) =>
      name.replace(/\.(ttf|otf)$/i, '')
    )
  );
  const skipBundling = new Set(
    (config.ios?.skipBundlingFonts ?? []).map((name) =>
      name.replace(/\.(ttf|otf)$/i, '')
    )
  );

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
      bundle: !skipBundling.has(fileBaseName),
      bundleAndroid: !skipBundlingAndroid.has(fileBaseName),
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

  const androidFamilies: Record<string, { faces: string[]; chain: string[] }> =
    {};
  for (const [familyName, family] of Object.entries(config.families ?? {})) {
    if (!family.faces?.length) {
      throw new Error(
        `[expo-font-fallback] Family "${familyName}" must list at least one face.`
      );
    }
    const requireFont = (name: string, role: string) => {
      const f = byLogicalName.get(name);
      if (!f) {
        throw new Error(
          `[expo-font-fallback] ${role} "${name}" of family "${familyName}" is ` +
            'not among the configured `fonts`.'
        );
      }
      return f;
    };
    androidFamilies[familyName] = {
      faces: family.faces.map((name) => requireFont(name, 'Face').fileBaseName),
      chain: (family.chain ?? []).map(
        (name) => requireFont(name, 'Chain entry').fileBaseName
      ),
    };
  }

  let iosDefaultFamily: string | undefined;
  let androidDefaultFamily: string | undefined;
  if (config.defaultFamily != null) {
    if (androidFamilies[config.defaultFamily] != null) {
      // A multi-weight family: both platforms resolve it by its display name
      // (CoreText family matching on iOS; the registered cascaded Typeface on
      // Android), so bare weighted text picks the real face.
      iosDefaultFamily = config.defaultFamily;
      androidDefaultFamily = config.defaultFamily;
    } else {
      const defaultFont = byLogicalName.get(config.defaultFamily);
      if (!defaultFont) {
        throw new Error(
          `[expo-font-fallback] defaultFamily "${config.defaultFamily}" is not ` +
            'among the configured `fonts` or `families`. It must match a font ' +
            'file base name or a family name.'
        );
      }
      iosDefaultFamily = defaultFont.postScriptName;
      androidDefaultFamily = defaultFont.fileBaseName;
    }
  }

  return {
    fonts,
    iosChains,
    androidChains,
    iosDefaultFamily,
    androidDefaultFamily,
    androidFamilies,
  };
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
