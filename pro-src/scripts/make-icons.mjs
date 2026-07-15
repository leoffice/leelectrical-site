// Generates PWA PNG icons + icon.svg from public/le-logo.png.
// Prefers ImageMagick for SVG export when available; otherwise uses Python PIL
// (stdlib on Levi's Mac) to composite the real LE logo edge-to-edge and centered.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const iconsDir = join(root, "public", "icons");
const logoPng = join(root, "public", "le-logo.png");
const svgOut = join(iconsDir, "icon.svg");
mkdirSync(iconsDir, { recursive: true });

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-192.png", 192],
  ["icon-maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
];

const PY = `
import base64, os, sys
from PIL import Image

root = sys.argv[1]
icons_dir = sys.argv[2]
logo_path = sys.argv[3]
svg_out = sys.argv[4]
targets = [t.split(":") for t in sys.argv[5].split(",") if t]

logo = Image.open(logo_path).convert("RGBA")
logo = logo.crop(logo.getbbox())
lw, lh = logo.size
BG = (248, 250, 252, 255)

def render(size):
    canvas = Image.new("RGBA", (size, size), BG)
    target_w = int(size * 0.98)
    scale = target_w / lw
    nw, nh = int(lw * scale), int(lh * scale)
    resized = logo.resize((nw, nh), Image.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas

for name, size_s in targets:
    size = int(size_s)
    out = os.path.join(icons_dir, name)
    render(size).save(out, "PNG")
    print(f"icon: {name} {size}px")

master = render(512)
import io
buf = io.BytesIO()
master.save(buf, format="PNG")
b64 = base64.b64encode(buf.getvalue()).decode("ascii")
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\\n'
    '  <rect width="512" height="512" rx="112" fill="#f8fafc"/>\\n'
    f'  <image href="data:image/png;base64,{b64}" x="0" y="0" width="512" height="512"/>\\n'
    '</svg>\\n'
)
with open(svg_out, "w", encoding="utf-8") as f:
    f.write(svg)
print("icon: icon.svg")
`;

function tryPython() {
  const joined = targets.map(([n, s]) => `${n}:${s}`).join(",");
  const r = spawnSync(
    "python3",
    ["-c", PY, root, iconsDir, logoPng, svgOut, joined],
    { encoding: "utf-8" }
  );
  if (r.status === 0) {
    for (const line of (r.stdout || "").trim().split("\n")) console.log(line);
    return true;
  }
  return false;
}

function tryMagickPngOnly() {
  const svg = join(iconsDir, "icon.svg");
  let ok = true;
  for (const [name, size] of targets) {
    const out = join(iconsDir, name);
    let hit = false;
    for (const bin of ["magick", "convert"]) {
      try {
        execFileSync(bin, ["-background", "#f8fafc", "-resize", `${size}x${size}`, svg, out], {
          stdio: "pipe",
        });
        hit = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!hit) {
      ok = false;
      break;
    }
    console.log(`icon: ${name} ${size}px`);
  }
  return ok;
}

if (!existsSync(logoPng)) {
  console.error("make-icons: missing", logoPng);
  process.exit(1);
}

if (!tryPython() && !tryMagickPngOnly()) {
  console.error("make-icons: need python3+PIL or ImageMagick to build icons from le-logo.png");
  process.exit(1);
}