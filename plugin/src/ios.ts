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
 */
export const withFontFallbackIos: ConfigPlugin<ResolvedConfig> = (
  config,
  resolved
) => {
  // 1. Copy font files + chains JSON into ios/<project>/Fonts during prebuild.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const projectName = cfg.modRequest.projectName!;
      const destDir = path.join(platformRoot, projectName, FONTS_SUBDIR);
      fs.mkdirSync(destDir, { recursive: true });

      for (const font of resolved.fonts) {
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

  // 2. Register the font file names in UIAppFonts.
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

  // 3. Add the copied files to the Xcode resources build phase.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName!;
    const group = `${projectName}/${FONTS_SUBDIR}`;

    // Filenames already shipped as build resources by another plugin (e.g.
    // `expo-font` copying from `public/fonts`). Adding a second CpResource that
    // produces the same `.app/<name>` makes Xcode fail with "Multiple commands
    // produce …". A font shared between this plugin and `expo-font` only needs
    // to be in the bundle once — our chains JSON references it by PostScript
    // name and `UIAppFonts` lists it regardless of which group copies it — so
    // skip re-adding any font whose output basename already exists in the
    // project, even under a different group.
    const existingResourceBaseNames = collectResourceBaseNames(project);

    const resourceNames = [
      ...resolved.fonts.map((f) => f.fileBaseName + f.ext),
      CHAINS_FILE,
    ];

    for (const name of resourceNames) {
      if (existingResourceBaseNames.has(name)) {
        continue;
      }
      const filePath = `${group}/${name}`;
      if (!project.hasFile(filePath)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: filePath,
          groupName: group,
          project,
          isBuildFile: true,
          verbose: false,
        });
        existingResourceBaseNames.add(name);
      }
    }
    return cfg;
  });

  // 4. Final pass: drop duplicate Resources build files that produce the same
  // output filename. The step-3 pre-check above can only see file references
  // that already exist *when this plugin's mod runs* — but `expo-font` (and
  // other font plugins) also add their fonts via `withXcodeProject`, and Expo
  // does not guarantee those mods run before ours. When a shared base font
  // (e.g. `noto-sans.ttf`) is added by both plugins, Xcode emits two
  // `CpResource` commands writing the same `.app/<name>` and fails the build
  // with "Multiple commands produce …". The file contents are identical, so we
  // keep one build file per output basename and remove the rest. Running this
  // as a separately-registered mod means it observes the fully-populated
  // project regardless of plugin ordering.
  config = withXcodeProject(config, (cfg) => {
    dedupeResourceBuildFilesByOutputName(cfg.modResults);
    return cfg;
  });

  return config;
};

type PbxProject = {
  hash: { project: { objects: Record<string, Record<string, unknown>> } };
};

/**
 * Remove duplicate `PBXBuildFile` entries in the Resources build phase that
 * resolve to the same output filename (font basename). Keeps the first
 * occurrence and strips later duplicates from every resources phase. Leaves the
 * underlying `PBXFileReference`s in place — only the build-phase membership
 * (which drives the `CpResource` command) is deduplicated.
 */
function dedupeResourceBuildFilesByOutputName(project: PbxProject): void {
  const objects = project.hash.project.objects;
  const buildFiles = (objects.PBXBuildFile ?? {}) as Record<
    string,
    { fileRef?: string } | string
  >;
  const fileRefs = (objects.PBXFileReference ?? {}) as Record<
    string,
    { path?: string; name?: string } | string
  >;

  const baseNameOf = (raw: string) =>
    path.basename(raw.replace(/^"|"$/g, ''));

  // Map each build-file UUID -> the output filename it produces.
  const buildFileOutputName = new Map<string, string>();
  for (const [uuid, entry] of Object.entries(buildFiles)) {
    if (uuid.endsWith('_comment') || typeof entry !== 'object' || entry == null) {
      continue;
    }
    const fileRef = entry.fileRef;
    if (typeof fileRef !== 'string') continue;
    const ref = fileRefs[fileRef];
    if (typeof ref !== 'object' || ref == null) continue;
    const refPath = ref.path ?? ref.name;
    if (typeof refPath !== 'string') continue;
    buildFileOutputName.set(uuid, baseNameOf(refPath));
  }

  const resourcePhases = (objects.PBXResourcesBuildPhase ?? {}) as Record<
    string,
    { files?: { value: string }[] } | string
  >;

  const seenOutputNames = new Set<string>();
  for (const [uuid, phase] of Object.entries(resourcePhases)) {
    if (uuid.endsWith('_comment') || typeof phase !== 'object' || phase == null) {
      continue;
    }
    if (!Array.isArray(phase.files)) continue;
    phase.files = phase.files.filter((file) => {
      const outputName = buildFileOutputName.get(file.value);
      if (outputName == null) return true;
      if (seenOutputNames.has(outputName)) {
        // Duplicate output: drop this build-file membership (and its orphaned
        // PBXBuildFile entry) so only one CpResource produces the file.
        delete buildFiles[file.value];
        delete buildFiles[`${file.value}_comment`];
        return false;
      }
      seenOutputNames.add(outputName);
      return true;
    });
  }
}

/**
 * Collect the basenames of every file reference in the Xcode project (e.g.
 * `noto-sans.ttf`). Used to detect fonts already added as build resources by
 * another plugin so we don't emit a duplicate CpResource for the same output.
 */
function collectResourceBaseNames(project: {
  hash: { project: { objects: Record<string, unknown> } };
}): Set<string> {
  const baseNames = new Set<string>();
  const fileRefs = (project.hash.project.objects.PBXFileReference ?? {}) as Record<
    string,
    { path?: string; name?: string } | string
  >;

  for (const entry of Object.values(fileRefs)) {
    if (typeof entry !== 'object' || entry == null) {
      continue;
    }
    const ref = entry.path ?? entry.name;
    if (typeof ref !== 'string') {
      continue;
    }
    baseNames.add(path.basename(ref.replace(/^"|"$/g, '')));
  }

  return baseNames;
}
