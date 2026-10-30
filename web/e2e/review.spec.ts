import { expect, test } from '@playwright/test';
import { fixtureRepo } from './fixtures';

test('shows the AI providers and how to set up a missing one', async ({ page }) => {
  await page.goto('/settings');
  const panel = page.getByRole('region', { name: 'AI providers' });
  await expect(panel.getByText('Claude Agent')).toBeVisible();
  await expect(panel.getByText('Not set up').first()).toBeVisible();
  await expect(panel.getByText(/ANTHROPIC_API_KEY=sk-ant-/)).toBeVisible();
  await expect(panel.getByText('Dry run', { exact: true })).toBeVisible();
  // The top bar says only the dry run works.
  await expect(page.getByRole('link', { name: /No AI provider set up/ })).toBeVisible();
});

test('runs a dry run agent review and shows the result cards', async ({ page }) => {
  test.setTimeout(2 * 60_000);
  const folder = fixtureRepo('ng-modern-bootstrap');
  const added = await page.request.post('/api/apps', {
    data: { name: 'Review test app', source: { kind: 'local', path: folder }, port: 4296 },
    headers: { Origin: 'http://localhost:4711' },
  });
  expect(added.status()).toBe(201);
  const app = (await added.json()) as { id: string };

  await page.goto(`/apps/${app.id}/overview`);
  // The first scan after start-up can take a while (TypeScript reads the whole project).
  await expect(page.getByRole('heading', { name: /Ready/ }).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Agent review' }).click();
  await expect(page.getByText('No review yet')).toBeVisible();
  // Only the dry run is available in tests, so it is selected.
  const reviewer = page.getByRole('group', { name: 'Reviewer' });
  await expect(reviewer.getByRole('button', { name: 'Dry run' })).toHaveAttribute('aria-pressed', 'true');
  await expect(reviewer.getByRole('button', { name: 'Claude Agent' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Set up Claude Agent .*in Settings/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start review' }).click();

  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Dry run review: no AI was used/)).toBeVisible();
  await expect(page.getByText(/by Dry run · free/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Modernize these shared parts first' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Risks' })).toBeVisible();
  const pages = page.getByRole('region', { name: 'Pages' });
  await expect(pages.getByRole('cell', { name: '/requests', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review again' })).toBeEnabled();

  // The review stays after a reload.
  await page.reload();
  await expect(page.getByText(/Dry run review: no AI was used/)).toBeVisible();
});
