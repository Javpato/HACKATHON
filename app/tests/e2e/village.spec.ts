import { test, expect } from '@playwright/test';

// Browser-only evidence for the local village shell. These checks exercise the
// Canvas/UI and local persistence paths that run without signaling, capture or a
// second host. They are NOT evidence of real microphone/screen capture, Tauri
// WebKitGTK behaviour, or two-host operation; those remain UNVERIFIED.

const SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['La aldea', 'La aldea'],
  ['Mi casa', 'Mi rincón de estudio'],
  ['Pizarra', 'La pizarra'],
  ['Editor local', 'Tu cuaderno de código'],
  ['Contactos', 'Personas de confianza'],
];

test('the village shell loads offline and contacts no external host', async ({ page }) => {
  const external: string[] = [];
  page.on('request', req => {
    if (!req.url().startsWith('http://127.0.0.1:1420')) external.push(req.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'La aldea', exact: true })).toBeVisible();
  await expect(page.getByText('Sin sesión').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir mi aldea' })).toBeVisible();
  expect(external).toEqual([]);
});

test('the declared favicon resolves instead of falling back to a 404', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('./favicon.svg');
  const res = await page.request.get('/favicon.svg');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/svg+xml');
});

test('every local section opens and marks itself as the current page', async ({ page }) => {
  await page.goto('/');
  for (const [label, heading] of SECTIONS) {
    await page.locator('.sv-nav-item', { hasText: label }).first().click();
    const active = page.locator('.sv-nav-item[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toContainText(label);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
});

test('a saved display name survives a reload through local persistence', async ({ page }) => {
  await page.goto('/');
  const name = page.locator('input').first();
  await expect(name).toHaveValue('Explorador');
  await name.fill('Vecina Ada');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.locator('input').first()).toHaveValue('Vecina Ada');

  await page.reload();
  await expect(page.locator('input').first()).toHaveValue('Vecina Ada');
});

test('drawing on the board marks the canvas and undo reverts exactly that stroke', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sv-nav-item', { hasText: 'Pizarra' }).first().click();
  const canvas = page.locator('canvas:visible').first();
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const blank = await canvas.screenshot();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + 100 + i * 15, box.y + 100 + i * 10);
  }
  await page.mouse.up();

  await expect.poll(async () => Buffer.compare(blank, await canvas.screenshot()) !== 0).toBe(true);

  await page.getByRole('button', { name: /Deshacer/ }).click();
  await expect.poll(async () => Buffer.compare(blank, await canvas.screenshot()) === 0).toBe(true);
});

test.describe('with decorative motion suppressed', () => {
  // The village animates on its own (tree sway, drifting motes, lamp flicker),
  // so a still frame is only guaranteed under reduced motion. Asking for it
  // here both exercises that accessibility path and restores a clean control
  // for the movement assertion below.
  test.use({ reducedMotion: 'reduce' });

  test('the scene holds completely still and only input moves the character', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas:visible').first();
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 400, y: 400 } });

    // Control: with decorative motion off and no input, nothing may repaint.
    const idleStart = await canvas.screenshot();
    await page.waitForTimeout(1_000);
    expect(Buffer.compare(idleStart, await canvas.screenshot())).toBe(0);

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(110);
      await page.keyboard.up('KeyA');
    }

    await expect
      .poll(async () => Buffer.compare(idleStart, await canvas.screenshot()) !== 0)
      .toBe(true);
  });
});

test('decorative motion runs when reduced motion is not requested', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas:visible').first();
  await expect(canvas).toBeVisible();
  // Without the preference the scene is alive even with no input at all.
  const first = await canvas.screenshot();
  await expect
    .poll(async () => Buffer.compare(first, await canvas.screenshot()) !== 0, { timeout: 4_000 })
    .toBe(true);
});
