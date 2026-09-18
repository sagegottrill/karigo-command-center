/**
 * Build the Petroline browser-icon set from the brand emblem.
 *
 * Source: `public/figma/4eb29c63…png` — the Petroline plane/swoosh emblem on
 * transparency (red + slate). The wordmark asset (`petroline-transparent.png`)
 * is deliberately NOT used: its "PETROLINE TRANSPORT LTD" text is WHITE, so in
 * a browser tab it renders as an invisible squiggle — which is exactly what the
 * client reported. The emblem reads on both light and dark tab bars.
 *
 *   node scripts/make-petroline-icon.cjs --analyze    # print the artwork layout, write nothing
 *   node scripts/make-petroline-icon.cjs              # write the icon files
 *   node scripts/make-petroline-icon.cjs --src=path   # use a different artwork
 *
 * Pure Node (zlib only), so no image toolchain is needed.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUBLIC = "public";
const ANALYZE_ONLY = process.argv.includes("--analyze");
const SRC_ARG = process.argv.find((a) => a.startsWith("--src="));
const SRC = SRC_ARG
  ? SRC_ARG.slice("--src=".length)
  : path.join(PUBLIC, "figma", "4eb29c638e0eaff5b32932e823eced488efc681e.png");

// Allow `require()` for the helpers without running the generator.
if (require.main !== module) {
  module.exports = { decodePng, encodePng, encodeIco, resize, columnRuns, alphaBounds };
  return;
}

/** Below this alpha a pixel counts as invisible (anti-aliasing fringe). */
const ALPHA_MIN = 24;
/** Breathing room around the emblem, as a share of its longest side. */
const PAD_RATIO = 0.1;
/** PNG sizes written for the tab, manifest and Apple touch icon. */
const PNG_SIZES = [
  { name: "favicon-32.png", size: 32 },
  { name: "favicon.png", size: 128 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-512.png", size: 512 },
];
/** Frames packed into favicon.ico (PNG-in-ICO, understood by every current browser). */
const ICO_SIZES = [16, 32, 48];

// ---------------------------------------------------------------- PNG decode
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let ihdr = null;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString("ascii");
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + len;
  }
  if (!ihdr) throw new Error("no IHDR");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.color];
  if (!channels || ihdr.depth !== 8 || ihdr.interlace !== 0) {
    throw new Error(
      `unsupported PNG (depth ${ihdr.depth}, color ${ihdr.color}, interlace ${ihdr.interlace})`,
    );
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0; // left
      const b = prev[i]; // up
      const c = i >= bpp ? prev[i - bpp] : 0; // upper-left
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const d = (y * width + x) * 4;
      if (bpp === 4) {
        out[d] = cur[s];
        out[d + 1] = cur[s + 1];
        out[d + 2] = cur[s + 2];
        out[d + 3] = cur[s + 3];
      } else if (bpp === 3) {
        out[d] = cur[s];
        out[d + 1] = cur[s + 1];
        out[d + 2] = cur[s + 2];
        out[d + 3] = 255;
      } else if (bpp === 2) {
        out[d] = out[d + 1] = out[d + 2] = cur[s];
        out[d + 3] = cur[s + 1];
      } else {
        out[d] = out[d + 1] = out[d + 2] = cur[s];
        out[d + 3] = 255;
      }
    }
    prev = cur;
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO container holding PNG frames. */
function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const entries = [];
  const bodies = [];
  for (const f of frames) {
    const e = Buffer.alloc(16);
    e[0] = f.size >= 256 ? 0 : f.size;
    e[1] = f.size >= 256 ? 0 : f.size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(f.png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    bodies.push(f.png);
    offset += f.png.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

// ------------------------------------------------------------ crop + resize
/** Premultiplied box filter — keeps clean edges on transparent artwork. */
function resize(src, srcW, crop, size) {
  const { x, y, w, h } = crop;
  const out = Buffer.alloc(size * size * 4);
  for (let ty = 0; ty < size; ty++) {
    const y0 = y + Math.floor((ty * h) / size);
    const y1 = Math.max(y0 + 1, y + Math.floor(((ty + 1) * h) / size));
    for (let tx = 0; tx < size; tx++) {
      const x0 = x + Math.floor((tx * w) / size);
      const x1 = Math.max(x0 + 1, x + Math.floor(((tx + 1) * w) / size));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * srcW + sx) * 4;
          const alpha = src[s + 3] / 255;
          r += src[s] * alpha;
          g += src[s + 1] * alpha;
          b += src[s + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const d = (ty * size + tx) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
      }
      out[d + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

/** Bounding box of everything visible in the artwork. */
function alphaBounds(img, min = ALPHA_MIN) {
  const { width, height, data } = img;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= min) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return count === 0
    ? null
    : { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1, coverage: count / (width * height) };
}

/** Contiguous runs of columns that contain any visible pixel. */
function columnRuns(img, min = ALPHA_MIN) {
  const { width, height, data } = img;
  const runs = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    let has = false;
    if (x < width) {
      for (let y = 0; y < height; y++) {
        if (data[(y * width + x) * 4 + 3] > min) {
          has = true;
          break;
        }
      }
    }
    if (has && start === -1) start = x;
    if (!has && start !== -1) {
      runs.push({ x0: start, x1: x - 1, width: x - start });
      start = -1;
    }
  }
  return runs;
}

/** ASCII density map so artwork layout is readable without an image viewer. */
function densityMap(img, cols = 88, rows = 34) {
  const ramp = " .:-=+*#%@";
  const { width, height, data } = img;
  const lines = [];
  for (let ry = 0; ry < rows; ry++) {
    let line = "";
    for (let rx = 0; rx < cols; rx++) {
      const x0 = Math.floor((rx * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * width) / cols));
      const y0 = Math.floor((ry * height) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * height) / rows));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += data[(y * width + x) * 4 + 3];
          n++;
        }
      }
      line += ramp[Math.min(ramp.length - 1, Math.round((sum / n / 255) * (ramp.length - 1)))];
    }
    lines.push(`${String(ry).padStart(2)} ${line}`);
  }
  return lines.join("\n");
}

// ------------------------------------------------------------------- run it
const src = decodePng(fs.readFileSync(SRC));
const bounds = alphaBounds(src);
if (!bounds) throw new Error(`${SRC} has no visible pixels`);

console.log(`source : ${SRC} (${src.width}x${src.height})`);
console.log(
  `content: x ${bounds.minX}..${bounds.maxX} (w ${bounds.w})  y ${bounds.minY}..${bounds.maxY} (h ${bounds.h})  coverage ${(bounds.coverage * 100).toFixed(1)}%`,
);
if (bounds.w / bounds.h > 2.5 || bounds.h / bounds.w > 2.5) {
  console.warn("WARNING: artwork is very elongated — this looks like a wordmark, not an emblem.");
}

if (ANALYZE_ONLY) {
  console.log("\nopaque column runs:", columnRuns(src).map((r) => `${r.x0}..${r.x1}(w${r.width})`).join(" "));
  console.log("\n" + densityMap(src));
  process.exit(0);
}

// Square crop centred on the artwork, with breathing room.
const pad = Math.round(Math.max(bounds.w, bounds.h) * PAD_RATIO);
const side = Math.max(bounds.w, bounds.h) + pad * 2;
const cx = (bounds.minX + bounds.maxX) / 2;
const cy = (bounds.minY + bounds.maxY) / 2;
const crop = {
  x: Math.max(0, Math.min(src.width - side, Math.round(cx - side / 2))),
  y: Math.max(0, Math.min(src.height - side, Math.round(cy - side / 2))),
  w: side,
  h: side,
};
console.log(`crop   : ${JSON.stringify(crop)}`);

for (const { name, size } of PNG_SIZES) {
  const png = encodePng(size, size, resize(src.data, src.width, crop, size));
  fs.writeFileSync(path.join(PUBLIC, name), png);
  console.log(`wrote  : public/${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)}kB)`);
}

const icoFrames = ICO_SIZES.map((size) => ({
  size,
  png: encodePng(size, size, resize(src.data, src.width, crop, size)),
}));
const ico = encodeIco(icoFrames);
fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), ico);
console.log(`wrote  : public/favicon.ico (${ICO_SIZES.join("+")}, ${(ico.length / 1024).toFixed(1)}kB)`);
