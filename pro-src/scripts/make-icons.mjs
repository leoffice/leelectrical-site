// Generates the PWA PNG icons from public/icons/icon.svg.
// Prefers ImageMagick (`convert`) when available; otherwise falls back to a
// tiny built-in rasterizer (pure Node + zlib) that draws the same ⚡ bolt on
// an indigo->violet gradient. No npm image deps needed either way.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, "..", "public", "icons");
const svg = join(iconsDir, "icon.svg");
mkdirSync(iconsDir, { recursive: true });

const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true], // full-bleed background for maskable
  ["apple-touch-icon.png", 180, true], // iOS squares it off itself
];

function tryMagick(out, size) {
  for (const bin of ["convert", "magick"]) {
    try {
      execFileSync(bin, ["-background", "none", "-resize", `${size}x${size}`, svg, out], {
        stdio: "pipe",
      });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/* ---------- fallback: hand-rolled PNG writer ---------- */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngFromRGBA(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// point-in-polygon (bolt shape, in 512-space — same as icon.svg)
const BOLT = [
  [296, 64],
  [148, 288],
  [240, 288],
  [216, 448],
  [364, 224],
  [272, 224],
];
function inBolt(x, y) {
  let inside = false;
  for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
    const [xi, yi] = BOLT[i];
    const [xj, yj] = BOLT[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function drawFallback(out, size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 512;
      const v = (y / size) * 512;
      const t = (u + v) / 1024; // diagonal gradient indigo -> violet
      let r = Math.round(0x4f + (0x7c - 0x4f) * t);
      let g = Math.round(0x46 + (0x3a - 0x46) * t);
      let b = Math.round(0xe5 + (0xed - 0xe5) * t);
      if (inBolt(u, v)) {
        r = g = b = 255;
      }
      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  writeFileSync(out, pngFromRGBA(size, size, rgba));
}

for (const [name, size, fullBleed] of targets) {
  const out = join(iconsDir, name);
  // Maskable/apple-touch icons must be full-bleed (no transparent rounded
  // corners) — the built-in rasterizer draws edge-to-edge, so use it there.
  if (fullBleed) drawFallback(out, size);
  else if (!tryMagick(out, size)) drawFallback(out, size);
  console.log("icon:", name, size + "px" + (fullBleed ? " (full-bleed)" : ""));
}
