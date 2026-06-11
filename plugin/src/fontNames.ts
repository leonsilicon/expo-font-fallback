import fs from 'fs';

/**
 * Minimal OpenType/TrueType `name` table reader. Extracts the PostScript name
 * (nameID 6) and family name (nameID 1) so the plugin can map a file path to
 * the names iOS and Android use to look the font up.
 *
 * Supports the standard sfnt layout (`.ttf`, `.otf`) and TrueType collections
 * are intentionally not supported (single-face fonts only).
 */
export type FontNameInfo = {
  postScriptName?: string;
  familyName?: string;
};

const NAME_ID_FAMILY = 1;
const NAME_ID_POSTSCRIPT = 6;

export function readFontNames(filePath: string): FontNameInfo {
  const buf = fs.readFileSync(filePath);
  return parseFontNames(buf);
}

export function parseFontNames(buf: Buffer): FontNameInfo {
  const numTables = buf.readUInt16BE(4);
  let nameTableOffset = -1;

  // Table directory starts at offset 12; each record is 16 bytes.
  for (let i = 0; i < numTables; i++) {
    const recordOffset = 12 + i * 16;
    const tag = buf.toString('latin1', recordOffset, recordOffset + 4);
    if (tag === 'name') {
      nameTableOffset = buf.readUInt32BE(recordOffset + 8);
      break;
    }
  }

  if (nameTableOffset < 0) return {};

  const count = buf.readUInt16BE(nameTableOffset + 2);
  const stringOffset = buf.readUInt16BE(nameTableOffset + 4);
  const storageStart = nameTableOffset + stringOffset;

  let postScriptName: string | undefined;
  let familyName: string | undefined;

  for (let i = 0; i < count; i++) {
    const recordOffset = nameTableOffset + 6 + i * 12;
    const platformID = buf.readUInt16BE(recordOffset);
    const encodingID = buf.readUInt16BE(recordOffset + 2);
    const nameID = buf.readUInt16BE(recordOffset + 6);
    const length = buf.readUInt16BE(recordOffset + 8);
    const offset = buf.readUInt16BE(recordOffset + 10);

    if (nameID !== NAME_ID_FAMILY && nameID !== NAME_ID_POSTSCRIPT) continue;

    const start = storageStart + offset;
    const value = decodeNameString(buf, start, length, platformID, encodingID);
    if (!value) continue;

    if (nameID === NAME_ID_POSTSCRIPT && !postScriptName) {
      postScriptName = value;
    } else if (nameID === NAME_ID_FAMILY && !familyName) {
      familyName = value;
    }
  }

  return { postScriptName, familyName };
}

function decodeNameString(
  buf: Buffer,
  start: number,
  length: number,
  platformID: number,
  encodingID: number
): string | undefined {
  if (start + length > buf.length) return undefined;
  const slice = buf.subarray(start, start + length);

  // Platform 3 (Windows) and platform 0 (Unicode) use UTF-16BE. Platform 1
  // (Macintosh) Roman uses single-byte Latin-1 for the names we care about.
  const isUtf16 =
    platformID === 3 ||
    platformID === 0 ||
    (platformID === 3 && encodingID === 1);

  try {
    if (isUtf16) {
      // Node has no native UTF-16BE decoder; swap bytes to LE then decode.
      const swapped = Buffer.from(slice);
      swapped.swap16();
      return swapped.toString('utf16le').replace(/\0/g, '').trim() || undefined;
    }
    return slice.toString('latin1').replace(/\0/g, '').trim() || undefined;
  } catch {
    return undefined;
  }
}
