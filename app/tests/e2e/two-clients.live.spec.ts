import { test, expect, type Page } from '@playwright/test';

// Two real clients on one machine, joined through the real PeerJS cloud
// signaling server, with Chrome's fake microphone. It needs internet access,
// so it is opt-in:  STUDYVILLAGE_LIVE=1 npm run test:e2e
// It proves the protocol end to end. It does NOT prove two separate machines
// or networks, where NAT can still block direct WebRTC.
test.skip(!process.env.STUDYVILLAGE_LIVE, 'needs internet; set STUDYVILLAGE_LIVE=1');
test.use({
  permissions: ['microphone'],
  launchOptions: {
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  },
});

const audience = (page: Page) => page.locator('.sv-media-card .sv-subtle').first();
const hearsSomeone = (page: Page) => page.waitForFunction(() => [...document.querySelectorAll('.sv-media-tile audio')]
  .some((el) => (el as HTMLAudioElement).srcObject instanceof MediaStream
    && ((el as HTMLAudioElement).srcObject as MediaStream).getAudioTracks().some((t) => t.readyState === 'live')), null, { timeout: 30_000 });

test('two players talk in the village, then privately, then hang up', async ({ browser }) => {
  test.setTimeout(120_000);
  const open = async (name: string) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto('/');
    await page.getByRole('button', { name: '⚙ Ajustes' }).click();
    await page.getByLabel('Nombre visible', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    return page;
  };
  const ana = await open('Ana');
  const beto = await open('Beto');

  await ana.getByRole('button', { name: 'Abrir mi aldea' }).click();
  const invite = ana.locator('input[aria-label="Invitación actual"]');
  await expect(invite).not.toHaveValue('', { timeout: 20_000 });
  await beto.getByPlaceholder('Pega una invitación').fill(await invite.inputValue());
  await beto.getByRole('button', { name: 'Unirme' }).click();
  await ana.getByRole('button', { name: 'Permitir' }).click({ timeout: 30_000 });

  // Outside any house: one public room, the village.
  await expect(audience(ana)).toHaveText(/^La aldea · 1/, { timeout: 30_000 });
  await ana.getByRole('button', { name: 'Activar micro' }).click();
  await beto.getByRole('button', { name: 'Activar micro' }).click();
  await hearsSomeone(beto);
  await hearsSomeone(ana);

  // Private call, by mutual choice; both mics stay on.
  await ana.locator('.sv-private-pick', { hasText: 'Beto' }).click();
  await beto.locator('.sv-private-request').getByRole('button', { name: 'Aceptar' }).click();
  await expect(audience(ana)).toHaveText(/^Privado con Beto · 1/, { timeout: 20_000 });
  await expect(ana.getByRole('button', { name: 'Apagar micro' })).toBeVisible();
  await hearsSomeone(beto);

  // Hanging up widens the audience, so the mic is switched off again.
  await ana.locator('.sv-private-status').getByRole('button', { name: 'Colgar' }).click();
  await expect(audience(ana)).toHaveText(/^La aldea · 1/, { timeout: 20_000 });
  await expect(ana.getByRole('button', { name: 'Activar micro' })).toBeVisible();
});
