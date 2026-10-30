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

export interface FoundationPromptInput {
  /** "standalone" (app.config.ts) or "ngmodule" (AppModule). */
  bootstrap: 'standalone' | 'ngmodule' | 'unknown';
  /** Where PrimeNG is registered, e.g. "src/app/app.config.ts". */
  providersFile: string | null;
  /** The global stylesheet, e.g. "src/styles.scss". */
  globalStyles: string | null;
  /** The app shell files: root component, header, navigation, footer. */
  shellFiles: string[];
  primeng: string;
  themePackage: string;
  /** PrimeNG 18–20 animate through Angular's animations package. */
  needsAngularAnimations: boolean;
  buildCommand: string;
  /** Where Refit wrote the brand files, e.g. "src/app/theme". */
  themeFolder: string;
}

export function foundationPrompt(input: FoundationPromptInput): string {
  const where = input.providersFile ?? (input.bootstrap === 'ngmodule' ? 'the AppModule' : 'the application config');
  return [
    'Task: set up the design system and modernize the app shell.',
    '',
    `Refit installed PrimeNG ${input.primeng} with ${input.themePackage} and primeicons, and wrote three files from the brand (do not edit them):`,
    `- ${input.themeFolder}/brand-preset.ts (exports BrandPreset)`,
    `- ${input.themeFolder}/brand.css (brand variables, base type and layout classes)`,
    `- ${input.themeFolder}/BRAND.md (how to use the brand: read it first)`,
    '',
    'Do these in order:',
    `1. Register PrimeNG in ${where}: providePrimeNG({ theme: { preset: BrandPreset, options: { darkModeSelector: '.app-dark' } } })` +
      (input.needsAngularAnimations ? ', and provideAnimationsAsync() if animations are not provided yet.' : '.'),
    '   Only add providers. Keep every existing provider, route, interceptor and sign-in setting exactly as it is.',
    `2. Load the styles globally from ${input.globalStyles ?? 'the global stylesheet'}: import primeicons/primeicons.css and ${input.themeFolder}/brand.css. Do not edit angular.json.`,
    '3. Modernize the app shell (header, navigation, user menu, footer) with PrimeNG and the brand. Keep every link, sign-in and sign-out action, permission check and router outlet.',
    '4. Add one global p-toast and one p-confirmdialog to the root component, with MessageService and ConfirmationService provided once.',
    '',
    'Files you may change:',
    ...[input.providersFile, input.globalStyles, ...input.shellFiles].filter((file): file is string => Boolean(file)).map((file) => `- ${file}`),
    '',
    `Build command: ${input.buildCommand}`,
    '',
    'Run the build until it passes. Finish with the summary and the JSON report.',
  ].join('\n');
}
