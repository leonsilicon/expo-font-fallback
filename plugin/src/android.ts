import fs from 'fs';
import path from 'path';
import { type ConfigPlugin, withDangerousMod } from '@expo/config-plugins';
import type { ResolvedConfig } from './resolveNames';

const CHAINS_FILE = 'font_fallback_chains.json';

/**
 * Android: copy fonts into `app/src/main/assets/fonts/` (so `Font.Builder` and
 * `Typeface.createFromAsset` can load them by path) and write the
 * (file-name-keyed) chains JSON — plus the multi-weight `families`, keyed by
 * display name — into `app/src/main/assets/`.
 */
export const withFontFallbackAndroid: ConfigPlugin<ResolvedConfig> = (
  config,
  resolved
) => {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const assetsDir = path.join(platformRoot, 'app', 'src', 'main', 'assets');
      const fontsDir = path.join(assetsDir, 'fonts');
      fs.mkdirSync(fontsDir, { recursive: true });

      // Fonts flagged `bundleAndroid: false` (see `android.skipBundlingFonts`) are NOT
      // copied here: another plugin (e.g. expo-font) already ships them under `res/font/`,
      // and copying them again into assets doubles every such face in the APK/AAB. The
      // runtime registry falls back to the `res/font` resource for those names.
      for (const font of resolved.fonts) {
        if (font.bundleAndroid === false) continue;
        fs.copyFileSync(
          font.sourcePath,
          path.join(fontsDir, font.fileBaseName + font.ext)
        );
      }

      fs.writeFileSync(
        path.join(assetsDir, CHAINS_FILE),
        JSON.stringify(
          {
            ...(resolved.androidDefaultFamily != null && {
              defaultFamily: resolved.androidDefaultFamily,
            }),
            chains: resolved.androidChains,
            ...(Object.keys(resolved.androidFamilies).length > 0 && {
              families: resolved.androidFamilies,
            }),
          },
          null,
          2
        )
      );

      return cfg;
    },
  ]);
};
