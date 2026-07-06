/* Karina Assistent — Minimaler ZIP-Schreiber/-Leser (keine Abhängigkeiten).
   Schreiben: unkomprimiert (Methode 0) — lesbar mit jedem ZIP-Programm.
   Lesen: Methode 0 direkt, Methode 8 (deflate) über DecompressionStream. */
(function () {
  'use strict';

  const Zip = {};
  const te = new TextEncoder();
  const td = new TextDecoder();

  /* ---------- CRC32 ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  /* ---------- Schreiben ----------
     entries: [{name: 'pfad/datei.md', data: string | Uint8Array}] -> Blob */
  Zip.write = function (entries) {
    const now = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const e of entries) {
      const nameBytes = te.encode(e.name);
      const data = typeof e.data === 'string' ? te.encode(e.data) : e.data;
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);           // Version
      local.setUint16(6, 0x0800, true);       // UTF-8-Flag
      local.setUint16(8, 0, true);            // Methode 0 = stored
      local.setUint16(10, now.time, true);
      local.setUint16(12, now.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);

      parts.push(new Uint8Array(local.buffer), nameBytes, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, now.time, true);
      cen.setUint16(14, now.date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);

      offset += 30 + nameBytes.length + data.length;
    }

    let centralSize = 0;
    for (const c of central) centralSize += c.length;

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, new Uint8Array(end.buffer)],
      { type: 'application/zip' });
  };

  /* ---------- Lesen ----------
     ArrayBuffer -> Promise<[{name, data: Uint8Array, text()}]> */
  Zip.read = async function (arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    // End-of-central-directory von hinten suchen
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Keine gültige ZIP-Datei.');

    const count = view.getUint16(eocd + 10, true);
    let pos = view.getUint32(eocd + 16, true);
    const entries = [];

    for (let n = 0; n < count; n++) {
      if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP beschädigt.');
      const method = view.getUint16(pos + 10, true);
      const compSize = view.getUint32(pos + 20, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localOff = view.getUint32(pos + 42, true);
      const name = td.decode(buf.subarray(pos + 46, pos + 46 + nameLen));

      // Lokalen Header lesen (Längen können dort abweichen)
      const lNameLen = view.getUint16(localOff + 26, true);
      const lExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      let data = buf.slice(dataStart, dataStart + compSize);

      if (method === 8) {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([data]).stream().pipeThrough(ds);
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else if (method !== 0) {
        throw new Error('Nicht unterstützte ZIP-Kompression: ' + method);
      }

      entries.push({ name, data, text() { return td.decode(this.data); } });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  };

  window.Zip = Zip;
})();
