/**
 * Removes anything that looks like a secret before text reaches logs, events or reports.
 * Values of known secret environment variables are always removed, whatever they look like.
 */

const SECRET_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'COPILOT_GITHUB_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
];

const PATTERNS: Array<[RegExp, string]> = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/g, 'sk-ant-***'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, 'gh***'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<jwt redacted>'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]{8,}=*/gi, '$1 ***'],
  [/(\/\/)[^\s/:@]+:[^\s/@]+@/g, '$1***@'],
  [
    /\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password|passwd|pwd|accountkey|_authToken)\s*["']?\s*[=:]\s*["']?)[^\s"',;]{6,}/gi,
    '$1***',
  ],
];

let envSecrets: string[] | null = null;

function knownSecretValues(): string[] {
  if (!envSecrets) {
    envSecrets = SECRET_ENV_NAMES.map((name) => process.env[name])
      .filter((value): value is string => typeof value === 'string' && value.length >= 8 && value !== 'proxy-injected')
      .sort((a, b) => b.length - a.length);
  }
  return envSecrets;
}

/** Re-reads secret values from the environment (after loading .env). */
export function refreshSecretValues(): void {
  envSecrets = null;
}

export function redact(text: string): string {
  let out = text;
  for (const secret of knownSecretValues()) out = out.split(secret).join('***');
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
