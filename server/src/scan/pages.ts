import type { PageConfig, ScannedPage } from '@refit/shared';

/** Files the agent may edit for a scanned page: component, template and styles. */
export function pageFiles(page: ScannedPage): string[] {
  const files = [page.componentFile, page.templateFile, ...page.styleFiles].filter((file): file is string => Boolean(file));
  return [...new Set(files)];
}

/**
 * Combines a fresh scan with the user's page list. Choices the user made (include, sample
 * values, names) survive a rescan; pages the user added by hand are kept; pages that no longer
 * exist in the code are dropped.
 */
export function mergePages(existing: PageConfig[], scanned: ScannedPage[]): PageConfig[] {
  const byRoute = new Map(existing.map((page) => [page.route, page]));
  const merged: PageConfig[] = scanned.map((page) => {
    const previous = byRoute.get(page.route);
    const params: Record<string, string> = {};
    for (const param of page.params) params[param] = previous?.params[param] ?? '';
    return {
      id: page.id,
      name: previous?.name ?? page.name,
      route: page.route,
      include: previous?.include ?? true,
      params,
      files: pageFiles(page),
      ...(page.componentFile ? { componentFile: page.componentFile } : {}),
      manual: false,
    };
  });
  const scannedRoutes = new Set(scanned.map((page) => page.route));
  for (const page of existing) {
    if (page.manual && !scannedRoutes.has(page.route)) merged.push(page);
  }
  return merged;
}
