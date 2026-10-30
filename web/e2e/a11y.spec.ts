import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fixtureRepo } from './fixtures';

/**
 * Accessibility audit of every screen with axe (WCAG 2.1 A and AA), in light and dark mode.
 * The brand preview iframe shows sample content and is checked on its own.
 */
test.describe.configure({ mode: 'serial' });

let appId = '';

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe').analyze();
  const problems = results.violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join('\n    ')}`);
  expect(problems, `${label}\n${problems.join('\n')}`).toEqual([]);
}

test.beforeAll(async ({ request }) => {
  const folder = fixtureRepo('ng-modern-bootstrap');
  const added = await request.post('/api/apps', {
    data: { name: 'A11y app', source: { kind: 'local', path: folder }, port: 4297 },
    headers: { Origin: 'http://localhost:4711' },
  });
  appId = ((await added.json()) as { id: string }).id;
});

// Later specs start from an empty app list.
test.afterAll(async ({ request }) => {
  if (appId) await request.delete(`/api/apps/${appId}`, { headers: { Origin: 'http://localhost:4711' } });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`every screen meets WCAG 2.1 AA in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const screens: Array<[string, string, () => Promise<void>]> = [
      ['Apps', '/apps', async () => void (await expect(page.getByRole('heading', { level: 1, name: 'Apps' })).toBeVisible())],
      ['Overview', `/apps/${appId}/overview`, async () => void (await expect(page.getByRole('heading', { name: /Ready/ }).first()).toBeVisible({ timeout: 60_000 }))],
      ['Agent review', `/apps/${appId}/review`, async () => void (await expect(page.getByRole('heading', { name: 'Agent review' })).toBeVisible())],
      ['Modernize', `/apps/${appId}/modernize`, async () => void (await expect(page.getByRole('button', { name: 'Start modernizing' })).toBeVisible())],
      ['History', `/apps/${appId}/history`, async () => void (await expect(page.getByText('No runs yet')).toBeVisible())],
      ['Brands', '/brands', async () => void (await expect(page.getByRole('heading', { level: 1, name: 'Brands' })).toBeVisible())],
      ['Brand editor', '/brands/oerlikon', async () => void (await expect(page.getByLabel('Hex', { exact: true })).toBeVisible())],
      ['Settings', '/settings', async () => void (await expect(page.getByRole('heading', { name: 'AI providers' })).toBeVisible())],
    ];
    for (const [label, url, ready] of screens) {
      await page.goto(url);
      await ready();
      await audit(page, `${label} (${scheme})`);
    }
  });
}

test('the brand preview meets WCAG 2.1 AA with the Oerlikon brand', async ({ page }) => {
  await page.goto('/brands/oerlikon');
  const frame = page.frameLocator('iframe[title^="Preview"]');
  await expect(frame.getByRole('button', { name: 'New request' })).toBeVisible();
  const handle = await page.locator('iframe[title^="Preview"]').elementHandle();
  const content = await handle!.contentFrame();
  const results = await new AxeBuilder({ page }).include('iframe').withTags(['wcag2a', 'wcag2aa']).analyze();
  const problems = results.violations.map(
    (violation) => `${violation.id}: ${violation.help}\n    ${violation.nodes.slice(0, 4).map((node) => `${node.target.join(' ')}: ${node.failureSummary?.split('\n').slice(-1)[0] ?? ''}`).join('\n    ')}`,
  );
  expect(content).toBeTruthy();
  expect(problems, problems.join('\n')).toEqual([]);
});
