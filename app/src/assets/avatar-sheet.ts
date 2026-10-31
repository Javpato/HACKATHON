/** Local PNG sheet: three animation columns, rows down/left/right/up. */
const KEY = 'studyvillage-avatar-sheet-v1';
let sheet: HTMLImageElement | null = null;
export function getAvatarSheet(): HTMLImageElement | null {
  return sheet?.complete && sheet.naturalWidth > 0 ? sheet : null;
}
export async function setAvatarSheet(data: string | null): Promise<void> {
  if (data === null) { localStorage.removeItem(KEY); sheet = null; return; }
  if (data.length > 700_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Elige un PNG de hasta 512 KB.');
  const img = new Image();
  img.src = data;
  await img.decode();
  if (img.naturalWidth % 3 || img.naturalHeight % 4 || img.naturalWidth > 1536 || img.naturalHeight > 2048) {
    throw new Error('La cuadrícula debe tener 3 columnas y 4 filas iguales (máximo 1536 × 2048).');
  }
  localStorage.setItem(KEY, data);
  sheet = img;
}
export function loadAvatarSheet(): void {
  try { const data = localStorage.getItem(KEY); if (data) void setAvatarSheet(data).catch(() => {}); } catch { /* Keep the default avatar. */ }
}
