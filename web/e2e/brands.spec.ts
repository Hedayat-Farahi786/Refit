import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('lists the Oerlikon brand and opens it with a live PrimeNG preview', async ({ page }) => {
  await page.goto('/brands');
  await expect(page.getByRole('heading', { level: 1, name: 'Brands' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Oerlikon' }).click();
  await expect(page).toHaveURL(/\/brands\/oerlikon$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Oerlikon' })).toBeVisible();
  await expect(page.getByLabel('Hex', { exact: true })).toHaveValue('#eb0000');
  await expect(page.getByText(/White text on buttons: 4\.6:1/)).toBeVisible();

  // The preview iframe renders real PrimeNG components with the brand's preset.
  const preview = page.frameLocator('iframe[title^="Preview"]');
  const primaryButton = preview.getByRole('button', { name: 'New request' });
  await expect(primaryButton).toBeVisible();
  await expect(primaryButton).toHaveCSS('background-color', 'rgb(235, 0, 0)');
  await expect(preview.getByRole('table')).toBeVisible();

  // Editing the color restyles the preview without saving.
  await page.getByLabel('Hex', { exact: true }).fill('#0057b8');
  await expect(primaryButton).toHaveCSS('background-color', 'rgb(0, 87, 184)');
  await expect(page.getByRole('region', { name: 'Unsaved brand changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(primaryButton).toHaveCSS('background-color', 'rgb(235, 0, 0)');

  // A mistake is explained and blocks saving, but the preview keeps the last valid brand.
  await page.getByLabel('Hex', { exact: true }).fill('red');
  await expect(page.getByText('Primary color must be a hex color like #eb0000.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save brand' })).toBeDisabled();
  await expect(primaryButton).toHaveCSS('background-color', 'rgb(235, 0, 0)');
  await page.getByRole('button', { name: 'Discard' }).click();
});

test('shows the palette and the generated files for each PrimeNG version', async ({ page }) => {
  await page.goto('/brands/oerlikon');
  await page.getByRole('radio', { name: 'Palette' }).or(page.getByRole('button', { name: 'Palette', exact: true })).first().click();
  await expect(page.getByText('4.6:1 white')).toBeVisible();
  await page.getByRole('radio', { name: 'Code' }).or(page.getByRole('button', { name: 'Code', exact: true })).first().click();
  const source = page.getByLabel('brand-preset.ts', { exact: true });
  await expect(source).toContainText("from '@primeuix/themes'");
  await expect(source).toContainText("500: '#eb0000'");
  await page.getByLabel('PrimeNG version').click();
  await page.getByRole('option', { name: 'PrimeNG 19' }).click();
  await expect(source).toContainText("from '@primeng/themes'");
  await page.getByRole('tab', { name: 'BRAND.md' }).click();
  await expect(page.getByLabel('BRAND.md', { exact: true })).toContainText('red alone never means "error"');
});

test('duplicates, edits, saves, exports and deletes a brand', async ({ page }) => {
  await page.goto('/brands/oerlikon');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(/\/brands\/oerlikon-copy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Oerlikon copy' })).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Metco');
  await page.getByText('Compact', { exact: true }).click();
  await page.getByRole('button', { name: 'Save brand' }).click();
  await expect(page.getByText('Brand saved')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Metco' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'oerlikon-copy.brand.json' }).click();
  const file = await download;
  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8')) as { name: string; density: string; primary: string };
  expect(exported).toMatchObject({ name: 'Metco', density: 'compact', primary: '#eb0000' });

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete brand' }).click();
  await page.getByRole('button', { name: 'Delete brand' }).click();
  await expect(page).toHaveURL(/\/brands$/);
  await expect(page.getByRole('link', { name: 'Open Metco' })).toHaveCount(0);
});
