/**
 * Neutral surface families. The hex values are PrimeUI Aura's primitive palettes
 * (@primeuix/themes/aura/base), so brand.css and the PrimeNG preset agree exactly.
 */

export const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
export type Shade = (typeof SHADES)[number];
export type Palette = Record<Shade, string>;

export const SURFACE_FAMILIES = ['slate', 'zinc', 'neutral', 'stone'] as const;
export type SurfaceFamily = (typeof SURFACE_FAMILIES)[number];

export const SURFACE_PALETTES: Record<SurfaceFamily, Palette> = {
  slate: {
    '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b',
    '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a', '950': '#020617',
  },
  zinc: {
    '50': '#fafafa', '100': '#f4f4f5', '200': '#e4e4e7', '300': '#d4d4d8', '400': '#a1a1aa', '500': '#71717a',
    '600': '#52525b', '700': '#3f3f46', '800': '#27272a', '900': '#18181b', '950': '#09090b',
  },
  neutral: {
    '50': '#fafafa', '100': '#f5f5f5', '200': '#e5e5e5', '300': '#d4d4d4', '400': '#a3a3a3', '500': '#737373',
    '600': '#525252', '700': '#404040', '800': '#262626', '900': '#171717', '950': '#0a0a0a',
  },
  stone: {
    '50': '#fafaf9', '100': '#f5f5f4', '200': '#e7e5e4', '300': '#d6d3d1', '400': '#a8a29e', '500': '#78716c',
    '600': '#57534e', '700': '#44403c', '800': '#292524', '900': '#1c1917', '950': '#0c0a09',
  },
};
