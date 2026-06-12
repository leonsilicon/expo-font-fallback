import fs from 'fs';
import path from 'path';
import {
  type ConfigPlugin,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} from '@expo/config-plugins';
import type { ResolvedConfig } from './resolveNames';

const FONTS_SUBDIR = 'Fonts';
const CHAINS_FILE = 'font_fallback_chains.json';

/**
 * iOS: copy fonts into the project, register them in `UIAppFonts`, write the
 * (PostScript-named) chains JSON, and add both to the Xcode resources build
 * phase so they ship inside the app bundle.
 *
 * Fonts flagged `bundle: false` (see `skipBundlingFonts`) are *not* copied or
 * added as build resources — they are already shipped by another plugin (e.g.
 * `expo-font`). Bundling them a second time makes Xcode fail with "Multiple
 * commands produce …/<name>". They still take part in the chains JSON and
 * `UIAppFonts` registration so fallback resolves against the copy that the
 * other plugin bundles.
 */
export const withFontFallbackIos: ConfigPlugin<ResolvedConfig> = (
  config,
  resolved
) => {
  const bundledFonts = resolved.fonts.filter((f) => f.bundle);

  // 1. Copy font files + chains JSON into ios/<project>/Fonts during prebuild.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const projectName = cfg.modRequest.projectName!;
      const destDir = path.join(platformRoot, projectName, FONTS_SUBDIR);
      fs.mkdirSync(destDir, { recursive: true });

      for (const font of bundledFonts) {
        fs.copyFileSync(
          font.sourcePath,
          path.join(destDir, font.fileBaseName + font.ext)
        );
      }

      fs.writeFileSync(
        path.join(destDir, CHAINS_FILE),
        JSON.stringify(
          {
            ...(resolved.iosDefaultFamily != null && {
              defaultFamily: resolved.iosDefaultFamily,
            }),
            chains: resolved.iosChains,
          },
          null,
          2
        )
      );

      return cfg;
    },
  ]);

  // 2. Register every font name in UIAppFonts (including reference-only fonts,
  // so the name resolves even if a sibling plugin forgot to register it). This
  // is a set-union, so duplicates with another plugin's entries are harmless.
  config = withInfoPlist(config, (cfg) => {
    const existing: string[] = Array.isArray(cfg.modResults.UIAppFonts)
      ? (cfg.modResults.UIAppFonts as string[])
      : [];
    const set = new Set(existing);
    for (const font of resolved.fonts) {
      set.add(font.fileBaseName + font.ext);
    }
    cfg.modResults.UIAppFonts = Array.from(set);
    return cfg;
  });

  // 3. Add the bundled files (and the chains JSON) to the Xcode resources build
  // phase. Reference-only fonts are skipped — another plugin ships them.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName!;
    const group = `${projectName}/${FONTS_SUBDIR}`;

    const resourceNames = [
      ...bundledFonts.map((f) => f.fileBaseName + f.ext),
      CHAINS_FILE,
    ];

    for (const name of resourceNames) {
      const filePath = `${group}/${name}`;
      if (!project.hasFile(filePath)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: filePath,
          groupName: group,
          project,
          isBuildFile: true,
          verbose: false,
        });
      }
    }
    return cfg;
  });

  return config;
};
