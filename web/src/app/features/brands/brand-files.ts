import type { Brand } from '@refit/shared';
import { brandCss, brandGuide, brandPresetSource, normalizeBrand, themeTargetForPrimeNg, validateBrand } from '@refit/shared';

export type BrandFileKind = 'preset' | 'css' | 'guide' | 'json';

export interface BrandFile {
  kind: BrandFileKind;
  name: string;
  /** For people: what the file is for. */
  label: string;
  language: 'ts' | 'css' | 'md' | 'json';
  content: string;
}

/** The files Refit writes into an app's src/app/theme folder, plus the brand itself as JSON. */
export function brandFiles(brand: Brand, primengMajor = 21): BrandFile[] {
  const target = themeTargetForPrimeNg(primengMajor);
  const { updatedAt: _updatedAt, ...portable } = brand;
  return [
    { kind: 'preset', name: 'brand-preset.ts', label: 'PrimeNG preset', language: 'ts', content: brandPresetSource(brand, target) },
    { kind: 'css', name: 'brand.css', label: 'CSS variables and layout classes', language: 'css', content: brandCss(brand, target) },
    { kind: 'guide', name: 'BRAND.md', label: 'Usage guide for agents and developers', language: 'md', content: brandGuide(brand, String(primengMajor)) },
    { kind: 'json', name: `${brand.id}.brand.json`, label: 'The brand, to import into another Refit', language: 'json', content: `${JSON.stringify(portable, null, 2)}\n` },
  ];
}

export function downloadText(name: string, content: string): void {
  const type = name.endsWith('.json') ? 'application/json' : name.endsWith('.css') ? 'text/css' : 'text/plain';
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a brand from an exported .brand.json file. Throws an Error that explains the problem. */
export async function readBrandFile(file: File): Promise<Omit<Brand, 'id'> & { id?: string }> {
  if (file.size > 200_000) throw new Error('That file is too large to be a brand file.');
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON. Choose a .brand.json file exported from Refit.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('That file does not contain a brand.');
  const brand = normalizeBrand({ ...(raw as Partial<Brand>), id: 'imported' });
  const issues = validateBrand(brand).filter((issue) => issue.field !== 'id');
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(' '));
  const { id: _id, updatedAt: _updatedAt, ...rest } = brand;
  return { ...rest, ...((raw as { id?: unknown }).id && typeof (raw as { id?: unknown }).id === 'string' ? { id: (raw as { id: string }).id } : {}) };
}
