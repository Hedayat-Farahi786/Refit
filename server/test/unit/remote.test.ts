import { describe, expect, it } from 'vitest';
import { parseRemote, pullRequestUrl } from '../../src/git/remote.js';

describe('parseRemote', () => {
  it.each([
    ['git@github.com:oerlikon/request-portal.git', 'github', 'https://github.com/oerlikon/request-portal'],
    ['ssh://git@github.com/oerlikon/request-portal.git', 'github', 'https://github.com/oerlikon/request-portal'],
    ['https://github.com/oerlikon/request-portal.git', 'github', 'https://github.com/oerlikon/request-portal'],
    ['https://jane:secret@github.com/oerlikon/request-portal', 'github', 'https://github.com/oerlikon/request-portal'],
    ['https://github.mycorp.com/team/app.git', 'github', 'https://github.mycorp.com/team/app'],
    ['git@ssh.dev.azure.com:v3/oerlikon/Digital%20Tools/request-portal', 'azure-devops', 'https://dev.azure.com/oerlikon/Digital%20Tools/_git/request-portal'],
    ['https://oerlikon@dev.azure.com/oerlikon/Digital%20Tools/_git/request-portal', 'azure-devops', 'https://dev.azure.com/oerlikon/Digital%20Tools/_git/request-portal'],
    ['https://dev.azure.com/oerlikon/Tools/_git/portal', 'azure-devops', 'https://dev.azure.com/oerlikon/Tools/_git/portal'],
    ['oerlikon@vs-ssh.visualstudio.com:v3/oerlikon/Tools/portal', 'azure-devops', 'https://dev.azure.com/oerlikon/Tools/_git/portal'],
    ['https://oerlikon.visualstudio.com/Tools/_git/portal', 'azure-devops', 'https://oerlikon.visualstudio.com/Tools/_git/portal'],
    ['git@gitlab.com:group/sub/app.git', 'gitlab', 'https://gitlab.com/group/sub/app'],
    ['https://git.example.com:8443/team/app.git', 'other', 'https://git.example.com:8443/team/app'],
  ])('%s', (url, kind, webUrl) => {
    expect(parseRemote(url)).toMatchObject({ kind, webUrl });
  });

  it('gives up on things that are not URLs', () => {
    expect(parseRemote('/home/me/repos/app')).toEqual({ kind: 'other', host: null, webUrl: null });
    expect(parseRemote('file:///home/me/app')).toEqual({ kind: 'other', host: null, webUrl: null });
  });
});

describe('pullRequestUrl', () => {
  it('builds create-PR links per host', () => {
    expect(pullRequestUrl(parseRemote('git@github.com:o/app.git'), 'refit/modernize-20261030-ab12cd34', 'main')).toBe(
      'https://github.com/o/app/compare/main...refit%2Fmodernize-20261030-ab12cd34?expand=1',
    );
    expect(pullRequestUrl(parseRemote('https://dev.azure.com/o/p/_git/app'), 'refit/x', 'develop')).toBe(
      'https://dev.azure.com/o/p/_git/app/pullrequestcreate?sourceRef=refit%2Fx&targetRef=develop',
    );
    expect(pullRequestUrl(parseRemote('git@gitlab.com:g/app.git'), 'refit/x', 'main')).toContain('/-/merge_requests/new?');
    expect(pullRequestUrl(parseRemote('/local/path'), 'refit/x', 'main')).toBeNull();
  });
});
