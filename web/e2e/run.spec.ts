import { expect, test } from '@playwright/test';
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
  await page.getByRole('button', { name: /dashboard\.component\.html/ }).click();
  await expect(page.getByText('<!-- Refit dry run: Dashboard page -->')).toBeVisible();

  await page.getByRole('button', { name: 'Simple' }).click();
  await expect(page.getByText('4 of 4 done')).toBeVisible();

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('cell').getByText('Ready for review')).toBeVisible();
});
