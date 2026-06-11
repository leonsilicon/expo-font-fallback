import fs from 'fs';
import path from 'path';
import { type ConfigPlugin, withDangerousMod } from '@expo/config-plugins';
import type { ResolvedConfig } from './resolveNames';

const CHAINS_FILE = 'font_fallback_chains.json';

/**
 * Android: copy fonts into `app/src/main/assets/fonts/` (so `Font.Builder` and
 * `Typeface.createFromAsset` can load them by path) and write the
 * (file-name-keyed) chains JSON into `app/src/main/assets/`.
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

      for (const font of resolved.fonts) {
        fs.copyFileSync(
          font.sourcePath,
          path.join(fontsDir, font.fileBaseName + font.ext)
        );
      }

      fs.writeFileSync(
        path.join(assetsDir, CHAINS_FILE),
        JSON.stringify({ chains: resolved.androidChains }, null, 2)
      );

      return cfg;
    },
  ]);
};
