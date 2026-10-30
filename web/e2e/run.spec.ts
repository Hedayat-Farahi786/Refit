import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fixtureRepo } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('starts a dry run and follows it to the end in simple and developer view', async ({ page }) => {
  test.setTimeout(6 * 60_000);
  const folder = fixtureRepo('ng-modern-bootstrap');

  // Add the app through the API to keep this test about runs.
  const added = await page.request.post('/api/apps', {
    data: { name: 'Run test app', source: { kind: 'local', path: folder }, port: 4295 },
    headers: { Origin: 'http://localhost:4711' },
  });
  expect(added.status()).toBe(201);
  const app = (await added.json()) as { id: string };

  await page.goto(`/apps/${app.id}/overview`);
  await expect(page.getByRole('heading', { name: /Ready, with 1 thing to check/ })).toBeVisible();
  await page.getByLabel('Sample value for id on Request details').fill('1');
  await page.getByRole('button', { name: 'Save pages' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to modernize' })).toBeVisible();

  await page.getByRole('link', { name: 'Modernize' }).click();
  await page.getByRole('radio', { name: /Dry run/ }).check({ force: true });
  await expect(page.getByText('Dry run does not use AI.')).toBeVisible();
  await page.getByRole('button', { name: 'Start modernizing' }).click();

  // Simple view: the "Now" card speaks plain language while it works.
  await expect(page.getByText('Started modernizing')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Now' })).toBeVisible();

  // Developer view: the log fills with commands.
  await page.getByRole('button', { name: 'Developer' }).click();
  await expect(page.getByRole('log', { name: 'Run log' }).getByText('$ npm ci')).toBeVisible({ timeout: 60_000 });

  await expect(page.getByRole('heading', { name: 'Ready for review' })).toBeVisible({ timeout: 5 * 60_000 });
  await expect(page.getByRole('heading', { name: 'Changed files' })).toBeVisible();
  await expectAccessible(page, 'Run view, developer');
  await page.getByRole('button', { name: /dashboard\.component\.html/ }).click();
  await expect(page.getByText('<!-- Refit dry run: Dashboard page -->')).toBeVisible();

  await page.getByRole('button', { name: 'Simple' }).click();
  await expect(page.getByText('4 of 4 done')).toBeVisible();
  await expectAccessible(page, 'Run view, simple');

  // The before/after comparison: the divider is a slider that works with the keyboard.
  await expect(page.getByRole('heading', { name: 'Before and after' })).toBeVisible();
  const stage = page.locator('app-compare-stage');
  await expect(stage.getByRole('img', { name: 'Before: Dashboard' })).toBeVisible();
  const divider = page.getByRole('slider', { name: 'Move the divider between before and after' });
  await expect(divider).toHaveAttribute('aria-valuenow', '50');
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '48');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '58');
  await page.keyboard.press('End');
  await expect(divider).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('button', { name: 'Compare before and after for Requests' }).click();
  await expect(stage.getByRole('img', { name: 'After: Requests' })).toBeVisible();
  await page.getByRole('button', { name: 'Side by side' }).click();
  await expect(stage.getByRole('img', { name: 'Before: Requests' })).toBeVisible();

  // Create pull request: only on a click, after a confirmation. This app folder has no remote,
  // so Refit explains how to bring the branch into it instead of pushing anywhere.
  await page.getByRole('button', { name: 'Create pull request' }).click();
  await expect(page.getByText(/Refit pushes the branch refit\/modernize-/)).toBeVisible();
  await page.getByRole('button', { name: 'Push and create' }).click();
  await expect(page.getByText('Bring the branch into your folder')).toBeVisible();
  await expect(page.getByText(/has no remote to push to/)).toBeVisible();
  await expect(page.locator('.commands')).toContainText(`git fetch`);
  await expect(page.getByRole('button', { name: /Create pull request|Try again/ })).toHaveCount(0);

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('cell').getByText('Ready for review')).toBeVisible();
});

/** WCAG 2.1 AA with axe, like the screens in a11y.spec.ts. */
async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(', ')})`);
  expect(problems, `${label}\n${problems.join('\n')}`).toEqual([]);
}
