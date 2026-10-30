import { expect, test } from '@playwright/test';
import { fixtureRepo } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('shows a clear first step when there are no apps', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Add your first app to get started' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Apps', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('adds an app from a folder, scans it and edits the page list', async ({ page }) => {
  const folder = fixtureRepo('ng-modern-bootstrap');
  await page.goto('/apps');
  await page.getByRole('button', { name: 'Add app' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Add an app' });
  await dialog.getByLabel('Folder', { exact: true }).fill(`"${folder}"`);
  await expect(dialog.getByText('Angular 21')).toBeVisible();
  await expect(dialog.getByLabel('Name')).toHaveValue('Ng modern bootstrap');
  await dialog.getByLabel('Name').fill('Service desk');
  await dialog.getByRole('button', { name: 'Add and scan' }).click();

  await expect(page).toHaveURL(/\/apps\/[a-z0-9]+\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Service desk' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready, with 1 thing to check' })).toBeVisible();
  await expect(page.getByText('1 page needs sample values')).toBeVisible();

  const pages = page.getByRole('region', { name: 'Pages' }).or(page.locator('section[aria-labelledby="pages-title"]'));
  await expect(pages.getByText('/requests/:id')).toBeVisible();
  await pages.getByLabel('Sample value for id on Request details').fill('1');
  await page.getByRole('button', { name: 'Save pages' }).click();
  await expect(page.getByText('Pages saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready to modernize' })).toBeVisible();

  const sidebar = page.getByRole('complementary', { name: 'Apps' });
  await expect(sidebar.getByRole('link', { name: /Service desk/ })).toContainText('Ready');
});

test('explains folders that cannot be used', async ({ page }) => {
  await page.goto('/apps');
  await page.getByRole('button', { name: 'Add app' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add an app' });
  await dialog.getByLabel('Folder', { exact: true }).fill('relative/path');
  await expect(dialog.getByText('Use the full path, starting from the drive or the root folder.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add and scan' })).toBeDisabled();
});

test('switches between light and dark mode', async ({ page }) => {
  await page.goto('/apps');
  const html = page.locator('html');
  const wasDark = await html.evaluate((element) => element.classList.contains('app-dark'));
  await page.getByRole('button', { name: wasDark ? 'Switch to light mode' : 'Switch to dark mode' }).click();
  await expect(html).toHaveClass(wasDark ? /^(?!.*app-dark)/ : /app-dark/);
});

test('tests file paths against the protected and sensitive lists', async ({ page }) => {
  await page.goto('/settings');
  const tester = page.getByLabel('Test a file path');
  await tester.fill('src/app/core/auth.service.ts');
  await expect(page.getByText('Protected by "**/*.service.ts": the agent cannot change it.')).toBeVisible();
  await tester.fill('src/app/app.config.ts');
  await expect(page.getByText(/Sensitive because of "\*\*\/app\.config\.ts"/)).toBeVisible();
  await tester.fill('src/app/home/home.component.html');
  await expect(page.getByText(/Not protected or sensitive/)).toBeVisible();
});
