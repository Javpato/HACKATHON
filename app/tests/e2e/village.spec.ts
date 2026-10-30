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

test('opening the board from a room offers a way back into that same room', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sv-nav-item', { hasText: 'Mi casa' }).first().click();
  await expect(page.getByRole('heading', { name: 'Mi rincón de estudio', exact: true }).first()).toBeVisible();
  await page.locator('.sv-nav-item', { hasText: 'Pizarra' }).first().click();
  const back = page.getByRole('button', { name: '← Volver a mi casa' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('.sv-nav-item[aria-current="page"]')).toContainText('Mi casa');

  // Escape from the board also steps back into the room, not out to the village.
  await page.locator('.sv-nav-item', { hasText: 'Pizarra' }).first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sv-nav-item[aria-current="page"]')).toContainText('Mi casa');
});

test('E only leaves a room from the doorway', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sv-nav-item', { hasText: 'Mi casa' }).first().click();
  const canvas = page.locator('canvas:visible').first();
  await canvas.click({ position: { x: 10, y: 10 } });
  // At the spawn point, in the middle of the floor, E must do nothing.
  await page.keyboard.press('e');
  await expect(page.locator('.sv-nav-item[aria-current="page"]')).toContainText('Mi casa');

  // Walk down onto the doormat, then E leaves to the village.
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('e');
  await expect(page.locator('.sv-nav-item[aria-current="page"]')).toContainText('La aldea');
});

test.describe('whiteboard tools', () => {
  const openBoard = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    await page.locator('.sv-nav-item', { hasText: 'Pizarra' }).first().click();
    const canvas = page.locator('.sv-board-wrap canvas');
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    const tool = (name: string) => page.locator('.sv-segment-button', { hasText: name }).first().click();
    const undo = page.getByRole('button', { name: '↶ Deshacer' });
    const line = async (y: number) => {
      await page.mouse.move(box.x + 100, box.y + y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) await page.mouse.move(box.x + 100 + i * 20, box.y + y);
      await page.mouse.up();
    };
    return { canvas, box, tool, undo, line };
  };

  // Share of non-paper pixels in a region of the board canvas.
  const ink = (page: import('@playwright/test').Page, x: number, y: number, w: number, h: number) => page.evaluate(([rx, ry, rw, rh]) => {
    const el = document.querySelector('.sv-board-wrap canvas') as HTMLCanvasElement;
    const sx = el.width / 768;
    const d = el.getContext('2d')!.getImageData(rx * sx, ry * sx, rw * sx, rh * sx).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 500) dark += 1;
    return dark / (d.length / 4);
  }, [x, y, w, h]);

  test('the eraser removes your own stroke', async ({ page }) => {
    const { tool, undo, line } = await openBoard(page);
    await tool('Lápiz');
    await line(300);
    await expect(undo).toBeEnabled();
    await tool('Borrador');
    const { box } = await openBoardBox(page);
    await page.mouse.move(box.x + 200, box.y + 280);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 320, { steps: 6 });
    await page.mouse.up();
    await expect(undo).toBeDisabled();
  });

  test('"Borrar lo mío" asks once more, then clears every stroke of yours', async ({ page }) => {
    const { tool, undo, line } = await openBoard(page);
    await tool('Lápiz');
    await line(150);
    await line(250);
    await page.getByRole('button', { name: 'Borrar lo mío' }).click();
    // First click only arms it; nothing is deleted yet.
    await expect(undo).toBeEnabled();
    await page.getByRole('button', { name: '¿Borrar todo lo tuyo?' }).click();
    await expect(undo).toBeDisabled();
    await expect(page.locator('.sv-notice')).toContainText('Se borraron 2 trazo(s) tuyos');
  });

  test('a text note renders LaTeX as ink on the board', async ({ page }) => {
    const { box, tool } = await openBoard(page);
    expect(await ink(page, 400, 150, 300, 120)).toBe(0);
    await tool('Texto');
    await page.mouse.click(box.x + box.width * (420 / 768), box.y + box.height * (160 / 432));
    await page.locator('.sv-board-text').fill('$\\frac{a}{b} + \\sqrt{x}$');
    await page.keyboard.press('Enter');
    await expect(page.locator('.sv-board-text')).toHaveCount(0);
    // Empty paper measures exactly 0; a small rendered formula covers ~0.5%.
    await expect.poll(() => ink(page, 400, 150, 300, 120), { timeout: 8_000 }).toBeGreaterThan(0.002);
  });

  test('zoom controls and ctrl+wheel change the view', async ({ page }) => {
    const { box } = await openBoard(page);
    const label = page.locator('.sv-zoom-label');
    await expect(label).toHaveText('100%');
    await page.getByRole('button', { name: 'Acercar' }).click();
    await expect(label).toHaveText('125%');
    await page.getByRole('button', { name: 'Alejar' }).click();
    await expect(label).toHaveText('100%');
    await page.mouse.move(box.x + 300, box.y + 200);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(async () => parseInt(await label.innerText(), 10)).toBeGreaterThan(100);
  });
});

async function openBoardBox(page: import('@playwright/test').Page) {
  const box = (await page.locator('.sv-board-wrap canvas').boundingBox())!;
  return { box };
}
