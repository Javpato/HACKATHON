import './style.css';
import { mountDiagnostic } from './diagnostics/page';
mountDiagnostic(document.querySelector<HTMLDivElement>('#app')!);
