// Minimal ZIP writer (STORE / no compression). Generated apps are small text
// files, so skipping DEFLATE keeps this dependency-free at a negligible size
// cost. Produces a standard archive that any unzip tool accepts.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time, the format ZIP central directories expect. */
function dosDateTime(d: Date) {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(n: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, true);
    this.push(b);
  }

  u32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n >>> 0, true);
    this.push(b);
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

/**
 * Normalizes a generated file path into a safe, archive-relative path: forward
 * slashes, no leading slash, and no "." or ".." segments, so a path like
 * "../../.ssh/authorized_keys" can't escape the extraction directory
 * (Zip Slip) and instead becomes ".ssh/authorized_keys".
 */
function sanitizeZipPath(rawPath: string): string {
  const parts = rawPath
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..");
  return parts.join("/");
}

export function createZip(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const { time, date } = dosDateTime(now);

  const body = new ByteWriter();
  const central = new ByteWriter();
  let count = 0;
  const usedNames = new Set<string>();

  for (const [rawPath, content] of Object.entries(files)) {
    let path = sanitizeZipPath(rawPath);
    if (!path) continue;

    // Two distinct source paths can normalize to the same archive name
    // (e.g. "a\\b.txt" and "a/b.txt"); rename rather than silently drop one.
    if (usedNames.has(path)) {
      const dot = path.lastIndexOf(".");
      const slash = path.lastIndexOf("/");
      let suffix = 2;
      let candidate: string;
      do {
        candidate =
          dot > slash
            ? `${path.slice(0, dot)} (${suffix})${path.slice(dot)}`
            : `${path} (${suffix})`;
        suffix++;
      } while (usedNames.has(candidate));
      path = candidate;
    }
    usedNames.add(path);

    const nameBytes = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const offset = body.length;

    // Local file header
    body.u32(0x04034b50);
    body.u16(20); // version needed
    body.u16(0); // flags
    body.u16(0); // method: store
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(data.length);
    body.u32(data.length);
    body.u16(nameBytes.length);
    body.u16(0); // extra length
    body.push(nameBytes);
    body.push(data);

    // Central directory entry
    central.u32(0x02014b50);
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0);
    central.u16(0);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(data.length);
    central.u32(data.length);
    central.u16(nameBytes.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number
    central.u16(0); // internal attrs
    central.u32(0); // external attrs
    central.u32(offset);
    central.push(nameBytes);

    count++;
  }

  const centralBytes = central.concat();
  const bodyBytes = body.concat();

  const end = new ByteWriter();
  end.u32(0x06054b50);
  end.u16(0);
  end.u16(0);
  end.u16(count);
  end.u16(count);
  end.u32(centralBytes.length);
  end.u32(bodyBytes.length);
  end.u16(0);

  const parts: BlobPart[] = [
    bodyBytes as unknown as BlobPart,
    centralBytes as unknown as BlobPart,
    end.concat() as unknown as BlobPart,
  ];
  return new Blob(parts, { type: "application/zip" });
}

export function downloadZip(files: Record<string, string>, filename: string) {
  const blob = createZip(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
