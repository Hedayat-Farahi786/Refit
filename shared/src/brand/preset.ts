import { normalizeBrand, type Brand, type BrandStatusColors } from './brand.js';
import { contrastRatio, hexToRgb, rgbToOklch } from './color.js';
import { generatePalette } from './palette.js';
import { SHADES, SURFACE_PALETTES, type Palette } from './surfaces.js';

/**
 * Design tokens in the shape PrimeUI's `definePreset(Aura, tokens)` expects. Declared as type
 * aliases (not interfaces) so they stay assignable to PrimeUI's index-signature `Preset` type.
 * Every key here exists in Aura from PrimeNG 18 to 21.
 */
export type PresetTokens = {
  primitive: { borderRadius: Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', string> } & Partial<Record<StatusPalette, Palette>>;
  semantic: {
    primary: Palette;
    focusRing: { width: string; style: string; color: string; offset: string; shadow: string };
    formField: { paddingX: string; paddingY: string; borderRadius: string };
    colorScheme: {
      light: SchemeTokens;
      dark: SchemeTokens;
    };
  };
  components: Record<string, Record<string, unknown>>;
};

type SchemeTokens = {
  primary: { color: string; contrastColor: string; hoverColor: string; activeColor: string };
  surface: Record<'0' | (typeof SHADES)[number], string>;
  highlight: { background: string; focusBackground: string; color: string; focusColor: string };
  formField: { borderColor: string; hoverBorderColor: string; focusBorderColor: string };
};

/** Aura's palettes behind each severity: buttons and tags use sky/orange, messages and toasts blue/yellow. */
type StatusPalette = 'green' | 'sky' | 'blue' | 'orange' | 'yellow' | 'red';
const STATUS_PALETTES: Record<keyof BrandStatusColors, StatusPalette[]> = {
  success: ['green'],
  info: ['sky', 'blue'],
  warn: ['orange', 'yellow'],
  danger: ['red'],
};

export interface ThemeTarget {
  /** Package that exports `definePreset` and the Aura preset, e.g. "@primeuix/themes". */
  themePackage: string;
  /** Root font size the component library is designed for (14px up to PrimeNG 21). */
  rootFontSizePx: number;
}

export const DEFAULT_THEME_TARGET: ThemeTarget = { themePackage: '@primeuix/themes', rootFontSizePx: 14 };

/** PrimeNG majors Refit installs (community, MIT releases). */
export const SUPPORTED_PRIMENG_MAJORS = [18, 19, 20, 21] as const;

/** PrimeNG 18 and 19 ship their themes as @primeng/themes; 20 and later as @primeuix/themes. */
export function themeTargetForPrimeNg(major: number): ThemeTarget {
  return { themePackage: major <= 19 ? '@primeng/themes' : '@primeuix/themes', rootFontSizePx: 14 };
}

export const SPACING_SCALE_PX = [4, 8, 12, 16, 24, 32, 48] as const;

export function radiusScale(radius: number): PresetTokens['primitive']['borderRadius'] {
  const r = Math.max(0, Math.round(radius));
  return {
    none: '0',
    xs: `${Math.round(r / 3)}px`,
    sm: `${Math.round((r * 2) / 3)}px`,
    md: `${r}px`,
    lg: `${Math.round((r * 4) / 3)}px`,
    xl: `${r * 2}px`,
  };
}

export interface BrandContrast {
  /** Text color used on primary buttons: white, or the darkest surface when white is too faint. */
  onPrimary: 'white' | 'dark';
  /** Contrast ratio of that text on the brand color. */
  ratio: number;
  /** True when the chosen text color reaches WCAG AA (4.5:1) on the brand color. */
  meetsAA: boolean;
}

export function brandContrast(brand: Pick<Brand, 'primary' | 'surface'>): BrandContrast {
  const primary = generatePalette(brand.primary)['500'];
  const dark = SURFACE_PALETTES[brand.surface]['950'];
  const onWhite = contrastRatio(primary, '#ffffff');
  const onDark = contrastRatio(primary, dark);
  if (onWhite >= 4.5 || onWhite >= onDark) return { onPrimary: 'white', ratio: onWhite, meetsAA: onWhite >= 4.5 };
  return { onPrimary: 'dark', ratio: onDark, meetsAA: onDark >= 4.5 };
}

/**
 * True when the brand color sits next to the danger color on the color wheel (a red brand).
 * Then a red border on a focused input would read as an error, so form focus uses dark neutral.
 */
export function primaryLooksLikeDanger(brand: Pick<Brand, 'primary' | 'colors'>): boolean {
  const primary = rgbToOklch(hexToRgb(brand.primary));
  const danger = rgbToOklch(hexToRgb(brand.colors?.danger ?? '#b91c1c'));
  if (primary.c < 0.08) return false;
  const distance = Math.abs(((primary.h - danger.h + 540) % 360) - 180);
  return distance < 30;
}

const DENSITY = {
  comfortable: { fieldX: '0.75rem', fieldY: '0.5rem', cell: '0.75rem 1rem' },
  compact: { fieldX: '0.625rem', fieldY: '0.375rem', cell: '0.5rem 0.75rem' },
} as const;

export function brandPresetTokens(input: Brand): PresetTokens {
  const brand = normalizeBrand(input);
  const surfaceRefs = { '0': '#ffffff' } as SchemeTokens['surface'];
  for (const shade of SHADES) surfaceRefs[shade] = `{${brand.surface}.${shade}}`;
  const contrast = brandContrast(brand);
  const density = DENSITY[brand.density];
  const redBrand = primaryLooksLikeDanger(brand);

  const statusPalettes: Partial<Record<StatusPalette, Palette>> = {};
  for (const [status, names] of Object.entries(STATUS_PALETTES) as Array<[keyof BrandStatusColors, StatusPalette[]]>) {
    const palette = generatePalette(brand.colors[status]);
    for (const name of names) statusPalettes[name] = palette;
  }

  return {
    primitive: { borderRadius: radiusScale(brand.radius), ...statusPalettes },
    semantic: {
      primary: generatePalette(brand.primary),
      focusRing: { width: '2px', style: 'solid', color: '{primary.color}', offset: '2px', shadow: 'none' },
      formField: { paddingX: density.fieldX, paddingY: density.fieldY, borderRadius: '{border.radius.md}' },
      colorScheme: {
        light: {
          primary: {
            color: '{primary.500}',
            contrastColor: contrast.onPrimary === 'white' ? '#ffffff' : '{surface.950}',
            hoverColor: '{primary.600}',
            activeColor: '{primary.700}',
          },
          surface: surfaceRefs,
          highlight: { background: '{primary.50}', focusBackground: '{primary.100}', color: '{primary.700}', focusColor: '{primary.800}' },
          formField: {
            borderColor: '{surface.300}',
            hoverBorderColor: '{surface.400}',
            focusBorderColor: redBrand ? '{surface.800}' : '{primary.color}',
          },
        },
        dark: {
          primary: { color: '{primary.400}', contrastColor: '{surface.900}', hoverColor: '{primary.300}', activeColor: '{primary.200}' },
          surface: { ...surfaceRefs },
          highlight: {
            background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
            focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
            color: 'rgba(255,255,255,.87)',
            focusColor: 'rgba(255,255,255,.87)',
          },
          formField: { borderColor: '{surface.600}', hoverBorderColor: '{surface.500}', focusBorderColor: redBrand ? '{surface.200}' : '{primary.color}' },
        },
      },
    },
    components: {
      button: { root: { label: { fontWeight: '600' } } },
      datatable: {
        headerCell: { padding: density.cell },
        bodyCell: { padding: density.cell },
        columnTitle: { fontWeight: '600' },
        colorScheme: { light: { headerCell: { background: '{surface.50}', color: '{surface.700}' } } },
      },
      card: { root: { borderRadius: '{border.radius.lg}', shadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' } },
      tag: { root: { fontWeight: '600', borderRadius: '{border.radius.sm}' } },
    },
  };
}

/** TypeScript source for `src/app/theme/brand-preset.ts` in a target app. */
export function brandPresetSource(brand: Brand, target: ThemeTarget = DEFAULT_THEME_TARGET): string {
  const tokens = toTsLiteral(brandPresetTokens(brand), 0);
  return [
    `// Generated by Refit from the brand "${escapeComment(brand.name)}".`,
    '// Change the brand in Refit and regenerate instead of editing this file by hand.',
    `import { definePreset } from '${target.themePackage}';`,
    `import Aura from '${target.themePackage}/aura';`,
    '',
    `export const BrandPreset = definePreset(Aura, ${tokens});`,
    '',
    'export default BrandPreset;',
    '',
  ].join('\n');
}

export interface BrandCssOptions {
  /** Wraps the rules (not the font @import) in a cascade layer, so styles in later layers win. */
  layer?: string;
}

/**
 * `src/app/theme/brand.css`: the brand's CSS variables, base typography and the layout classes
 * agents build pages from (page, header, toolbar, card, form grid, stats, empty state).
 */
export function brandCss(input: Brand, target: ThemeTarget = DEFAULT_THEME_TARGET, options: BrandCssOptions = {}): string {
  const brand = normalizeBrand(input);
  const primary = generatePalette(brand.primary);
  const surface = SURFACE_PALETTES[brand.surface];
  const radius = radiusScale(brand.radius);
  const contrast = brandContrast(brand);
  const header: string[] = [
    `/* Generated by Refit from the brand "${escapeComment(brand.name)}". */`,
    '/* Change the brand in Refit and regenerate instead of editing this file by hand. */',
    '/* How to use it: see BRAND.md next to this file. */',
  ];
  if (brand.fontImport) header.push(`@import url('${brand.fontImport}');`);

  const vars: string[] = [':root {'];
  for (const shade of SHADES) vars.push(`  --brand-primary-${shade}: ${primary[shade]};`);
  vars.push('  --brand-primary: var(--brand-primary-500);');
  vars.push(`  --brand-on-primary: ${contrast.onPrimary === 'white' ? '#ffffff' : surface['950']};`);
  vars.push('  --brand-surface-0: #ffffff;');
  for (const shade of SHADES) vars.push(`  --brand-surface-${shade}: ${surface[shade]};`);
  for (const status of ['success', 'info', 'warn', 'danger'] as const) {
    const palette = generatePalette(brand.colors[status]);
    vars.push(`  --brand-${status}: ${palette['500']};`, `  --brand-${status}-soft: ${palette['50']};`, `  --brand-${status}-border: ${palette['200']};`);
  }
  vars.push(
    '  --brand-bg: var(--brand-surface-50);',
    '  --brand-panel: var(--brand-surface-0);',
    '  --brand-border: var(--brand-surface-200);',
    '  --brand-text: var(--brand-surface-800);',
    '  --brand-text-strong: var(--brand-surface-900);',
    '  --brand-text-muted: var(--brand-surface-500);',
    `  --brand-font: ${brand.fontFamily.trim()};`,
    `  --brand-heading-font: ${brand.headingFontFamily.trim() || 'var(--brand-font)'};`,
    `  --brand-radius-sm: ${radius.sm};`,
    `  --brand-radius: ${radius.md};`,
    `  --brand-radius-lg: ${radius.lg};`,
    `  --brand-radius-xl: ${radius.xl};`,
  );
  SPACING_SCALE_PX.forEach((px, i) => vars.push(`  --brand-space-${i + 1}: ${px}px;`));
  vars.push(
    '  --brand-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
    '  --brand-shadow-md: 0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05);',
    '  --brand-shadow-lg: 0 16px 40px -12px rgb(0 0 0 / 0.18);',
    '  --brand-page-max: 1280px;',
    '}',
    '',
  );

  const base = [
    'html {',
    `  font-size: ${target.rootFontSizePx}px;`,
    '}',
    '',
    'body {',
    '  margin: 0;',
    '  font-family: var(--brand-font);',
    '  color: var(--brand-text);',
    '  background: var(--brand-bg);',
    '  line-height: 1.5;',
    '  -webkit-font-smoothing: antialiased;',
    '  -moz-osx-font-smoothing: grayscale;',
    '}',
    '',
    'h1,',
    'h2,',
    'h3,',
    'h4 {',
    '  font-family: var(--brand-heading-font);',
    '  color: var(--brand-text-strong);',
    '  line-height: 1.25;',
    '  font-weight: 600;',
    '}',
    '',
  ];

  const layout = [
    '/* Layout building blocks. Use them with PrimeNG components; see BRAND.md. */',
    '.brand-page {',
    '  max-width: var(--brand-page-max);',
    '  margin: 0 auto;',
    '  padding: var(--brand-space-6) var(--brand-space-6) var(--brand-space-7);',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--brand-space-5);',
    '}',
    '.brand-page-header {',
    '  display: flex;',
    '  align-items: flex-end;',
    '  justify-content: space-between;',
    '  gap: var(--brand-space-4);',
    '  flex-wrap: wrap;',
    '}',
    '.brand-page-title {',
    '  margin: 0;',
    '  font-size: 1.75rem;',
    '  letter-spacing: -0.01em;',
    '}',
    '.brand-page-subtitle {',
    '  margin: var(--brand-space-1) 0 0;',
    '  color: var(--brand-text-muted);',
    '}',
    '.brand-toolbar {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: var(--brand-space-3);',
    '  flex-wrap: wrap;',
    '}',
    '.brand-toolbar-spacer {',
    '  flex: 1 1 auto;',
    '}',
    '.brand-card {',
    '  background: var(--brand-panel);',
    '  border: 1px solid var(--brand-border);',
    '  border-radius: var(--brand-radius-lg);',
    '  box-shadow: var(--brand-shadow-sm);',
    '  padding: var(--brand-space-5);',
    '}',
    '.brand-card-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: var(--brand-space-3);',
    '  margin-bottom: var(--brand-space-4);',
    '}',
    '.brand-section-title {',
    '  margin: 0;',
    '  font-size: 1.1rem;',
    '}',
    '.brand-form-grid {',
    '  display: grid;',
    '  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));',
    '  gap: var(--brand-space-4) var(--brand-space-5);',
    '}',
    '.brand-field {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--brand-space-2);',
    '}',
    '.brand-field > label {',
    '  font-weight: 600;',
    '  font-size: 0.875rem;',
    '  color: var(--brand-text-strong);',
    '}',
    '.brand-field-hint {',
    '  font-size: 0.8rem;',
    '  color: var(--brand-text-muted);',
    '}',
    '.brand-field-error {',
    '  font-size: 0.8rem;',
    '  color: var(--brand-danger);',
    '}',
    '.brand-form-actions {',
    '  display: flex;',
    '  justify-content: flex-end;',
    '  gap: var(--brand-space-3);',
    '  padding-top: var(--brand-space-4);',
    '  border-top: 1px solid var(--brand-border);',
    '}',
    '.brand-stat-grid {',
    '  display: grid;',
    '  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));',
    '  gap: var(--brand-space-4);',
    '}',
    '.brand-stat {',
    '  background: var(--brand-panel);',
    '  border: 1px solid var(--brand-border);',
    '  border-radius: var(--brand-radius-lg);',
    '  padding: var(--brand-space-4) var(--brand-space-5);',
    '}',
    '.brand-stat-label {',
    '  font-size: 0.8rem;',
    '  color: var(--brand-text-muted);',
    '}',
    '.brand-stat-value {',
    '  margin-top: var(--brand-space-1);',
    '  font-size: 1.6rem;',
    '  font-weight: 600;',
    '  color: var(--brand-text-strong);',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '.brand-empty {',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  gap: var(--brand-space-2);',
    '  padding: var(--brand-space-7) var(--brand-space-5);',
    '  text-align: center;',
    '  color: var(--brand-text-muted);',
    '}',
    '.brand-empty-title {',
    '  margin: 0;',
    '  font-size: 1.05rem;',
    '  color: var(--brand-text-strong);',
    '}',
    '.brand-muted {',
    '  color: var(--brand-text-muted);',
    '}',
    '.brand-link {',
    '  color: var(--brand-primary-700);',
    '  text-underline-offset: 2px;',
    '}',
    '@media (max-width: 640px) {',
    '  .brand-page {',
    '    padding: var(--brand-space-4) var(--brand-space-4) var(--brand-space-6);',
    '  }',
    '  .brand-card {',
    '    padding: var(--brand-space-4);',
    '  }',
    '}',
  ];

  const lines = [...vars, ...base, ...layout];
  const body = options.layer ? [`@layer ${options.layer} {`, ...lines.map((line) => (line ? `  ${line}` : line)), '}'] : lines;
  return [...header, '', ...body, ''].join('\n');
}

/**
 * `src/app/theme/BRAND.md`: how to use the brand, written for the agents that modernize pages
 * and for the developers who review them.
 */
export function brandGuide(input: Brand, primengVersion = '21'): string {
  const brand = normalizeBrand(input);
  const primary = generatePalette(brand.primary);
  const contrast = brandContrast(brand);
  const redBrand = primaryLooksLikeDanger(brand);
  const status = brand.colors;
  return [
    `# ${brand.name}: design system`,
    '',
    `Generated by Refit. Components: PrimeNG ${primengVersion} with the BrandPreset (\`brand-preset.ts\`). Variables and layout classes: \`brand.css\`.`,
    brand.status === 'draft' ? '\n> This brand is a draft. Values may change before it is approved.\n' : '',
    '## Colors',
    '',
    '| Role | Value | Use it for |',
    '|---|---|---|',
    `| Brand | \`${primary['500']}\` (\`--brand-primary\`) | The one primary action per area, the active navigation item, selected states, focus |`,
    `| Brand, darker | \`${primary['700']}\` (\`--brand-primary-700\`) | Links and brand-colored text on white |`,
    `| Page background | \`${SURFACE_PALETTES[brand.surface]['50']}\` (\`--brand-bg\`) | Behind cards and tables |`,
    '| Cards and panels | `#ffffff` (`--brand-panel`) | Content surfaces |',
    `| Borders | \`${SURFACE_PALETTES[brand.surface]['200']}\` (\`--brand-border\`) | Dividers, card borders |`,
    `| Text | \`${SURFACE_PALETTES[brand.surface]['800']}\` / \`${SURFACE_PALETTES[brand.surface]['500']}\` | Body text / secondary text |`,
    `| Success | \`${status.success}\` | \`severity="success"\` |`,
    `| Info | \`${status.info}\` | \`severity="info"\` |`,
    `| Warning | \`${status.warn}\` | \`severity="warn"\` |`,
    `| Danger | \`${status.danger}\` | \`severity="danger"\`, validation errors |`,
    '',
    `Text on the brand color is ${contrast.onPrimary === 'white' ? 'white' : 'dark'} (contrast ${contrast.ratio.toFixed(1)}:1).`,
    '',
    'Rules:',
    '- Use the brand color sparingly. Most of the screen is white and light grey; color marks what matters.',
    '- Never hardcode a hex value. Use PrimeNG severities and tokens, or the `--brand-*` variables.',
    '- Never use the brand color for large backgrounds or for long text.',
    ...(redBrand
      ? [
          '- The brand color is red, so red alone never means "error" here. Danger actions use',
          '  `severity="danger"` with `[outlined]="true"` and an icon (for example `pi pi-trash`), and always ask',
          '  for confirmation with `p-confirmdialog`. Errors always come with an icon and a sentence.',
          '- Focused inputs get a dark border (not red), so focus never looks like a validation error.',
        ]
      : []),
    '',
    '## Type and shape',
    '',
    `- Body font: \`${brand.fontFamily}\`${brand.headingFontFamily ? `; headings: \`${brand.headingFontFamily}\`` : ''}. Root size ${DEFAULT_THEME_TARGET.rootFontSizePx}px.`,
    '- Page title 1.75rem semibold, section titles 1.1rem semibold, body 1rem, hints 0.8rem.',
    `- Corner radius ${brand.radius}px on controls (\`--brand-radius\`), ${radiusScale(brand.radius).lg} on cards. Spacing only from \`--brand-space-1\` to \`--brand-space-7\` (4, 8, 12, 16, 24, 32, 48 px).`,
    `- Density: ${brand.density}.`,
    '',
    '## Page skeleton',
    '',
    '```html',
    '<div class="brand-page">',
    '  <header class="brand-page-header">',
    '    <div>',
    '      <h1 class="brand-page-title">Requests</h1>',
    '      <p class="brand-page-subtitle">Everything your team asked for, newest first.</p>',
    '    </div>',
    '    <p-button label="New request" icon="pi pi-plus" />',
    '  </header>',
    '',
    '  <div class="brand-toolbar">',
    '    <p-iconfield><p-inputicon class="pi pi-search" /><input pInputText placeholder="Search requests" /></p-iconfield>',
    '    <p-select [options]="statuses" placeholder="All statuses" />',
    '    <span class="brand-toolbar-spacer"></span>',
    '    <p-button label="Export" icon="pi pi-download" severity="secondary" [outlined]="true" />',
    '  </div>',
    '',
    '  <section class="brand-card">',
    '    <!-- p-table here -->',
    '  </section>',
    '</div>',
    '```',
    '',
    '## Which component for what',
    '',
    '| Need | Use |',
    '|---|---|',
    '| Main action | `p-button` (one per area); secondary: `severity="secondary" [outlined]="true"`; quiet: `[text]="true"` |',
    '| Icon-only action | `p-button` with `icon`, `[text]="true"`, `ariaLabel` and `pTooltip` |',
    '| Text, number, date input | `pInputText`, `p-inputnumber`, `p-datepicker`, each with a `<label for>` above it inside `.brand-field` |',
    '| Choice | `p-select` (many options), `p-selectbutton` (2–4 options), `p-radiobutton`, `p-checkbox`, `p-toggleswitch` (on/off) |',
    '| Search | `p-iconfield` with `p-inputicon class="pi pi-search"` and `pInputText` |',
    '| Data list | `p-table` with `[paginator]="true"` when there are more than 10 rows, sortable columns where the old table sorted, `[scrollable]="true"` for wide tables |',
    '| Status | `p-tag` with `severity` (success, info, warn, danger, secondary) |',
    '| Grouped content | `.brand-card` with `.brand-card-header`; `p-tabs` for 2–6 sections |',
    '| Key numbers | `.brand-stat-grid` with `.brand-stat`, `.brand-stat-label`, `.brand-stat-value` |',
    '| Form | `.brand-form-grid` of `.brand-field`, then `.brand-form-actions` with Cancel (text) and Save (primary) |',
    '| Messages | `p-message` inline; `p-toast` after an action, with the same verb as the button ("Request saved") |',
    '| Confirm | `p-confirmdialog` for anything destructive or irreversible |',
    '| Dialog | `p-dialog` with `[modal]="true"` for short, focused tasks |',
    '| Navigation | `p-menu`, `p-menubar` or `p-breadcrumb`; keep every existing link |',
    '| Loading | `p-skeleton` shaped like the content; `p-progressbar mode="indeterminate"` for long actions |',
    '| Empty | `.brand-empty` with a title, one sentence on what to do next, and the action button |',
    '',
    '## Every state is designed',
    '',
    '- Loading: skeletons, never a blank area.',
    '- Empty: say what belongs here and how to add it.',
    '- Error: what happened and what to do, in a `p-message severity="error"`.',
    '- Success: a toast after the action.',
    '',
    '## Accessibility',
    '',
    '- Every input has a visible label; every icon-only button has `ariaLabel` and a tooltip.',
    '- Keyboard focus stays visible (the preset draws a focus ring). Contrast at least 4.5:1.',
    '- Usable at 390 px wide: tables scroll horizontally, forms become one column, no sideways page scroll.',
    '',
  ]
    .filter((line, index, all) => !(line === '' && all[index - 1] === ''))
    .join('\n');
}

function escapeComment(text: string): string {
  return text.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
}

const IDENTIFIER = /^(?:[A-Za-z_$][\w$]*|\d+)$/;

/** Serializes plain data as a readable TypeScript object literal (unquoted keys where possible). */
function toTsLiteral(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (value === null || typeof value !== 'object') return typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : String(value);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const body = entries
    .map(([key, v]) => `${pad}${IDENTIFIER.test(key) ? key : `'${key}'`}: ${toTsLiteral(v, depth + 1)}`)
    .join(',\n');
  return `{\n${body},\n${end}}`;
}
