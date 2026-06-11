import { describe, it, expect } from '@jest/globals';
import path from 'path';
import { readFontNames, parseFontNames } from '../../plugin/src/fontNames';
import { resolveConfig } from '../../plugin/src/resolveNames';

const FONTS_DIR = path.resolve(__dirname, '../../example/assets/fonts');

describe('font name parsing', () => {
  it('reads the PostScript and family names from a TTF', () => {
    const info = readFontNames(path.join(FONTS_DIR, 'Inter-Regular.ttf'));
    expect(info.postScriptName).toBe('Inter-Regular');
    expect(info.familyName).toBe('Inter');
  });

  it('reads the PostScript name from a CJK OTF (differs from file name)', () => {
    const info = readFontNames(path.join(FONTS_DIR, 'NotoSansSC-Regular.otf'));
    // The bundled Noto Sans CJK SC has PostScript name NotoSansCJKsc-Regular.
    expect(info.postScriptName).toBe('NotoSansCJKsc-Regular');
  });

  it('returns empty for a buffer without a name table', () => {
    // 12-byte header claiming zero tables.
    const buf = Buffer.alloc(12);
    buf.writeUInt16BE(0, 4);
    expect(parseFontNames(buf)).toEqual({});
  });
});

describe('resolveConfig', () => {
  const projectRoot = path.resolve(__dirname, '../../example');
  const baseConfig = {
    fonts: [
      './assets/fonts/Inter-Regular.ttf',
      './assets/fonts/NotoSansSC-Regular.otf',
    ],
    chains: {
      'Inter-Regular': ['NotoSansSC-Regular'],
    },
  };

  it('maps iOS chains to PostScript names and Android chains to file names', () => {
    const resolved = resolveConfig(projectRoot, baseConfig);
    expect(resolved.iosChains).toEqual({
      'Inter-Regular': ['NotoSansCJKsc-Regular'],
    });
    expect(resolved.androidChains).toEqual({
      'Inter-Regular': ['NotoSansSC-Regular'],
    });
  });

  it('honors explicit iOS name overrides', () => {
    const resolved = resolveConfig(projectRoot, {
      ...baseConfig,
      fontNames: {
        './assets/fonts/NotoSansSC-Regular.otf': { ios: 'CustomPSName' },
      },
    });
    expect(resolved.iosChains['Inter-Regular']).toEqual(['CustomPSName']);
  });

  it('throws when a chain references an unconfigured font', () => {
    expect(() =>
      resolveConfig(projectRoot, {
        fonts: ['./assets/fonts/Inter-Regular.ttf'],
        chains: { 'Inter-Regular': ['MissingFont'] },
      })
    ).toThrow(/not.*among the configured/i);
  });

  it('throws on unsupported extensions', () => {
    expect(() =>
      resolveConfig(projectRoot, {
        fonts: ['./assets/fonts/Inter-Regular.woff'],
        chains: {},
      })
    ).toThrow(/Unsupported font extension/i);
  });
});
