import { test, expect, type Page } from '@playwright/test';

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-settings').click();
}

for (const [device, width, height] of [['phone', 390, 844], ['iPad', 820, 1180], ['desktop', 1440, 1000]] as const) {
  test(`${device}: the village fills the screen and settings live in the phone`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    // No side panels: only the place, the stage and the phone button.
    await expect(page.locator('.sv-sidebar, .sv-inspector, .sv-nav-item')).toHaveCount(0);
    await expect(page.getByTestId('phone-button')).toBeVisible();
    await expect(page.getByTestId('env-weather-select')).not.toBeVisible();
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `/tmp/studyvillage-settings-${device}.png`, fullPage: true });
    await dialog.getByLabel('Nombre del vecindario (en este equipo)').fill('Aldea de prueba');
    await dialog.getByLabel('Nombre del vecindario (en este equipo)').press('Tab');
    await dialog.getByLabel('Nombre de tu casa').fill('Casa del bosque');
    await dialog.getByLabel('Nombre de tu casa').press('Tab');
    await dialog.getByTestId('env-weather-select').selectOption('fog');
    await dialog.getByLabel('Sonido de fondo').selectOption('rain');
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aldea de prueba', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await openSettings(page);
    await expect(dialog.getByTestId('env-weather-select')).toHaveValue('fog');
    await expect(dialog.getByLabel('Sonido de fondo')).toHaveValue('rain');
    await expect(dialog.getByLabel('Nombre de tu casa')).toHaveValue('Casa del bosque');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}

test('clicking a portal walks there instead of teleporting, and E still works up close', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.sv-stage-pane canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing canvas');
  await page.keyboard.press('e');
  await expect(page.getByText('Acércate a la puerta de una casa o a un portal lateral para entrar.')).toBeVisible();
  // The east portal is at the right edge: the click starts a walk, not an instant jump.
  await canvas.click({ position: { x: bounds.width - 15, y: bounds.height / 2 } });
  await expect(page.getByRole('heading', { name: 'Plaza Comunitaria', exact: true })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plaza Comunitaria', exact: true })).toBeVisible({ timeout: 8000 });
  await page.keyboard.down('d');
  await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Hombres Lobo', { timeout: 6000 });
  await page.keyboard.up('d');
  await page.keyboard.press('e');
  await expect(page.getByTestId('expansion-modal-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'La mesa de la hoguera' })).toBeVisible();
});

test('closing the werewolves table always gives movement back', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.sv-stage-pane canvas');
  const bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width - 15, y: bounds.height / 2 } });
  await expect(page.getByRole('heading', { name: 'Plaza Comunitaria', exact: true })).toBeVisible({ timeout: 8000 });
  // Click the campfire: walk up to it and sit down.
  await canvas.click({ position: { x: bounds.width * 384 / 768, y: bounds.height * 205 / 432 } });
  await expect(page.getByRole('heading', { name: 'La mesa de la hoguera' })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Sentarme a la mesa' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('expansion-modal-overlay')).not.toBeVisible();
  // Walk back west to the residential portal: only possible if the player can move.
  await page.keyboard.down('a');
  await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Barrio Residencial', { timeout: 8000 });
  await page.keyboard.up('a');
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'La aldea', exact: true })).toBeVisible();
  // Home and back out: you land at your own door and can still walk.
  await page.getByTestId('phone-button').click();
  await page.getByTestId('phone-house').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'La aldea', exact: true })).toBeVisible();
  await page.keyboard.down('s');
  await page.waitForTimeout(400);
  await page.keyboard.up('s');
  await page.keyboard.down('d');
  await expect(page.locator('.sv-touch-btn-label').last()).not.toContainText('Entrar', { timeout: 4000 });
  await page.keyboard.up('d');
});
