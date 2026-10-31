import { test, expect, type Page } from '@playwright/test';
async function app(page: Page, id: string) { await page.getByTestId('phone-button').click(); await page.getByTestId(id).click(); }
for (const [device,width,height] of [['phone',390,844],['iPad',820,1180],['desktop',1440,1000]] as const) {
  test(`${device}: empty study library creates, edits and reviews user cards`, async ({ page }) => {
    await page.setViewportSize({width,height}); await page.goto('/'); await app(page,'phone-cards');
    const study=page.getByRole('region',{name:'Tarjetas de estudio'});
    await expect(study.getByText('Todavía no tienes mazos. Crea uno con tus propias preguntas.')).toBeVisible();
    await expect(study.getByRole('button',{name:'Detectar Ollama'})).not.toBeVisible();
    await page.screenshot({path:`/tmp/redesign-study-${device}.png`,fullPage:true,animations:'disabled'});
    await study.getByRole('button',{name:'Crear mazo',exact:true}).click();
    await study.getByLabel('Nombre del mazo').fill('Mi repaso');await study.getByRole('button',{name:'Crear',exact:true}).click();
    await study.getByLabel('Pregunta',{exact:true}).fill('¿Cuál es la capital de Francia?');await study.getByLabel('Respuesta',{exact:true}).fill('París');
    await study.locator('summary',{hasText:'Opciones de concurso'}).click();
    await study.getByLabel('Usar en concursos').check();await study.getByLabel('Opción 1',{exact:true}).fill('París');await study.getByLabel('Opción 2',{exact:true}).fill('Lyon');await study.getByLabel('Respuesta correcta').selectOption('0');
    await study.getByRole('button',{name:'Añadir tarjeta',exact:true}).click();
    await expect(study.getByText('1. ¿Cuál es la capital de Francia?')).toBeVisible();
    await study.getByRole('button',{name:'Biblioteca',exact:true}).click();await study.getByRole('button',{name:'Repasar',exact:true}).click();
    await expect(study.locator('.sv-study-card')).toHaveText('¿Cuál es la capital de Francia?');await study.getByRole('button',{name:'Revelar respuesta'}).click();await expect(study.locator('.sv-study-card')).toHaveText('París');await study.getByRole('button',{name:'Lo sabía',exact:true}).click();
    await study.getByRole('button',{name:'Volver a la biblioteca'}).click();await expect(study.getByText('1 tarjetas · 1 aprendidas')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await study.getByRole('button',{name:'Cerrar',exact:true}).click();await page.reload();await app(page,'phone-cards');await expect(study.getByRole('heading',{name:'Mi repaso'})).toBeVisible();
  });
}
test('decoration validates previews, rotates, undoes, redoes and persists',async({page})=>{
  await page.goto('/');await app(page,'phone-decorate');await page.getByRole('button',{name:'Colocar Mesa',exact:true}).click();
  const controls=page.getByRole('group',{name:'Decorar habitación'});await expect(controls).toBeVisible();
  const canvas=page.locator('.sv-stage-pane canvas');const box=(await canvas.boundingBox())!;
  const click=async(x:number,y:number)=>canvas.click({position:{x:box.width*x/768,y:box.height*y/432}});
  await click(384,380);await expect(page.locator('.sv-furniture-item')).toHaveCount(7);
  await click(256,272);await expect(page.locator('.sv-furniture-item')).toHaveCount(8);
  await controls.getByRole('button',{name:'Girar',exact:true}).click();await page.screenshot({path:'/tmp/redesign-decoration.png',fullPage:true,animations:'disabled'});
  await controls.getByRole('button',{name:'Deshacer',exact:true}).click();await controls.getByRole('button',{name:'Deshacer',exact:true}).click();await expect(page.locator('.sv-furniture-item')).toHaveCount(7);
  await controls.getByRole('button',{name:'Rehacer',exact:true}).click();await controls.getByRole('button',{name:'Rehacer',exact:true}).click();await expect(page.locator('.sv-furniture-item')).toHaveCount(8);
  await controls.getByRole('button',{name:'Terminar',exact:true}).click();await expect(controls).toBeHidden();await page.reload();await app(page,'phone-decorate');await expect(page.locator('.sv-furniture-item')).toHaveCount(8);
});
test('host selects role sets and ends a running Werewolves game',async({page})=>{
  await page.goto('/');const canvas=page.locator('.sv-stage-pane canvas');await canvas.focus();
  await page.keyboard.down('d');await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Ir a Plaza Comunitaria',{timeout:10000});await page.keyboard.up('d');await page.keyboard.press('e');
  await page.keyboard.down('d');await expect(page.locator('.sv-touch-btn-label').last()).toContainText('Hombres Lobo',{timeout:10000});await page.keyboard.up('d');await page.keyboard.press('e');
  await page.locator('.sv-role-setup > summary').click();await expect(page.locator('.sv-role-card')).toHaveCount(8);await page.getByLabel('Set de cartas').selectOption('bonds');
  await page.getByPlaceholder('Nombre del set').fill('Con vínculos');await page.getByRole('button',{name:'Guardar set',exact:true}).click();
  await page.screenshot({path:'/tmp/redesign-roles.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Sentarme a la mesa'}).click();for(let i=0;i<3;i++)await page.getByRole('button',{name:'Añadir bot',exact:true}).click();
  await page.getByRole('button',{name:'Repartir cartas'}).click();await expect(page.getByRole('heading',{name:'Mira tu carta'})).toBeVisible();
  await page.getByRole('button',{name:'Terminar partida',exact:true}).click();await page.getByRole('button',{name:'¿Terminar para todos?',exact:true}).click();await expect(page.getByRole('heading',{name:'La mesa de la hoguera'})).toBeVisible();
  await expect(page.locator('.ww-seat:not(.is-empty)')).toHaveCount(4);
});
test('notes and VS Code projects use village paper surfaces without example records',async({page})=>{
  await page.goto('/');await app(page,'phone-notes');await expect(page.getByTestId('secure-note-title')).toHaveCount(0);await page.screenshot({path:'/tmp/redesign-notes.png',fullPage:true,animations:'disabled'});
  await page.getByTestId('expansion-modal-close').click();await app(page,'phone-projects');await expect(page.getByRole('region',{name:'Proyectos en VS Code'})).toBeVisible();await page.screenshot({path:'/tmp/redesign-projects.png',fullPage:true,animations:'disabled'});
});

test('Gartic only admits bots after an explicitly verified Ollama model (mocked service)', async({page})=>{
  let vision=false;
  await page.route('http://127.0.0.1:11434/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const prompt=route.request().postDataJSON()?.prompt??'';
    const drawing={drawing:{strokes:[{c:'#000000',w:4,p:[10,10,100,10,100,100,10,100,10,10]}]}};
    const body=path==='/api/tags'?{models:[{name:'vision-test'}]}:path==='/api/show'?{capabilities:vision?['vision','completion']:['completion']}:{response:JSON.stringify(prompt.includes('Dibuja')?drawing:{text:'Texto producido por el modelo de prueba'})};
    await route.fulfill({json:body,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/');const canvas=page.locator('.sv-stage-pane canvas');let box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width-15,y:box.height/2}});await expect(page.locator('.sv-hud-place h1')).toHaveText('Plaza Comunitaria',{timeout:15000});box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width*169/768,y:box.height*110/432}});
  await expect(page.getByRole('region',{name:'Gartic Phone'})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const advanced=page.locator('.gp details');const openAdvanced=async()=>{if(!await advanced.evaluate(el=>(el as HTMLDetailsElement).open))await advanced.locator('summary').click();};
  await expect(page.getByRole('button',{name:'Añadir bot Ollama'})).not.toBeVisible();await openAdvanced();await expect(page.getByRole('button',{name:'Añadir bot Ollama'})).toBeDisabled();
  await page.getByRole('button',{name:'Detectar Ollama',exact:true}).click();await expect(page.getByLabel('Modelo para bots')).toHaveValue('vision-test');await page.getByRole('button',{name:'Comprobar compatibilidad'}).click();await expect(page.getByText('Este modelo no declara capacidad de visión.')).toBeVisible();await expect(page.getByRole('button',{name:'Añadir bot Ollama'})).toBeDisabled();
  vision=true;await page.getByRole('button',{name:'Comprobar compatibilidad'}).click();await expect(page.getByRole('button',{name:'Añadir bot Ollama'})).toBeEnabled({timeout:15000});
  for(let i=0;i<2;i++){await openAdvanced();await page.getByRole('button',{name:'Añadir bot Ollama'}).click();}
  await page.getByRole('button',{name:'Empezar',exact:true}).click();await expect(page.locator('.gp')).toHaveAttribute('data-phase','write');await page.getByPlaceholder('Escribe tu frase').fill('Mi frase de dibujo');await page.getByRole('button',{name:'¡Listo!',exact:true}).click();await expect(page.locator('.gp')).toHaveAttribute('data-phase','draw',{timeout:15000});
  await page.screenshot({path:'/tmp/redesign-gartic.png',animations:'disabled'});await page.getByRole('button',{name:'Terminar partida',exact:true}).click();await page.getByRole('button',{name:'¿Terminar para todos?',exact:true}).click();await expect(page.locator('.gp')).toHaveAttribute('data-phase','lobby');
});
