/**
 * Glob matching for repo-relative paths (protected and sensitive path lists).
 *
 * Rules:
 * - Paths and patterns use forward slashes; backslashes are converted first.
 * - `*` matches any characters except `/`; `?` matches one character except `/`.
 * - `**` as a whole segment matches any number of folders. `**\/` matches zero or more folders,
 *   so `**\/auth/**` also matches `auth/login.ts` at the repo root.
 * - A trailing `/**` (or a trailing `/`) matches everything below that folder.
 * - A pattern without a slash matches the file name at any depth, like .gitignore:
 *   `package.json` also protects `apps/admin/package.json`.
 * - Matching ignores case by default, because Windows and macOS file systems do.
 */

export interface GlobOptions {
  caseSensitive?: boolean;
}

const cache = new Map<string, RegExp>();

export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}

export function globToRegExp(pattern: string, options: GlobOptions = {}): RegExp {
  const key = `${options.caseSensitive ? 's' : 'i'}:${pattern}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let source = normalizeRepoPath(pattern.trim());
  const rooted = source.startsWith('/');
  if (rooted) source = source.slice(1);
  if (source.endsWith('/')) source += '**';
  if (!rooted && !source.includes('/')) source = `**/${source}`;

  const segments = source.split('/');
  let regex = '';
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '**') {
      regex += last ? '.+' : '(?:[^/]+/)*';
      return;
    }
    regex += segmentToRegex(segment) + (last ? '' : '/');
  });

  const compiled = new RegExp(`^${regex}$`, options.caseSensitive ? '' : 'i');
  cache.set(key, compiled);
  return compiled;
}

function segmentToRegex(segment: string): string {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]!;
    if (char === '*') {
      while (segment[i + 1] === '*') i++;
      out += '[^/]*';
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return out;
}

export function matchesGlob(path: string, pattern: string, options?: GlobOptions): boolean {
  return globToRegExp(pattern, options).test(normalizeRepoPath(path));
}

/** Returns the first pattern that matches the path, or undefined. */
export function firstMatchingGlob(path: string, patterns: readonly string[], options?: GlobOptions): string | undefined {
  const normalized = normalizeRepoPath(path);
  return patterns.find((pattern) => pattern.trim() !== '' && globToRegExp(pattern, options).test(normalized));
}
