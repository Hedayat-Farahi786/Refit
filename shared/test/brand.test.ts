import { describe, expect, it } from 'vitest';
import {
  brandContrast,
  brandCss,
  brandPresetSource,
  brandPresetTokens,
  contrastRatio,
  generatePalette,
  hexToRgb,
  normalizeHex,
  oklchToHex,
  radiusScale,
  rgbToOklch,
  SHADES,
  validateBrand,
  brandGuide,
  DEFAULT_STATUS_COLORS,
  normalizeBrand,
  primaryLooksLikeDanger,
  SURFACE_PALETTES,
  type Brand,
} from '../src/index.js';
import { readFileSync } from 'node:fs';

/** A blue test brand (the old placeholder values). */
const oerlikon: Brand = {
  id: 'blue-test',
  name: 'Blue test',
  status: 'draft',
  note: 'Placeholder values.',
  primary: '#1d4f91',
  surface: 'slate',
  colors: { ...DEFAULT_STATUS_COLORS },
  fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  headingFontFamily: '',
  fontImport: '',
  radius: 6,
  density: 'comfortable',
};

/** The starter brand Refit ships. */
const oerlikonRed = normalizeBrand(JSON.parse(readFileSync(new URL('../../brand/oerlikon.json', import.meta.url), 'utf8')) as Brand);

describe('color math', () => {
  it('normalizes short and long hex values', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('1D4F91')).toBe('#1d4f91');
    expect(() => normalizeHex('blue')).toThrow(/not a hex color/);
  });

  it('round-trips through OKLCH', () => {
    for (const hex of ['#1d4f91', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#7c3aed', '#f59e0b']) {
      expect(oklchToHex(rgbToOklch(hexToRgb(hex)))).toBe(hex);
    }
  });

  it('maps out-of-gamut colors back into sRGB', () => {
    const hex = oklchToHex({ l: 0.7, c: 0.4, h: 150 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});

describe('generatePalette', () => {
  const brandColors = ['#1d4f91', '#e30613', '#ffd400', '#00a19a', '#111111', '#f2f2f2', '#6b21a8', '#808080'];

  it.each(brandColors)('keeps %s exactly as shade 500', (hex) => {
    expect(generatePalette(hex)['500']).toBe(hex);
  });

  it.each(brandColors)('produces valid hex shades for %s with lightness going down', (hex) => {
    const palette = generatePalette(hex);
    const lightness = SHADES.map((shade) => {
      expect(palette[shade]).toMatch(/^#[0-9a-f]{6}$/);
      return rgbToOklch(hexToRgb(palette[shade])).l;
    });
    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i]!).toBeLessThanOrEqual(lightness[i - 1]! + 1e-6);
    }
  });

  it('makes 50 a very light tint and 950 a deep shade for a mid-dark brand color', () => {
    const palette = generatePalette('#1d4f91');
    expect(contrastRatio(palette['50'], '#ffffff')).toBeLessThan(1.15);
    expect(contrastRatio(palette['950'], '#ffffff')).toBeGreaterThan(12);
  });

  it('keeps near-gray brand colors neutral', () => {
    const { c } = rgbToOklch(hexToRgb(generatePalette('#808080')['100']));
    expect(c).toBeLessThan(0.005);
  });
});

describe('preset tokens', () => {
  it('builds the radius scale around the brand radius', () => {
    expect(radiusScale(6)).toEqual({ none: '0', xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' });
    expect(radiusScale(0).md).toBe('0px');
  });

  it('uses the brand palette, surface references and contrast color', () => {
    const tokens = brandPresetTokens(oerlikon);
    expect(tokens.semantic.primary['500']).toBe('#1d4f91');
    expect(tokens.semantic.colorScheme.light.surface['0']).toBe('#ffffff');
    expect(tokens.semantic.colorScheme.light.surface['200']).toBe('{slate.200}');
    expect(tokens.semantic.colorScheme.light.primary.color).toBe('{primary.500}');
    expect(tokens.semantic.colorScheme.light.primary.contrastColor).toBe('#ffffff');
    expect(tokens.semantic.colorScheme.dark.surface['900']).toBe('{slate.900}');
  });

  it('switches to dark text on light brand colors that fail contrast with white', () => {
    const yellow: Brand = { ...oerlikon, primary: '#ffd400' };
    const contrast = brandContrast(yellow);
    expect(contrast.onPrimary).toBe('dark');
    expect(contrast.meetsAA).toBe(true);
    expect(brandPresetTokens(yellow).semantic.colorScheme.light.primary.contrastColor).toBe('{surface.950}');
  });

  it('reports white text on the Oerlikon blue as accessible', () => {
    expect(brandContrast(oerlikon)).toMatchObject({ onPrimary: 'white', meetsAA: true });
  });

  it('replaces the palettes behind each severity with the brand status colors', () => {
    const tokens = brandPresetTokens(oerlikonRed);
    expect(tokens.primitive.green?.['500']).toBe(oerlikonRed.colors.success);
    expect(tokens.primitive.sky?.['500']).toBe(oerlikonRed.colors.info);
    expect(tokens.primitive.blue?.['500']).toBe(oerlikonRed.colors.info);
    expect(tokens.primitive.orange?.['500']).toBe(oerlikonRed.colors.warn);
    expect(tokens.primitive.yellow?.['500']).toBe(oerlikonRed.colors.warn);
    expect(tokens.primitive.red?.['500']).toBe(oerlikonRed.colors.danger);
  });

  it('gives red brands a dark focus border on inputs, so focus never looks like an error', () => {
    expect(primaryLooksLikeDanger(oerlikonRed)).toBe(true);
    expect(primaryLooksLikeDanger(oerlikon)).toBe(false);
    expect(brandPresetTokens(oerlikonRed).semantic.colorScheme.light.formField.focusBorderColor).toBe('{surface.800}');
    expect(brandPresetTokens(oerlikon).semantic.colorScheme.light.formField.focusBorderColor).toBe('{primary.color}');
  });

  it('tightens fields and table cells for compact density', () => {
    const compact = brandPresetTokens({ ...oerlikon, density: 'compact' });
    expect(compact.semantic.formField).toMatchObject({ paddingX: '0.625rem', paddingY: '0.375rem' });
    expect(compact.components['datatable']).toMatchObject({ bodyCell: { padding: '0.5rem 0.75rem' } });
  });
});

describe('accessible defaults for every neutral family', () => {
  it('keeps unselected segmented-button labels at 4.5:1 or more', () => {
    for (const family of ['slate', 'zinc', 'neutral', 'stone'] as const) {
      const tokens = brandPresetTokens({ ...oerlikon, surface: family });
      expect(tokens.components['togglebutton']).toMatchObject({ colorScheme: { light: { root: { color: '{surface.600}' } } } });
      const palette = SURFACE_PALETTES[family];
      expect(contrastRatio(palette['600'], palette['100']), family).toBeGreaterThanOrEqual(4.5);
      // Muted text (surface 500) on the page background (surface 50) and on white.
      expect(contrastRatio(palette['500'], palette['50']), family).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the Oerlikon starter brand', () => {
  it('is red on white and light grey, valid, and readable', () => {
    expect(validateBrand(oerlikonRed)).toEqual([]);
    expect(oerlikonRed).toMatchObject({ id: 'oerlikon', primary: '#eb0000', surface: 'neutral', status: 'approved' });
    expect(brandContrast(oerlikonRed)).toMatchObject({ onPrimary: 'white', meetsAA: true });
    for (const color of Object.values(oerlikonRed.colors)) expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('normalizeBrand', () => {
  it('fills in fields that older brands do not have', () => {
    const legacy = { id: 'old', name: 'Old', status: 'draft', note: '', primary: '#123456', surface: 'zinc', fontFamily: 'Arial', fontImport: '', radius: 4 } as const;
    expect(normalizeBrand(legacy)).toMatchObject({ colors: DEFAULT_STATUS_COLORS, headingFontFamily: '', density: 'comfortable' });
    expect(normalizeBrand({ ...legacy, colors: { danger: '#990000' } }).colors).toEqual({ ...DEFAULT_STATUS_COLORS, danger: '#990000' });
  });
});

describe('generated files', () => {
  it('writes a preset module that imports from the theme package', () => {
    const source = brandPresetSource(oerlikon);
    expect(source).toContain("import { definePreset } from '@primeuix/themes';");
    expect(source).toContain("import Aura from '@primeuix/themes/aura';");
    expect(source).toContain('export const BrandPreset = definePreset(Aura, {');
    expect(source).toContain("500: '#1d4f91'");
    expect(source).toContain("contrastColor: '#ffffff'");
    expect(source).toContain('export default BrandPreset;');
  });

  it('writes the theme package chosen for the PrimeNG version', () => {
    expect(brandPresetSource(oerlikon, { themePackage: '@primeng/themes', rootFontSizePx: 14 })).toContain(
      "from '@primeng/themes/aura'",
    );
  });

  it('writes brand.css with variables, spacing and typography', () => {
    const css = brandCss({ ...oerlikon, fontImport: 'https://fonts.example.com/inter.css' });
    expect(css.indexOf("@import url('https://fonts.example.com/inter.css');")).toBeLessThan(css.indexOf(':root'));
    expect(css).toContain('--brand-primary-500: #1d4f91;');
    expect(css).toContain('--brand-surface-200: #e2e8f0;');
    expect(css).toContain("--brand-font: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;");
    expect(css).toContain('--brand-radius: 6px;');
    expect(css).toContain('--brand-space-1: 4px;');
    expect(css).toContain('--brand-space-7: 48px;');
    expect(css).toContain('font-size: 14px;');
    expect(css).toMatch(/body \{\n {2}margin: 0;\n {2}font-family: var\(--brand-font\);/);
    expect(css).toContain('--brand-heading-font: var(--brand-font);');
    expect(css).toContain('--brand-danger: #b91c1c;');
  });

  it('includes the layout classes agents build pages from', () => {
    const css = brandCss(oerlikonRed);
    for (const name of ['brand-page', 'brand-page-header', 'brand-toolbar', 'brand-card', 'brand-form-grid', 'brand-field', 'brand-form-actions', 'brand-stat-grid', 'brand-empty']) {
      expect(css).toContain(`.${name} {`);
    }
    expect(css).toContain('--brand-primary-500: #eb0000;');
    expect(css).toContain('--brand-on-primary: #ffffff;');
    expect(css).toContain('--brand-surface-100: #f5f5f5;');
  });

  it('writes a usage guide with the colors, the component map and the red-brand rules', () => {
    const red = brandGuide(oerlikonRed, '21');
    expect(red).toContain('# Oerlikon: design system');
    expect(red).toContain('`#eb0000`');
    expect(red).toContain('PrimeNG 21');
    expect(red).toContain('| Data list | `p-table`');
    expect(red).toContain('red alone never means "error"');
    expect(red).toContain('<div class="brand-page">');
    expect(brandGuide(oerlikon)).not.toContain('red alone never means');
    expect(brandGuide(oerlikon)).toContain('This brand is a draft');
  });

  it('keeps comment-breaking brand names out of generated comments', () => {
    expect(brandCss({ ...oerlikon, name: 'Evil */ body{}' })).not.toContain('Evil */');
  });
});

describe('validateBrand', () => {
  it('accepts the test brand', () => {
    expect(validateBrand(oerlikon)).toEqual([]);
  });

  it('explains each problem', () => {
    const issues = validateBrand({
      ...oerlikon,
      id: 'Bad ID',
      primary: 'blue',
      surface: 'gray' as never,
      fontFamily: 'Arial; } body {',
      fontImport: 'http://insecure.example.com/font.css',
      radius: 99,
      colors: { ...DEFAULT_STATUS_COLORS, warn: 'orange' },
      density: 'roomy' as never,
    });
    expect(issues.map((issue) => issue.field)).toEqual(['id', 'primary', 'surface', 'colors.warn', 'fontFamily', 'fontImport', 'radius', 'density']);
  });
});
