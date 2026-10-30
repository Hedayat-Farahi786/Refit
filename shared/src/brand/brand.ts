import { isHexColor } from './color.js';
import { SURFACE_FAMILIES, type SurfaceFamily } from './surfaces.js';

export type BrandStatus = 'draft' | 'approved';
export type BrandDensity = 'comfortable' | 'compact';

/** Colors for messages, tags, validation and status: one hex each, scales are generated. */
export interface BrandStatusColors {
  success: string;
  info: string;
  warn: string;
  danger: string;
}

export interface Brand {
  id: string;
  name: string;
  status: BrandStatus;
  note: string;
  /** The brand color; it becomes shade 500 of the primary scale. */
  primary: string;
  /** The neutral family for backgrounds, borders and text. */
  surface: SurfaceFamily;
  colors: BrandStatusColors;
  fontFamily: string;
  /** Font stack for headings; empty means the body font. */
  headingFontFamily: string;
  /** Optional stylesheet URL that loads the font (for example a Google Fonts or company CDN URL). */
  fontImport: string;
  /** Corner radius in pixels for regular controls. */
  radius: number;
  /** Comfortable for most apps; compact for data-heavy screens. */
  density: BrandDensity;
  updatedAt?: string;
}

/** Calm, accessible status colors that work next to most brand colors. */
export const DEFAULT_STATUS_COLORS: BrandStatusColors = {
  success: '#15803d',
  info: '#0369a1',
  warn: '#b45309',
  danger: '#b91c1c',
};

/** A brand as it may arrive: saved by an older Refit, imported from a file, or typed in. */
export type BrandInput = Omit<Partial<Brand>, 'colors'> &
  Pick<Brand, 'id'> & { colors?: { [K in keyof BrandStatusColors]?: string | undefined } | undefined };

/** Fills in fields that brands saved by older versions of Refit do not have. */
export function normalizeBrand(brand: BrandInput): Brand {
  return {
    name: '',
    status: 'draft',
    note: '',
    primary: '#1d4f91',
    surface: 'slate',
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontImport: '',
    radius: 6,
    ...brand,
    colors: {
      success: brand.colors?.success ?? DEFAULT_STATUS_COLORS.success,
      info: brand.colors?.info ?? DEFAULT_STATUS_COLORS.info,
      warn: brand.colors?.warn ?? DEFAULT_STATUS_COLORS.warn,
      danger: brand.colors?.danger ?? DEFAULT_STATUS_COLORS.danger,
    },
    headingFontFamily: brand.headingFontFamily ?? '',
    density: brand.density === 'compact' ? 'compact' : 'comfortable',
  };
}

export interface BrandIssue {
  field: keyof Brand | `colors.${keyof BrandStatusColors}`;
  message: string;
}

const STATUS_NAMES: Record<keyof BrandStatusColors, string> = { success: 'Success', info: 'Info', warn: 'Warning', danger: 'Danger' };

/** Checks a brand for mistakes and explains each one in plain words. Returns [] when valid. */
export function validateBrand(brand: Partial<Brand>): BrandIssue[] {
  const issues: BrandIssue[] = [];
  if (!brand.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(brand.id)) {
    issues.push({ field: 'id', message: 'Use lowercase letters, numbers and dashes for the ID, like "oerlikon".' });
  }
  if (!brand.name?.trim()) issues.push({ field: 'name', message: 'Give the brand a name.' });
  if (brand.status !== 'draft' && brand.status !== 'approved') {
    issues.push({ field: 'status', message: 'Status must be draft or approved.' });
  }
  if (!brand.primary || !isHexColor(brand.primary)) {
    issues.push({ field: 'primary', message: 'Primary color must be a hex color like #eb0000.' });
  }
  if (!brand.surface || !SURFACE_FAMILIES.includes(brand.surface)) {
    issues.push({ field: 'surface', message: `Surface must be one of: ${SURFACE_FAMILIES.join(', ')}.` });
  }
  for (const key of Object.keys(STATUS_NAMES) as Array<keyof BrandStatusColors>) {
    const value = brand.colors?.[key];
    if (value !== undefined && !isHexColor(value)) {
      issues.push({ field: `colors.${key}`, message: `${STATUS_NAMES[key]} color must be a hex color like #15803d.` });
    }
  }
  for (const [field, value] of [
    ['fontFamily', brand.fontFamily],
    ['headingFontFamily', brand.headingFontFamily],
  ] as const) {
    if (field === 'fontFamily' && !value?.trim()) {
      issues.push({ field, message: 'Add a font stack, for example "Inter", Arial, sans-serif.' });
    } else if (value && /[;{}<>]/.test(value)) {
      issues.push({ field, message: 'A font stack cannot contain ; { } < or >.' });
    }
  }
  if (brand.fontImport && !/^https:\/\/[^\s"'()<>;]+$/.test(brand.fontImport)) {
    issues.push({ field: 'fontImport', message: 'The font stylesheet must be an https:// URL without spaces or quotes.' });
  }
  if (typeof brand.radius !== 'number' || !Number.isFinite(brand.radius) || brand.radius < 0 || brand.radius > 24) {
    issues.push({ field: 'radius', message: 'Corner radius must be a number of pixels between 0 and 24.' });
  }
  if (brand.density !== undefined && brand.density !== 'comfortable' && brand.density !== 'compact') {
    issues.push({ field: 'density', message: 'Density must be comfortable or compact.' });
  }
  return issues;
}
