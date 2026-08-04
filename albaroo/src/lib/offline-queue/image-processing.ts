'use client';

// Section 9.1: EXIF must be read BEFORE compression strips it. Section 7.1: capture
// date, make/model, GPS if present. We do a minimal manual EXIF parse for
// DateTimeOriginal/Make/Model rather than pulling in a heavy library, since we only
// need a handful of tags.
export interface ExtractedExif {
  dateTimeOriginal: Date | null;
  make: string | null;
  model: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  stripped: boolean;
}

export async function extractExif(file: File | Blob): Promise<ExtractedExif> {
  try {
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xffd8) return { dateTimeOriginal: null, make: null, model: null, gpsLat: null, gpsLng: null, stripped: true };

    let offset = 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset);
      if (marker === 0xffe1) {
        const exifData = parseExifSegment(view, offset + 4);
        return { ...exifData, stripped: false };
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch {
    // fall through to "stripped" — screenshots/WhatsApp images legitimately have none
  }
  return { dateTimeOriginal: null, make: null, model: null, gpsLat: null, gpsLng: null, stripped: true };
}

function parseExifSegment(view: DataView, start: number): Omit<ExtractedExif, 'stripped'> {
  // Minimal TIFF/IFD0 walk for the tags we care about. Returns nulls on anything
  // unexpected rather than throwing — EXIF is corroborating evidence only (Section 7.1).
  try {
    const tiffOffset = start + 6; // skip "Exif\0\0"
    const little = view.getUint16(tiffOffset) === 0x4949;
    const get16 = (o: number) => view.getUint16(o, little);
    const get32 = (o: number) => view.getUint32(o, little);
    const ifd0Offset = tiffOffset + get32(tiffOffset + 4);
    const entries = get16(ifd0Offset);

    let make: string | null = null;
    let model: string | null = null;
    let dateTimeOriginal: Date | null = null;

    for (let i = 0; i < entries; i++) {
      const entryOffset = ifd0Offset + 2 + i * 12;
      const tag = get16(entryOffset);
      const valueOffset = tiffOffset + get32(entryOffset + 8);
      if (tag === 0x010f) make = readAsciiString(view, valueOffset);
      if (tag === 0x0110) model = readAsciiString(view, valueOffset);
      if (tag === 0x9003 || tag === 0x0132) {
        const str = readAsciiString(view, valueOffset);
        dateTimeOriginal = parseExifDate(str);
      }
    }

    return { dateTimeOriginal, make, model, gpsLat: null, gpsLng: null };
  } catch {
    return { dateTimeOriginal: null, make: null, model: null, gpsLat: null, gpsLng: null };
  }
}

function readAsciiString(view: DataView, offset: number, maxLen = 32): string | null {
  try {
    let str = '';
    for (let i = 0; i < maxLen; i++) {
      const c = view.getUint8(offset + i);
      if (c === 0) break;
      str += String.fromCharCode(c);
    }
    return str.trim() || null;
  } catch {
    return null;
  }
}

function parseExifDate(str: string | null): Date | null {
  if (!str) return null;
  const m = str.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

// Section 9.1: compress to WebP, max 1600px long edge, target under 400KB.
export async function compressToWebP(file: File | Blob, maxDimension = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > 400_000 && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }

  return { blob, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality);
  });
}
