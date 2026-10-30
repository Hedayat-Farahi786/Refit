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

export interface ReviewPromptInput {
  angular: string;
  bootstrap: string;
  routing: string;
  uiLibraries: string[];
  msal: boolean;
  pages: Array<{ route: string; file?: string }>;
  startFiles: string[];
}

export function reviewPrompt(input: ReviewPromptInput): string {
  return [
    "Task: review this Angular app's front end before it is modernized onto PrimeNG with the company brand.",
    'This is read-only: do not change any file and do not run commands.',
    '',
    "What Refit's scan already found:",
    `- Angular ${input.angular}, ${input.bootstrap}, ${input.routing}`,
    `- UI libraries: ${input.uiLibraries.join(', ') || 'none found'}`,
    `- Microsoft sign-in (MSAL): ${input.msal ? 'yes' : 'no'}`,
    `- ${input.pages.length} pages:`,
    ...input.pages.slice(0, 40).map((page) => `  - ${page.route}${page.file ? ` (${page.file})` : ''}`),
    '',
    'Start with these files, then read the shared components and a sample of pages:',
    ...input.startFiles.map((file) => `- ${file}`),
    '',
    'Finish with a short summary for a non-technical reader, then one JSON block in exactly this shape:',
    '```json',
    JSON.stringify(
      {
        summary: 'Two or three sentences about the app and its current look.',
        uiStack: ['Angular Material', 'Custom CSS'],
        layout: 'How the app shell is laid out (header, navigation, content).',
        sharedComponents: [{ name: 'Header', files: ['src/app/header/header.component.html'], why: 'Used on every page, so modernize it first.' }],
        risks: [{ title: 'Inline styles in the request form', files: ['src/app/...'], detail: 'What could go wrong and why.' }],
        pages: [{ route: '/requests', purpose: 'What users do here', complexity: 'low | medium | high', notes: 'Optional' }],
        recommendations: ['Concrete advice for the modernization, in order.'],
      },
      null,
      2,
    ),
    '```',
  ].join('\n');
}
