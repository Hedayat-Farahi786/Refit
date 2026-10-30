/** Turns git remote URLs into web URLs and "create pull request" links. */

export type RemoteKind = 'github' | 'azure-devops' | 'gitlab' | 'other';

export interface RemoteInfo {
  kind: RemoteKind;
  /** Browser URL of the repository, without credentials or .git suffix. */
  webUrl: string | null;
  host: string | null;
}

export function parseRemote(rawUrl: string): RemoteInfo {
  const url = rawUrl.trim();

  // Azure DevOps over SSH: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  let match = /^(?:ssh:\/\/)?[^@\s]+@ssh\.dev\.azure\.com(?::\d+)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i.exec(url);
  if (match) {
    const [, org, project, repo] = match as unknown as [string, string, string, string];
    return { kind: 'azure-devops', host: 'dev.azure.com', webUrl: `https://dev.azure.com/${org}/${project}/_git/${repo}` };
  }
  // Older Azure DevOps SSH: {org}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
  match = /^(?:ssh:\/\/)?[^@\s]+@vs-ssh\.visualstudio\.com(?::\d+)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i.exec(url);
  if (match) {
    const [, org, project, repo] = match as unknown as [string, string, string, string];
    return { kind: 'azure-devops', host: 'dev.azure.com', webUrl: `https://dev.azure.com/${org}/${project}/_git/${repo}` };
  }

  // scp-like SSH: git@host:owner/repo.git
  match = /^[^@\s/]+@([^:/\s]+):(?!\/)(.+?)(?:\.git)?\/?$/.exec(url);
  if (match) {
    const [, host, repoPath] = match as unknown as [string, string, string];
    return fromHostAndPath(host, repoPath);
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(parsed.protocol)) return { kind: 'other', host: null, webUrl: null };
    const host = parsed.hostname.toLowerCase();
    const repoPath = decodeSafe(parsed.pathname).replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
    if (host === 'dev.azure.com' || host.endsWith('.visualstudio.com')) {
      // HTTPS URLs often carry a user name: https://org@dev.azure.com/org/project/_git/repo
      const base = host === 'dev.azure.com' ? 'https://dev.azure.com' : `https://${host}`;
      return { kind: 'azure-devops', host, webUrl: `${base}/${encodePath(repoPath)}` };
    }
    return fromHostAndPath(host, repoPath, parsed.protocol === 'http:' ? 'http' : 'https', parsed.port);
  } catch {
    return { kind: 'other', host: null, webUrl: null };
  }
}

function fromHostAndPath(host: string, repoPath: string, scheme = 'https', port = ''): RemoteInfo {
  const cleanHost = host.toLowerCase();
  const cleanPath = repoPath.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  const kind: RemoteKind =
    cleanHost === 'github.com' || cleanHost.endsWith('.ghe.com') || cleanHost.startsWith('github.')
      ? 'github'
      : cleanHost === 'gitlab.com' || cleanHost.startsWith('gitlab.')
        ? 'gitlab'
        : 'other';
  const hostWithPort = port && scheme !== 'ssh' ? `${cleanHost}:${port}` : cleanHost;
  return { kind, host: cleanHost, webUrl: `${scheme === 'http' ? 'http' : 'https'}://${hostWithPort}/${encodePath(cleanPath)}` };
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function encodePath(repoPath: string): string {
  return repoPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** Link that opens the "create pull request" page for a branch, or null when we don't know the host. */
export function pullRequestUrl(remote: RemoteInfo, branch: string, base: string): string | null {
  if (!remote.webUrl) return null;
  switch (remote.kind) {
    case 'github':
      return `${remote.webUrl}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
    case 'azure-devops':
      return `${remote.webUrl}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}&targetRef=${encodeURIComponent(base)}`;
    case 'gitlab':
      return `${remote.webUrl}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(base)}`;
    default:
      return null;
  }
}
