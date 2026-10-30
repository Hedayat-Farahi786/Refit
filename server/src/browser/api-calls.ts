import type { ApiDiff } from '@refit/shared';

/** Hosts whose requests are part of signing in, not of the app's API. */
export const SIGN_IN_HOSTS = [
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.windows.net',
  'login.live.com',
  'account.live.com',
  'autologon.microsoftazuread-sso.com',
  'device.login.microsoftonline.com',
  'aadcdn.msauth.net',
  'aadcdn.msftauth.net',
];

/** Telemetry whose timing varies from load to load; it would make the comparison flaky. */
const TELEMETRY_HOSTS = [
  'dc.services.visualstudio.com',
  'applicationinsights.azure.com',
  'monitor.azure.com',
  'google-analytics.com',
  'googletagmanager.com',
  'clarity.ms',
  'browser-intake-datadoghq.com',
  'sentry.io',
];

const STATIC_EXTENSIONS = /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|html?|txt|wasm)$/i;
const DEV_SERVER_NOISE = /^\/(?:sockjs-node|ng-cli-ws|@vite|@fs|@id|@ng|__vite|vite-hmr)|__webpack_hmr|\.hot-update\./;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{24,}$/i;
const NUMBER = /^\d+$/;

function hostMatches(hostname: string, list: readonly string[]): boolean {
  return list.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}

export function isSignInUrl(url: string, extraHosts: readonly string[] = []): boolean {
  try {
    const parsed = new URL(url);
    return hostMatches(parsed.hostname, SIGN_IN_HOSTS) || hostMatches(parsed.hostname, extraHosts) || extraHosts.includes(parsed.host);
  } catch {
    return false;
  }
}

/**
 * Turns a request into a stable key like "GET api.example.com/api/requests/:id", or null when it
 * is not an API call (static assets, dev-server traffic, sign-in, telemetry, data: URLs).
 * Numeric IDs, GUIDs and long hex IDs become ":id"; query strings are ignored.
 */
export function normalizeApiCall(method: string, url: string, appOrigin: string, extraSignInHosts: readonly string[] = []): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, appOrigin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isSignInUrl(parsed.href, extraSignInHosts) || hostMatches(parsed.hostname, TELEMETRY_HOSTS)) return null;
  const path = decodeURIComponentSafe(parsed.pathname);
  if (DEV_SERVER_NOISE.test(path)) return null;
  const sameOrigin = parsed.origin === new URL(appOrigin).origin;
  // Files the dev server serves (translations, config JSON under /assets) are not API calls.
  if (sameOrigin && (STATIC_EXTENSIONS.test(path) || path.startsWith('/assets/') || (path.endsWith('.json') && !path.startsWith('/api')))) return null;
  if (!sameOrigin && STATIC_EXTENSIONS.test(path)) return null;
  const normalizedPath = path
    .split('/')
    .map((segment) => (NUMBER.test(segment) || GUID.test(segment) || LONG_HEX.test(segment) ? ':id' : segment))
    .join('/');
  return `${method.toUpperCase()} ${parsed.host}${normalizedPath.replace(/\/+$/, '') || '/'}`;
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Compares two recordings as sets: polling and timing differences do not count, new or missing endpoints do. */
export function diffApiCalls(before: readonly string[], after: readonly string[]): ApiDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...afterSet].filter((call) => !beforeSet.has(call)).sort(),
    removed: [...beforeSet].filter((call) => !afterSet.has(call)).sort(),
    unchanged: [...afterSet].filter((call) => beforeSet.has(call)).length,
  };
}

export function apiChanged(diff: ApiDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0;
}

/** Console errors without volatile parts (URLs with line numbers, numbers), so before/after compare fairly. */
export function normalizeConsoleError(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d+\b/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Console errors that appear after but not before. */
export function newConsoleErrors(before: readonly string[], after: readonly string[]): string[] {
  const known = new Set(before.map(normalizeConsoleError));
  return [...new Set(after.map(normalizeConsoleError))].filter((error) => !known.has(error));
}
