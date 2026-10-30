/** Short, specific task prompts. The playbook (system prompt) carries the rules. */

export interface PagePromptInput {
  name: string;
  route: string;
  files: string[];
  /** Screenshot paths relative to the working folder (inside .refit/shots). */
  beforeShots: string[];
  buildCommand: string;
  designSystem: string;
}

export function pagePrompt(input: PagePromptInput): string {
  return [
    `Task: modernize the "${input.name}" page (route ${input.route}).`,
    '',
    'Files you may change:',
    ...input.files.map((file) => `- ${file}`),
    '',
    input.beforeShots.length > 0
      ? ['Before screenshots (open them to see how the page looks today):', ...input.beforeShots.map((shot) => `- ${shot}`)].join('\n')
      : 'There are no screenshots for this page; read its template carefully instead.',
    '',
    `Design system: ${input.designSystem}`,
    `Build command: ${input.buildCommand}`,
    '',
    'Follow the page procedure. Only edit this page\'s files. Finish with the summary and the JSON report.',
  ].join('\n');
}

export interface FixPromptInput {
  label: string;
  buildCommand: string;
  logTail: string[];
  changedFiles: string[];
}

export function fixPrompt(input: FixPromptInput): string {
  return [
    `Task: the build broke after the last change (${input.label}). Fix the build errors without undoing the design work.`,
    '',
    'Files changed in this step:',
    ...(input.changedFiles.length > 0 ? input.changedFiles.map((file) => `- ${file}`) : ['- (none recorded)']),
    '',
    `Last ${input.logTail.length} lines of \`${input.buildCommand}\`:`,
    '```',
    ...input.logTail,
    '```',
    '',
    'Only change the files listed above. Run the build to confirm it passes, then write the report.',
  ].join('\n');
}
