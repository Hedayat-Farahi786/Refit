import { hexToRgb, normalizeHex, oklchToHex, rgbToOklch } from './color.js';
import type { Palette } from './surfaces.js';

/**
 * How far each lighter shade moves from the brand color toward near-white (0 = brand, 1 = top),
 * and how much chroma it keeps. Tuned so tints stay clearly tinted but calm.
 */
const LIGHTER: ReadonlyArray<[shade: '50' | '100' | '200' | '300' | '400', towardTop: number, chroma: number]> = [
  ['50', 0.97, 0.12],
  ['100', 0.9, 0.24],
  ['200', 0.74, 0.42],
  ['300', 0.52, 0.64],
  ['400', 0.27, 0.84],
];

const DARKER: ReadonlyArray<[shade: '600' | '700' | '800' | '900' | '950', towardBottom: number, chroma: number]> = [
  ['600', 0.2, 0.96],
  ['700', 0.4, 0.9],
  ['800', 0.6, 0.82],
  ['900', 0.8, 0.72],
  ['950', 1, 0.6],
];

const TOP_LIGHTNESS = 0.975;

/**
 * Builds a 50–950 scale in OKLCH so steps look even to the eye. Shade 500 is exactly the brand
 * color; lighter and darker shades keep its hue and fit inside sRGB.
 */
export function generatePalette(brandHex: string): Palette {
  const base = normalizeHex(brandHex);
  const { l, c, h } = rgbToOklch(hexToRgb(base));
  const top = Math.max(TOP_LIGHTNESS, l);
  const bottom = Math.min(l, Math.max(0.14, l * 0.4 + 0.04));
  // Near-gray brand colors have an unstable hue; keep their tints neutral instead of tinted.
  const chroma = c < 0.015 ? 0 : c;

  const palette = { '500': base } as Palette;
  for (const [shade, toward, keep] of LIGHTER) {
    palette[shade] = oklchToHex({ l: l + (top - l) * toward, c: chroma * keep, h });
  }
  for (const [shade, toward, keep] of DARKER) {
    palette[shade] = oklchToHex({ l: l - (l - bottom) * toward, c: chroma * keep, h });
  }
  return palette;
}
