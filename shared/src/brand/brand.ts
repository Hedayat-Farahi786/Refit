import { isHexColor } from './color.js';
import { SURFACE_FAMILIES, type SurfaceFamily } from './surfaces.js';

export type BrandStatus = 'draft' | 'approved';

export interface Brand {
  id: string;
  name: string;
  status: BrandStatus;
  note: string;
  /** The brand color; it becomes shade 500 of the primary scale. */
  primary: string;
  surface: SurfaceFamily;
  fontFamily: string;
  /** Optional stylesheet URL that loads the font (for example a Google Fonts or company CDN URL). */
  fontImport: string;
  /** Corner radius in pixels for regular controls. */
  radius: number;
  updatedAt?: string;
}

export interface BrandIssue {
  field: keyof Brand;
  message: string;
}

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
    issues.push({ field: 'primary', message: 'Primary color must be a hex color like #1d4f91.' });
  }
  if (!brand.surface || !SURFACE_FAMILIES.includes(brand.surface)) {
    issues.push({ field: 'surface', message: `Surface must be one of: ${SURFACE_FAMILIES.join(', ')}.` });
  }
  if (!brand.fontFamily?.trim()) {
    issues.push({ field: 'fontFamily', message: 'Add a font stack, for example "Inter", Arial, sans-serif.' });
  } else if (/[;{}<>]/.test(brand.fontFamily)) {
    issues.push({ field: 'fontFamily', message: 'The font stack cannot contain ; { } < or >.' });
  }
  if (brand.fontImport && !/^https:\/\/[^\s"'()<>;]+$/.test(brand.fontImport)) {
    issues.push({ field: 'fontImport', message: 'The font stylesheet must be an https:// URL without spaces or quotes.' });
  }
  if (typeof brand.radius !== 'number' || !Number.isFinite(brand.radius) || brand.radius < 0 || brand.radius > 24) {
    issues.push({ field: 'radius', message: 'Corner radius must be a number of pixels between 0 and 24.' });
  }
  return issues;
}
