export interface PageUrlInput {
  port: number;
  route: string;
  params: Record<string, string>;
  hashRouting: boolean;
  /** The app's base href, for apps served under a path like /portal/. */
  baseHref?: string | null;
}

/** The dev-server URL of a page: route parameters filled in, hash routing and base href respected. */
export function pageUrl(input: PageUrlInput): string {
  const route = input.route
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const name = segment.slice(1).replace(/\?$/, '');
      return encodeURIComponent(input.params[name] ?? '');
    })
    .join('/');
  const base = `/${(input.baseHref ?? '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/+$/, '');
  const origin = `http://localhost:${input.port}`;
  if (input.hashRouting) return `${origin}${base}/#${route === '' ? '/' : route}`;
  return `${origin}${base}${route === '/' ? '/' : route}`;
}
