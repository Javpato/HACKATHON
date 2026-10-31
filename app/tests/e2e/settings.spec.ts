import { test, expect } from '@playwright/test';

for (const [device, width, height] of [['phone', 390, 844], ['iPad', 820, 1180], ['desktop', 1440, 1000]] as const) {
  test(`${device}: settings are reachable and preferences survive reload`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.sv-nav-item')).toHaveText(['La aldea', 'Mi casa', 'Contactos']);
    await expect(page.getByTestId('area-btn-community')).toHaveCount(0);
    await expect(page.getByTestId('open-werewolves-btn')).toHaveCount(0);
    await expect(page.getByTestId('env-weather-select')).not.toBeVisible();
    await page.getByRole('button', { name: '⚙ Ajustes' }).click();
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
    await page.getByRole('button', { name: '⚙ Ajustes' }).click();
    await expect(dialog.getByTestId('env-weather-select')).toHaveValue('fog');
    await expect(dialog.getByLabel('Sonido de fondo')).toHaveValue('rain');
    await expect(dialog.getByLabel('Nombre de tu casa')).toHaveValue('Casa del bosque');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}

test('a distant click cannot teleport through a portal; walking reaches it', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.sv-stage-pane canvas');

  // East residential portal is at the right edge. A distant click must not switch area.
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing canvas');
  await canvas.click({ position: { x: bounds.width - 15, y: bounds.height / 2 } });
  await expect(page.getByTestId('expansion-modal-overlay')).not.toBeVisible();
  await page.keyboard.press('e');
  await expect(page.getByText('Acércate a la puerta de una casa o a un portal lateral para entrar.')).toBeVisible();
  await page.keyboard.down('d');
  await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Ir a Plaza Comunitaria', { timeout: 6000 });
  await page.keyboard.up('d');
  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'Plaza Comunitaria', exact: true })).toBeVisible();
  await page.keyboard.down('d');
  await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Hombres Lobo', { timeout: 6000 });
  await page.keyboard.up('d');
  await page.keyboard.press('e');
  await expect(page.getByTestId('expansion-modal-overlay')).toBeVisible();
  await expect(page.getByTestId('expansion-modal-overlay')).toContainText('Hombres Lobo');
});
