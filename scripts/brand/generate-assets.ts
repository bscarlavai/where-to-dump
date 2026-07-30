/**
 * Brand asset generator. Renders the logo (Lucide trash-2 + location pin,
 * ISC-licensed icon) into all site assets via macOS Quick Look (qlmanage).
 *
 * Treatments (decided 2026-07-30):
 *   - Logo: transparent ground, context-aware strokes (LogoMark.tsx renders
 *     this inline; the PNG here is for external use)
 *   - Favicon / OG: off-white plate with hairline border
 *
 * Outputs:
 *   public/favicon.png (64)          plate
 *   public/apple-touch-icon.png (180) full-bleed plate (iOS masks corners)
 *   public/logo.png (512)            transparent, charcoal strokes
 *   src/app/favicon.ico (32)         plate, PNG-in-ICO
 *   src/app/opengraph-image.png      1200x630 plate mark + wordmark
 *
 * Usage: npx tsx scripts/brand/generate-assets.ts
 */

import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, renameSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..');
const work = resolve(tmpdir(), 'wtd-brand');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// ─── Mark geometry (64x64 space) ─────────────────────────────
const TRASH2 =
  '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
const PIN =
  'M32 62 C32 62 8 38 8 23 C8 9 19 2 32 2 C45 2 56 9 56 23 C56 38 32 62 32 62 Z';

function can(stroke: string, w = 2.2): string {
  const s = 2.0, cx = 30.5, cy = 30;
  return `<g transform="translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s})" stroke="${stroke}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round">${TRASH2}</g>`;
}
function pin(keyline: string): string {
  return `<path transform="translate(33.5 33) scale(0.42)" d="${PIN}" fill="#FF6B1A" stroke="${keyline}" stroke-width="4"/><circle transform="translate(33.5 33) scale(0.42)" cx="32" cy="24" r="8" fill="${keyline}"/>`;
}
const svg = (size: string, inner: string, viewBox = '0 0 64 64') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${size}>${inner}</svg>`;

// Plate (favicon/OG treatment): off-white tile, hairline border
const PLATE = `<rect x="0.75" y="0.75" width="62.5" height="62.5" rx="8" fill="#F5F5F4" stroke="#CFCFCE" stroke-width="1.5"/>`;
const PLATE_FULLBLEED = `<rect width="64" height="64" fill="#F5F5F4"/>`;

const plateMark = PLATE + can('#1B1C1E') + pin('#F5F5F4');
const fullBleedMark = PLATE_FULLBLEED + can('#1B1C1E') + pin('#F5F5F4');
const transparentMark = can('#1B1C1E') + pin('#FFFFFF');

// ─── OG image (1200x630) ─────────────────────────────────────
// qlmanage forces square output, so draw the 630-tall band centered in a
// 1200x1200 canvas and center-crop afterward with sips.
const OG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
  <g transform="translate(0 285)">
    <rect width="1200" height="630" fill="#F5F5F4"/>
    <rect y="614" width="1200" height="16" fill="#FF6B1A"/>
    <g transform="translate(120 155) scale(4.6)">${PLATE + can('#1B1C1E') + pin('#F5F5F4')}</g>
    <text x="470" y="305" font-family="Avenir Next Condensed, Arial Narrow, Arial" font-size="88" font-weight="700" fill="#1B1C1E" letter-spacing="1">WHERE TO <tspan fill="#FF6B1A">DUMP</tspan></text>
    <text x="474" y="366" font-family="Avenir Next, Helvetica Neue, Arial" font-size="25" fill="#545456">Find landfills, transfer stations &amp; recycling centers near you</text>
  </g>
</svg>`;

// ─── Render helpers ──────────────────────────────────────────
function render(name: string, content: string, size: number, outPath: string) {
  const svgPath = resolve(work, `${name}.svg`);
  writeFileSync(svgPath, content);
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', work, svgPath], { stdio: 'ignore' });
  renameSync(`${svgPath}.png`, resolve(root, outPath));
  console.log(`${outPath} (${size}px)`);
}

render('favicon', svg('width="64" height="64"', plateMark), 64, 'public/favicon.png');
render('apple', svg('width="180" height="180"', fullBleedMark), 180, 'public/apple-touch-icon.png');
render('logo', svg('width="512" height="512"', transparentMark), 512, 'public/logo.png');
render('og', OG, 1200, 'src/app/opengraph-image.png');
// Center-crop the square render down to the 1200x630 band
execFileSync('sips', ['-c', '630', '1200', resolve(root, 'src/app/opengraph-image.png')], { stdio: 'ignore' });

// favicon.ico: 32px plate PNG wrapped in an ICO container
render('ico32', svg('width="32" height="32"', plateMark), 32, 'public/.ico32.png');
const png = readFileSync(resolve(root, 'public/.ico32.png'));
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type: icon
header.writeUInt16LE(1, 4);      // count
header.writeUInt8(32, 6);        // width
header.writeUInt8(32, 7);        // height
header.writeUInt8(0, 8);         // palette
header.writeUInt8(0, 9);         // reserved
header.writeUInt16LE(1, 10);     // planes
header.writeUInt16LE(32, 12);    // bpp
header.writeUInt32LE(png.length, 14); // data size
header.writeUInt32LE(22, 18);    // data offset
writeFileSync(resolve(root, 'src/app/favicon.ico'), Buffer.concat([header, png]));
rmSync(resolve(root, 'public/.ico32.png'));
console.log('src/app/favicon.ico (32px)');

rmSync(work, { recursive: true, force: true });
