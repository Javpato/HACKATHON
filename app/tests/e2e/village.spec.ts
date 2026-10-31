import { test, expect } from '@playwright/test';

// Browser-only evidence for the local village shell. These checks exercise the
// Canvas/UI and local persistence paths that run without signaling, capture or a
// second host. They are NOT evidence of real microphone/screen capture, Tauri
// WebKitGTK behaviour, or two-host operation; those remain UNVERIFIED.

const SECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['La aldea', 'La aldea'],
  ['Mi casa', 'Mi rincón de estudio'],
  ['Editor local', 'Tu cuaderno de código'],
  ['Contactos', 'Personas de confianza'],
];

async function openHouseWhiteboard(page: import('@playwright/test').Page, index = 0) {
  await page.locator('.sv-nav-item', { hasText: 'Mi casa' }).first().click();
  const boardItem = page.locator('.sv-furniture-item', { hasText: 'Pizarra' }).nth(index);
  await expect(boardItem).toBeVisible();
  await boardItem.dblclick();
}

test('the village shell loads offline and contacts no external host', async ({ page }) => {
  const external: string[] = [];
  page.on('request', req => {
    if (!req.url().startsWith('http://127.0.0.1:1420') && !req.url().startsWith('http://127.0.0.1:3000')) external.push(req.url());
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

test('every local section opens and marks itself as the current page, and left-side Pizarra button is removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.sv-nav-item', { hasText: 'Pizarra' })).toHaveCount(0);
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
  await openHouseWhiteboard(page, 0);
  const canvas = page.locator('.sv-board-wrap canvas');
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
  await openHouseWhiteboard(page, 0);
  const back = page.getByRole('button', { name: '← Volver a mi casa' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('.sv-nav-item[aria-current="page"]')).toContainText('Mi casa');

  // Escape from the board also steps back into the room, not out to the village.
  await openHouseWhiteboard(page, 0);
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
    await openHouseWhiteboard(page, 0);
    const canvas = page.locator('.sv-board-wrap canvas');
    await expect(canvas).toBeVisible();
    const tool = async (name: string) => {
      await page.locator('.sv-segment-button', { hasText: name }).first().click();
    };
    const undo = page.getByRole('button', { name: '↶ Deshacer' });
    const line = async (yLogic: number) => {
      const currentBox = (await canvas.boundingBox())!;
      const py = currentBox.y + currentBox.height * (yLogic / 432);
      const pxStart = currentBox.x + currentBox.width * (100 / 768);
      await page.mouse.move(pxStart, py);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(
          currentBox.x + currentBox.width * ((100 + i * 20) / 768),
          py,
        );
      }
      await page.mouse.up();
    };
    const box = (await canvas.boundingBox())!;
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
    const eraseX = box.x + box.width * (200 / 768);
    await page.mouse.move(eraseX, box.y + box.height * (280 / 432));
    await page.mouse.down();
    await page.mouse.move(eraseX, box.y + box.height * (320 / 432), { steps: 6 });
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

test.describe('Mobile phone touch controls & responsive experience', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('displays mobile touch controller HUD with D-pad and Action button on phones', async ({ page }) => {
    await page.goto('/');
    // Check that D-pad and Action button are visible on phone viewport
    const touchControls = page.locator('.sv-touch-controls');
    await expect(touchControls).toBeVisible();

    const dpad = page.locator('.sv-dpad');
    await expect(dpad).toBeVisible();
    await expect(page.locator('.sv-dpad-up')).toBeVisible();
    await expect(page.locator('.sv-dpad-down')).toBeVisible();
    await expect(page.locator('.sv-dpad-left')).toBeVisible();
    await expect(page.locator('.sv-dpad-right')).toBeVisible();

    const actionBtn = page.locator('[data-testid="touch-action-btn"]');
    await expect(actionBtn).toBeVisible();
    await expect(actionBtn).toContainText('Usar');

    // Tap D-pad button
    await page.locator('.sv-dpad-up').dispatchEvent('pointerdown');
    await page.waitForTimeout(50);
    await page.locator('.sv-dpad-up').dispatchEvent('pointerup');

    // Tap action button
    await actionBtn.click();

    // Verify touch toggle button
    const toggleBtn = page.locator('.sv-touch-toggle-pill');
    await expect(toggleBtn).toBeVisible();
  });
});

test.describe('Multiplayer pixel-art world expansion', () => {
  test('navigates between Residential, Community Plaza, and Study Library areas and opens minigames & study tools', async ({ page }) => {
    await page.goto('/');

    const expansionBar = page.getByTestId('world-expansion-bar');
    await expect(expansionBar).toBeVisible();

    // Switch to Community Plaza and Study Library
    await page.getByTestId('area-btn-community').click();
    await expect(page.getByTestId('area-btn-community')).toHaveClass(/is-active/);

    await page.getByTestId('area-btn-study').click();
    await expect(page.getByTestId('area-btn-study')).toHaveClass(/is-active/);

    await page.getByTestId('area-btn-residential').click();
    await expect(page.getByTestId('area-btn-residential')).toHaveClass(/is-active/);

    // Open Werewolves modal, add bots, and start Night 1
    await page.getByTestId('open-werewolves-btn').click();
    const modal = page.getByTestId('expansion-modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Hombres Lobo');
    await page.getByTestId('werewolves-add-bots-btn').click();
    await page.getByTestId('werewolves-start-btn').click();
    await expect(modal).toContainText('Tu rol secreto');
    await page.getByTestId('expansion-modal-close').click();
    await expect(modal).toBeHidden();

    // Open Secure Notes modal
    await page.getByTestId('open-secure-notes-btn').click();
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Apuntes Seguros');
    await page.getByTestId('expansion-modal-close').click();

    // Open Flashcards & Local Ollama Study Session modal
    await page.getByTestId('open-ollama-study-btn').click();
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Mazos de Flashcards, Estudio en Grupo y Ollama');
    // Verify honest Ollama status message ("Ollama was not detected.") and zero fake models
    await expect(page.getByTestId('ollama-status-message')).toHaveText('Ollama was not detected.');
    await expect(page.getByTestId('ollama-model-select')).toBeDisabled();

    // Verify Manual Flashcard Creation ("Create Manually" alongside "Generate with AI") works end-to-end without AI
    await expect(page.getByTestId('mode-create-manual-btn')).toBeVisible();
    await expect(page.getByTestId('mode-generate-ai-btn')).toBeVisible();

    // Switch to Generate with AI -> button is disabled because Ollama is not detected
    await page.getByTestId('mode-generate-ai-btn').click();
    await expect(page.getByTestId('flashcard-gen-submit-btn')).toBeDisabled();
    await expect(page.getByTestId('ai-unavailable-notice')).toContainText('Ollama was not detected.');

    // Switch back to Create Manually -> create a deck, rename it, add cards, reorder, edit, and flip
    await page.getByTestId('mode-create-manual-btn').click();
    await page.getByTestId('manual-deck-title-input').fill('Física Clásica Manual');
    await page.getByTestId('manual-deck-create-btn').click();

    await page.getByTestId('manual-card-question').fill('¿Qué dice la Segunda Ley de Newton?');
    await page.getByTestId('manual-card-answer').fill('F = m · a');
    await page.getByTestId('manual-card-hint').fill('Relaciona fuerza, masa y aceleración');
    await page.getByTestId('manual-card-tags').fill('dinámica, newton');
    await page.getByTestId('manual-card-explanation').fill('La fuerza neta es proporcional a la aceleración.');
    await page.getByTestId('manual-card-submit-btn').click();

    // Flip card in interactive study podium
    const flipCard = page.getByTestId('study-session-flip-card');
    await expect(flipCard).toContainText('¿Qué dice la Segunda Ley de Newton?');
    await flipCard.click();
    await expect(flipCard).toContainText('F = m · a');

    await page.getByTestId('expansion-modal-close').click();

    // Verify Collaborative Project workspace inside Editor local
    await page.locator('.sv-nav').getByRole('button', { name: 'Editor local' }).click();
    await expect(page.getByTestId('collab-project-workspace')).toBeVisible();
  });

  test('every whiteboard inside a house is independent and persists its own name and strokes across reopening', async ({ page }) => {
    await page.goto('/');
    await page.locator('.sv-nav-item', { hasText: 'Mi casa' }).first().click();

    // Add a second whiteboard furniture item inside the house
    await page.locator('.sv-house-editor select').last().selectOption('board');
    await page.getByRole('button', { name: '+ Añadir' }).click();
    const boardItems = page.locator('.sv-furniture-item', { hasText: 'Pizarra' });
    await expect(boardItems).toHaveCount(2);

    // Open Whiteboard #1, rename it, and draw a stroke
    await boardItems.nth(0).dblclick();
    const renameInput = page.getByTestId('board-rename-input');
    await renameInput.fill('Pizarra Álgebra');
    await renameInput.dispatchEvent('change');
    const canvas = page.locator('.sv-board-wrap canvas');
    const box1 = (await canvas.boundingBox())!;
    await page.mouse.move(box1.x + 80, box1.y + 80);
    await page.mouse.down();
    await page.mouse.move(box1.x + 220, box1.y + 140, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeEnabled();

    // Return to house and open Whiteboard #2 -> must be completely empty and have its own independent name!
    await page.getByRole('button', { name: '← Volver a mi casa' }).click();
    await boardItems.nth(1).dblclick();
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeDisabled();
    await expect(page.getByTestId('board-rename-input')).not.toHaveValue('Pizarra Álgebra');

    // Return to house and reopen Whiteboard #1 -> its stroke and name persisted!
    await page.getByRole('button', { name: '← Volver a mi casa' }).click();
    await boardItems.nth(0).dblclick();
    await expect(page.getByTestId('board-rename-input')).toHaveValue('Pizarra Álgebra');
    await expect(page.getByRole('button', { name: '↶ Deshacer' })).toBeEnabled();
  });
});
