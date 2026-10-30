import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appRelative, classifyPath, enforceGuard, isDataAccessCode, type GuardPolicy } from '../../src/guard/guard.js';
import { commitAll, excludeFromGit, headCommit } from '../../src/git/workspace.js';
import { REPO_ROOT, gitIn, tempDir } from '../helpers/repos.js';
import { loadConfig } from '../../src/config/config.js';

const config = await loadConfig({ defaultsFile: path.join(REPO_ROOT, 'refit.config.json'), localFile: path.join(REPO_ROOT, 'no-local-config.json') });
const policy: GuardPolicy = { appDir: '', protectedPaths: config.protectedPaths, sensitivePaths: config.sensitivePaths };

describe('classifyPath', () => {
  it.each([
    ['src/app/core/user.service.ts', true, false],
    ['src/app/services/http-client.ts', true, false],
    ['src/environments/environment.prod.ts', true, false],
    ['src/app/app.routes.ts', true, false],
    ['src/app/app-routing.module.ts', true, false],
    ['src/app/auth/login.component.ts', true, false],
    ['src/app/msal-config.ts', true, false],
    ['package.json', true, false],
    ['package-lock.json', true, false],
    ['.env.local', true, false],
    ['src/app/pages/home/home.component.html', false, false],
    ['src/app/pages/home/home.component.scss', false, false],
    ['angular.json', false, true],
    ['src/app/app.config.ts', false, true],
    ['src/main.ts', false, true],
    ['src/app/models/request.model.ts', false, true],
  ])('%s -> protected %s, sensitive %s', (file, isProtected, isSensitive) => {
    expect(classifyPath(file, policy)).toMatchObject({ protected: isProtected, sensitive: isSensitive });
  });

  it('protects everything outside the app folder of a bigger repo', () => {
    const inFolder: GuardPolicy = { ...policy, appDir: 'ClientApp' };
    expect(classifyPath('Controllers/HomeController.cs', inFolder)).toMatchObject({ protected: true, reason: 'outside the app folder (ClientApp)' });
    expect(classifyPath('ClientApp/src/app/home/home.component.html', inFolder).protected).toBe(false);
    expect(classifyPath('ClientApp/src/app/core/api.service.ts', inFolder).protected).toBe(true);
    expect(classifyPath('ClientApp/angular.json', inFolder).sensitive).toBe(true);
    expect(appRelative('ClientApp/src/x.ts', 'ClientApp')).toBe('src/x.ts');
    expect(appRelative('Other/x.ts', 'ClientApp')).toBeNull();
  });
});

describe('isDataAccessCode', () => {
  it('protects non-component code that talks to the backend, whatever its name', () => {
    expect(isDataAccessCode('src/app/user-api.ts', "export class UserApi { private http = inject(HttpClient); }")).toBe(true);
    expect(isDataAccessCode('src/app/load.ts', 'export const load = () => fetch("/api/x");')).toBe(true);
    expect(isDataAccessCode('src/app/home.ts', '@Component({}) export class Home { http = inject(HttpClient); }')).toBe(false);
    expect(isDataAccessCode('src/app/home.html', 'HttpClient')).toBe(false);
    expect(isDataAccessCode('src/app/user.spec.ts', 'HttpClient')).toBe(false);
    expect(isDataAccessCode('src/app/format.ts', 'export const x = 1;')).toBe(false);
  });
});

describe('enforceGuard', () => {
  it('reverts protected changes (edited, new and deleted) and keeps the rest', async () => {
    const repo = await tempDir();
    const write = async (file: string, content: string) => {
      await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
      await fs.writeFile(path.join(repo, file), content);
    };
    await write('src/app/home.component.html', '<h1>Home</h1>\n');
    await write('src/app/core/user.service.ts', 'export class UserService {}\n');
    await write('src/app/user-api.ts', 'export class UserApi { http = inject(HttpClient); }\n');
    await write('src/environments/environment.ts', 'export const environment = {};\n');
    await write('angular.json', '{}\n');
    await write('.gitignore', '.env*\nnode_modules/\n');
    await gitIn(repo, 'init', '-q', '-b', 'main');
    await excludeFromGit(repo, '.refit/');
    await gitIn(repo, 'add', '-A');
    await gitIn(repo, 'commit', '-q', '-m', 'base');
    const checkpoint = await headCommit(repo);

    // What an agent might do:
    await write('src/app/home.component.html', '<h1 class="title">Home</h1>\n');
    await write('src/app/core/user.service.ts', 'export class UserService { changed = true; }\n');
    await write('src/app/user-api.ts', 'export class UserApi { http = inject(HttpClient); extra = 1; }\n');
    await fs.rm(path.join(repo, 'src/environments/environment.ts'));
    await write('src/app/core/new.service.ts', 'export class NewService {}\n');
    await write('angular.json', '{ "changed": true }\n');
    await write('.env.local', 'SECRET=1\n');
    await write('.refit/shots/note.txt', 'ignored by Refit\n');

    const result = await enforceGuard(repo, checkpoint, policy);

    expect(result.reverted.map((file) => file.file).sort()).toEqual([
      '.env.local',
      'src/app/core/new.service.ts',
      'src/app/core/user.service.ts',
      'src/app/user-api.ts',
      'src/environments/environment.ts',
    ]);
    expect(await fs.readFile(path.join(repo, 'src/app/core/user.service.ts'), 'utf8')).toBe('export class UserService {}\n');
    expect(await fs.readFile(path.join(repo, 'src/environments/environment.ts'), 'utf8')).toBe('export const environment = {};\n');
    await expect(fs.access(path.join(repo, 'src/app/core/new.service.ts'))).rejects.toThrow();
    await expect(fs.access(path.join(repo, '.env.local'))).rejects.toThrow();
    expect(await fs.readFile(path.join(repo, 'src/app/home.component.html'), 'utf8')).toContain('class="title"');
    expect(result.changed.find((file) => file.file === 'angular.json')).toMatchObject({ sensitive: true, protected: false });
    expect(result.changed.some((file) => file.file.startsWith('.refit/'))).toBe(false);

    const commit = await commitAll(repo, 'refit(ui): modernize Home');
    expect(commit).toBeTruthy();
    const files = await gitIn(repo, 'show', '--name-only', '--format=', 'HEAD');
    expect(files.split('\n').sort()).toEqual(['angular.json', 'src/app/home.component.html']);
  });

  it('also reverts protected changes the agent already committed', async () => {
    const repo = await tempDir();
    await fs.mkdir(path.join(repo, 'src'), { recursive: true });
    await fs.writeFile(path.join(repo, 'src/a.service.ts'), 'original\n');
    await gitIn(repo, 'init', '-q', '-b', 'main');
    await gitIn(repo, 'add', '-A');
    await gitIn(repo, 'commit', '-q', '-m', 'base');
    const checkpoint = await headCommit(repo);
    await fs.writeFile(path.join(repo, 'src/a.service.ts'), 'changed\n');
    await gitIn(repo, 'commit', '-q', '-am', 'agent commit');
    const result = await enforceGuard(repo, checkpoint, policy);
    expect(result.reverted.map((file) => file.file)).toEqual(['src/a.service.ts']);
    expect(await fs.readFile(path.join(repo, 'src/a.service.ts'), 'utf8')).toBe('original\n');
  });
});
