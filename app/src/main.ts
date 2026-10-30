import './style.css';
import { mountDiagnostic } from './diagnostics/page';
const root = document.querySelector<HTMLDivElement>('#app')!;
if (new URLSearchParams(location.search).get('diagnostic') === '1') {
  mountDiagnostic(root);
} else {
  root.textContent = 'StudyVillage · Preparando tu rincón…';
  import('./bootstrap').then(({ startApp }) => startApp(root)).catch(() => {
    root.replaceChildren();
    const main = document.createElement('main'); main.className = 'diagnostic-page';
    const heading = document.createElement('h1'); heading.textContent = 'No se pudo abrir tu espacio local.';
    const detail = document.createElement('p'); detail.textContent = 'Comprueba el almacenamiento y WebCrypto del navegador o WebView. Si los datos están dañados o son de otra versión, la copia original se conserva: no se ha reiniciado la base de datos. Haz una copia antes de repararla.';
    const link = document.createElement('a'); link.href = '?diagnostic=1'; link.textContent = 'Abrir diagnóstico multimedia';
    main.append(heading, detail, link); root.append(main);
  });
}
