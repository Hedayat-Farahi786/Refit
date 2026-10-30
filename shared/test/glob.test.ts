import { describe, expect, it } from 'vitest';
import { firstMatchingGlob, globToRegExp, matchesGlob, normalizeRepoPath } from '../src/glob.js';

describe('matchesGlob', () => {
  const cases: Array<[pattern: string, path: string, expected: boolean]> = [
    // ** at the start matches zero or more folders
    ['**/*.service.ts', 'user.service.ts', true],
    ['**/*.service.ts', 'src/app/user.service.ts', true],
    ['**/*.service.ts', 'src/app/user.service.tsx', false],
    ['**/*.service.ts', 'src/app/user-service.ts', false],
    // folder patterns
    ['**/services/**', 'src/app/services/api.ts', true],
    ['**/services/**', 'services/api.ts', true],
    ['**/services/**', 'src/app/services/deep/nested/file.ts', true],
    ['**/services/**', 'src/app/my-services/file.ts', false],
    ['**/services/**', 'src/app/services', false],
    ['**/auth/**', 'src/auth/login.component.ts', true],
    ['**/auth/**', 'src/authors/list.ts', false],
    // ** in the middle
    ['src/**/api/*.ts', 'src/api/client.ts', true],
    ['src/**/api/*.ts', 'src/a/b/api/client.ts', true],
    ['src/**/api/*.ts', 'lib/api/client.ts', false],
    // anchored patterns with a slash
    ['server/**', 'server/index.js', true],
    ['server/**', 'server/routes/a.js', true],
    ['server/**', 'apps/server/index.js', false],
    ['backend/', 'backend/main.py', true],
    // patterns without a slash match the file name at any depth
    ['package.json', 'package.json', true],
    ['package.json', 'projects/admin/package.json', true],
    ['package.json', 'package.json.bak', false],
    ['.env*', '.env', true],
    ['.env*', '.env.local', true],
    ['.env*', 'config/.env.production', true],
    ['.env*', 'environment.ts', false],
    ['**/*msal*', 'src/app/msal-config.ts', true],
    ['**/*msal*', 'src/app/MsalGuard.ts', true],
    ['**/*-routing.module.ts', 'src/app/app-routing.module.ts', true],
    ['**/*-routing.module.ts', 'src/app/routing.module.ts', false],
    ['**/proxy.conf.*', 'proxy.conf.json', true],
    ['**/proxy.conf.*', 'src/proxy.conf.js', true],
    // ? matches exactly one character, never a slash
    ['file?.ts', 'file1.ts', true],
    ['file?.ts', 'file12.ts', false],
    ['a?b', 'a/b', false],
    // * never crosses folders
    ['src/*.ts', 'src/main.ts', true],
    ['src/*.ts', 'src/app/main.ts', false],
    // regex characters in patterns are literal
    ['**/file(1).ts', 'src/file(1).ts', true],
    ['**/a+b.ts', 'a+b.ts', true],
    ['**/a+b.ts', 'aab.ts', false],
    // a bare ** matches everything
    ['**', 'anything/at/all.ts', true],
  ];

  it.each(cases)('%s vs %s -> %s', (pattern, path, expected) => {
    expect(matchesGlob(path, pattern)).toBe(expected);
  });

  it('accepts Windows separators in paths and patterns', () => {
    expect(matchesGlob('src\\app\\services\\api.ts', '**/services/**')).toBe(true);
    expect(matchesGlob('src/app/core/auth.guard.ts', '**\\*.guard.ts')).toBe(true);
    expect(matchesGlob('.\\package.json', 'package.json')).toBe(true);
  });

  it('ignores case by default and can be case sensitive', () => {
    expect(matchesGlob('src/Services/Api.ts', '**/services/**')).toBe(true);
    expect(matchesGlob('src/Services/Api.ts', '**/services/**', { caseSensitive: true })).toBe(false);
  });

  it('treats a leading slash on a pattern as the repo root', () => {
    expect(matchesGlob('angular.json', '/angular.json')).toBe(true);
    expect(matchesGlob('apps/angular.json', '/angular.json')).toBe(false);
  });
});

describe('firstMatchingGlob', () => {
  it('returns the first matching pattern and skips blanks', () => {
    expect(firstMatchingGlob('src/app/user.service.ts', ['', '**/*.guard.ts', '**/*.service.ts'])).toBe('**/*.service.ts');
    expect(firstMatchingGlob('src/app/home.component.html', ['**/*.service.ts'])).toBeUndefined();
  });
});

describe('helpers', () => {
  it('normalizes repo paths', () => {
    expect(normalizeRepoPath('.\\src\\\\app\\x.ts')).toBe('src/app/x.ts');
  });

  it('caches compiled patterns', () => {
    expect(globToRegExp('**/*.ts')).toBe(globToRegExp('**/*.ts'));
  });
});
