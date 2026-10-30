import { promises as fs } from 'node:fs';
import path from 'node:path';
import { UserError } from '../util/errors.js';

const FILES = ['RULES.md', 'PAGE_PROCEDURE.md', 'UI_CHECKLIST.md'];

/**
 * The system prompt for every agent call: the three playbook files, always in the same order and
 * byte-for-byte identical across calls, so providers can cache it.
 */
export async function loadPlaybook(playbookDir: string): Promise<string> {
  const parts: string[] = [];
  for (const file of FILES) {
    try {
      parts.push((await fs.readFile(path.join(playbookDir, file), 'utf8')).trim());
    } catch {
      throw new UserError(`The playbook file playbook/${file} is missing.`, 'Restore it from git (git checkout -- playbook).');
    }
  }
  return `${parts.join('\n\n---\n\n')}\n`;
}
