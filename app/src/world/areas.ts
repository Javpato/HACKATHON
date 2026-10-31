import { LIMITS, type Position } from '../protocol/types';
import {
  PALETTE, animClock, contactShadow, drawAvatar, drawTree, fill,
  glowPool, hash01, ipx, paintSceneFade, plate, reducedMotion, seed, shade, text, trackCharacter,
} from '../ui/art';
import type { DrawPerson } from './draw';
import { InteractiveObjectRegistry, type InteractiveObjectConfig } from './interactive-objects';
import type { Rect } from './model';

/**
 * Part 2 — World Structure: Distinct Areas
 *
 * Defines the neighborhood's interconnected spatial areas:
 * 1. `residential` — Barrio Residencial (6 deterministic player house parcels + portals)
 * 2. `community`   — Plaza Comunitaria (shared social hub with Werewolves campfire,
 *                    Gartic Phone drawing table, Community Whiteboard,
 *                    Collaborative Project workstation, and portal to Study Library)
 * 3. `study`       — Biblioteca y Taller de Estudio (dedicated creative & study zone
 *                    with Shared Flashcard Podium, Secure Notes Desk, Study Whiteboard,
 *                    Project Terminal, and Local AI / Ollama Tutor Console)
 * 4. `house:<id>`  — Personal customizable player house interiors
 */

export type BuiltinAreaId = 'residential' | 'community' | 'study';

export interface AreaPortal {
  id: string;
  fromArea: BuiltinAreaId;
  toArea: BuiltinAreaId;
  label: string;
  prompt: string;
  rect: Rect;
  spawnAtTarget: Position;
}

export interface WorldAreaDefinition {
  id: BuiltinAreaId;
  displayName: string;
  subtitle: string;
  bounds: Rect;
  defaultSpawn: Position;
  portals: readonly AreaPortal[];
  lampPositions: readonly { x: number; y: number }[];
  isInterior: boolean;
}

export const WORLD_AREAS: Record<BuiltinAreaId, WorldAreaDefinition> = {
  residential: {
    id: 'residential',
    displayName: 'La aldea',
    subtitle: 'Seis parcelas residenciales conectadas con la Plaza Comunitaria y la Biblioteca.',
    bounds: { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
    defaultSpawn: { x: 384, y: 215, direction: 'down', moving: false },
    portals: [
      {
        id: 'portal:res-to-community',
        fromArea: 'residential',
        toArea: 'community',
        label: 'Plaza Comunitaria →',
        prompt: 'E · Ir a Plaza Comunitaria',
        rect: { x: 716, y: 192, w: 50, h: 52 },
        spawnAtTarget: { x: 72, y: 220, direction: 'right', moving: false },
      },
      {
        id: 'portal:res-to-study',
        fromArea: 'residential',
        toArea: 'study',
        label: '← Biblioteca y Estudio',
        prompt: 'E · Ir a Biblioteca de Estudio',
        rect: { x: 2, y: 192, w: 50, h: 52 },
        spawnAtTarget: { x: 696, y: 224, direction: 'left', moving: false },
      },
    ],
    lampPositions: [
      { x: 238, y: 188 },
      { x: 530, y: 188 },
    ],
    isInterior: false,
  },
  community: {
    id: 'community',
    displayName: 'Plaza Comunitaria',
    subtitle: 'Centro social del vecindario: Hombres Lobo, Gartic Phone, pizarra común y proyectos.',
    bounds: { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
    defaultSpawn: { x: 384, y: 270, direction: 'down', moving: false },
    portals: [
      {
        id: 'portal:community-to-res',
        fromArea: 'community',
        toArea: 'residential',
        label: '← Barrio Residencial',
        prompt: 'E · Volver al Barrio Residencial',
        rect: { x: 4, y: 192, w: 54, h: 54 },
        spawnAtTarget: { x: 690, y: 215, direction: 'left', moving: false },
      },
      {
        id: 'portal:community-to-study',
        fromArea: 'community',
        toArea: 'study',
        label: 'Biblioteca de Estudio →',
        prompt: 'E · Entrar a la Biblioteca de Estudio',
        rect: { x: 710, y: 192, w: 54, h: 54 },
        spawnAtTarget: { x: 74, y: 224, direction: 'right', moving: false },
      },
    ],
    lampPositions: [
      { x: 190, y: 150 },
      { x: 578, y: 150 },
      { x: 190, y: 310 },
      { x: 578, y: 310 },
    ],
    isInterior: false,
  },
  study: {
    id: 'study',
    displayName: 'Biblioteca y Taller de Estudio',
    subtitle: 'Espacio tranquilo para apuntes seguros, tarjetas de memoria en grupo, pizarras e IA local.',
    bounds: { x: 28, y: 68, w: 712, h: 338 },
    defaultSpawn: { x: 384, y: 330, direction: 'up', moving: false },
    portals: [
      {
        id: 'portal:study-to-community',
        fromArea: 'study',
        toArea: 'community',
        label: '← Plaza Comunitaria',
        prompt: 'E · Salir a Plaza Comunitaria',
        rect: { x: 32, y: 196, w: 52, h: 54 },
        spawnAtTarget: { x: 680, y: 220, direction: 'left', moving: false },
      },
      {
        id: 'portal:study-to-res',
        fromArea: 'study',
        toArea: 'residential',
        label: 'Barrio Residencial →',
        prompt: 'E · Ir al Barrio Residencial',
        rect: { x: 684, y: 196, w: 52, h: 54 },
        spawnAtTarget: { x: 76, y: 215, direction: 'right', moving: false },
      },
    ],
    lampPositions: [
      { x: 160, y: 140 },
      { x: 384, y: 210 },
      { x: 608, y: 140 },
    ],
    isInterior: true,
  },
};

export const DEFAULT_AREA_OBJECTS: readonly InteractiveObjectConfig[] = [
  // ---------------------------------------------------------------------------
  // Central Community Area ("Plaza Comunitaria") interactive stations
  // ---------------------------------------------------------------------------
  {
    id: 'community:campfire-werewolves',
    areaId: 'community',
    kind: 'campfire_werewolves',
    defaultLabel: 'Hoguera de los Lobos',
    displayName: 'Hoguera · Hombres Lobo',
    description: 'Mesa junto al fuego para jugar Hombres Lobo (4 a 8 jugadores, con bots si faltan).',
    promptKey: 'E · Jugar Hombres Lobo',
    x: 342,
    y: 176,
    w: 84,
    h: 68,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 48,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: { activeGame: 'werewolves' },
    revision: 1,
  },
  {
    id: 'community:drawing-table-gartic',
    areaId: 'community',
    kind: 'drawing_table_gartic',
    defaultLabel: 'Mesa de dibujo',
    displayName: 'Mesa · Gartic Phone',
    description: 'Mesa creativa de dibujo y teléfono descompuesto para toda la aldea.',
    promptKey: 'E · Jugar Gartic Phone',
    x: 128,
    y: 86,
    w: 82,
    h: 54,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 44,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: { activeGame: 'gartic' },
    revision: 1,
  },
  {
    id: 'community:shared-board',
    areaId: 'community',
    kind: 'whiteboard',
    defaultLabel: 'Gran Pizarra Comunitaria',
    displayName: 'Pizarra de la Plaza',
    description: 'Pizarra colaborativa persistente e independiente de la Plaza Comunitaria.',
    promptKey: 'E · Pizarra de la Plaza',
    x: 332,
    y: 54,
    w: 104,
    h: 38,
    layer: 'wall',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedBoardId: 'board:community-plaza',
    state: {},
    revision: 1,
  },
  {
    id: 'community:project-station',
    areaId: 'community',
    kind: 'computer_project',
    defaultLabel: 'Terminal de Proyectos',
    displayName: 'Estación de Proyectos',
    description: 'Proyectos del grupo: abre el repositorio o únete a la sesión Live Share en VS Code.',
    promptKey: 'E · Proyectos en VS Code',
    x: 132,
    y: 304,
    w: 78,
    h: 48,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 44,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedProjectId: 'project:community-main',
    state: {},
    revision: 1,
  },
  {
    id: 'community:voice-gazebo',
    areaId: 'community',
    kind: 'voice_table',
    defaultLabel: 'Mesa de Charla y Pantalla',
    displayName: 'banco de Charla HD',
    description: 'Rincón para conversar por voz o ver pantallas compartidas en grupo.',
    promptKey: 'E · Voz y Pantalla',
    x: 548,
    y: 304,
    w: 80,
    h: 48,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 44,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },

  // ---------------------------------------------------------------------------
  // Creative and Study Area ("Biblioteca y Taller de Estudio") stations
  // ---------------------------------------------------------------------------
  {
    id: 'study:board-main',
    areaId: 'study',
    kind: 'whiteboard',
    defaultLabel: 'Pizarra de la Biblioteca',
    displayName: 'Pizarra de Seminario',
    description: 'Pizarra matemática e interactiva independiente de la Biblioteca de Estudio.',
    promptKey: 'E · Pizarra de Biblioteca',
    x: 224,
    y: 74,
    w: 98,
    h: 34,
    layer: 'wall',
    hasCollision: false,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedBoardId: 'board:study-library',
    state: {},
    revision: 1,
  },
  {
    id: 'study:board-secondary',
    areaId: 'study',
    kind: 'whiteboard',
    defaultLabel: 'Pizarra de Fórmulas',
    displayName: 'Pizarra de Cálculo',
    description: 'Segunda pizarra independiente para comparar demostraciones sin sobrescribir la principal.',
    promptKey: 'E · Pizarra de Cálculo',
    x: 446,
    y: 74,
    w: 98,
    h: 34,
    layer: 'wall',
    hasCollision: false,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedBoardId: 'board:study-calculus',
    state: {},
    revision: 1,
  },
  {
    id: 'study:notes-archive',
    areaId: 'study',
    kind: 'bookshelf_notes',
    defaultLabel: 'Archivo de Apuntes Seguros',
    displayName: 'Cuadernos y Apuntes',
    description: 'Sistema de apuntes Markdown + LaTeX no ejecutable con cuadernos privados y compartidos.',
    promptKey: 'E · Abrir Apuntes Seguros',
    x: 96,
    y: 86,
    w: 76,
    h: 58,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedNotebookId: 'notebook:general',
    state: {},
    revision: 1,
  },
  {
    id: 'study:flashcard-podium',
    areaId: 'study',
    kind: 'flashcard_podium',
    defaultLabel: 'Mesa de Estudio con Tarjetas',
    displayName: 'Sesión de Flashcards',
    description: 'Mesa central para repasar mazos de flashcards en solitario o en sesión multijugador.',
    promptKey: 'E · Sesión de Flashcards',
    x: 334,
    y: 196,
    w: 100,
    h: 58,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 48,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },
  {
    id: 'study:ollama-console',
    areaId: 'study',
    kind: 'ai_tutor_console',
    defaultLabel: 'Consola IA Local (Ollama)',
    displayName: 'Tutor IA Local · Ollama',
    description: 'Puerta de enlace opcional a Ollama en el anfitrión para generar flashcards, quizzes y resúmenes.',
    promptKey: 'E · Consola IA / Ollama',
    x: 590,
    y: 92,
    w: 76,
    h: 54,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },
  {
    id: 'study:project-workbench',
    areaId: 'study',
    kind: 'computer_project',
    defaultLabel: 'Taller de proyectos',
    displayName: 'Taller de Proyectos',
    description: 'Proyectos del grupo: abre el repositorio o únete a la sesión Live Share en VS Code.',
    promptKey: 'E · Proyectos en VS Code',
    x: 136,
    y: 298,
    w: 84,
    h: 50,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedProjectId: 'project:study-lab',
    state: {},
    revision: 1,
  },
  {
    id: 'study:quiet-desk',
    areaId: 'study',
    kind: 'study_desk',
    defaultLabel: 'Pupitre de Lectura',
    displayName: 'Pupitre Pomodoro',
    description: 'Pupitre tranquilo para planificar sesiones Pomodoro de 25 minutos y tomar notas.',
    promptKey: 'E · Pupitre de Estudio',
    x: 546,
    y: 298,
    w: 84,
    h: 50,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },
];

export function closestPortal(areaId: BuiltinAreaId, pos: Position, maxDistance = 36): AreaPortal | null {
  const area = WORLD_AREAS[areaId];
  if (!area) return null;
  let best: AreaPortal | null = null;
  let bestDist = maxDistance;
  for (const portal of area.portals) {
    const nx = Math.max(portal.rect.x, Math.min(pos.x, portal.rect.x + portal.rect.w));
    const ny = Math.max(portal.rect.y, Math.min(pos.y, portal.rect.y + portal.rect.h));
    const d = Math.hypot(pos.x - nx, pos.y - ny);
    if (d <= bestDist) {
      bestDist = d;
      best = portal;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pixel-Art Renderer for Central Community Area & Creative Study Area
// ---------------------------------------------------------------------------

const W = 768;
const H = 432;
const [, moss1, moss2, moss3, moss4, moss5] = PALETTE.moss;
const [earth0, earth1, earth2, earth3, earth4] = PALETTE.earth;
const [ember0, ember1, ember2, ember3, ember4] = PALETTE.ember;
const [tide0, tide1, tide2, tide3] = PALETTE.tide;

interface Sprite {
  baseline: number;
  paint: () => void;
}

export function drawPortalSign(ctx: CanvasRenderingContext2D, portal: AreaPortal, nearby: boolean): void {
  const { x, y, w, h } = portal.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Cobblestone threshold pad
  fill(ctx, earth1, x + 2, y + 6, w - 4, h - 12);
  fill(ctx, earth3, x + 5, y + 9, w - 10, h - 18);
  fill(ctx, ember3, x + 8, cy - 2, w - 16, 4);

  // Wooden signpost
  fill(ctx, earth0, cx - 3, y - 10, 6, 20);
  const labelW = Math.max(88, Math.min(148, portal.label.length * 5.6 + 16));
  const lx = Math.max(6, Math.min(W - labelW - 6, cx - labelW / 2));
  plate(
    ctx,
    lx,
    y - 24,
    labelW,
    17,
    nearby ? ember4 : PALETTE.paper[3],
    nearby ? ember0 : earth0,
  );
  text(ctx, portal.label, lx + labelW / 2, y - 12, PALETTE.paper[0], 8.5);
}

function paintStationObject(
  ctx: CanvasRenderingContext2D,
  obj: InteractiveObjectConfig,
  registry: InteractiveObjectRegistry,
  nearby: boolean,
  selected: boolean,
  time: number,
): void {
  const { x, y, w, h } = obj;
  if (obj.layer !== 'wall') {
    contactShadow(ctx, x + w / 2, y + h - 2, w * 0.46, 0.32);
  }

  const customSprite = registry.getDecodedSprite(obj.id);
  const baseColor = obj.customColor || earth2;
  const baseDark = shade(baseColor, -28);
  const baseLit = shade(baseColor, 20);

  if (customSprite) {
    ctx.drawImage(customSprite, ipx(x), ipx(y), ipx(w), ipx(h));
  } else {
    switch (obj.kind) {
      case 'campfire_werewolves': {
        // Log seats around a glowing medieval campfire table
        fill(ctx, earth1, x + 6, y + h / 2 - 8, 16, 16);
        fill(ctx, earth1, x + w - 22, y + h / 2 - 8, 16, 16);
        fill(ctx, earth1, x + w / 2 - 12, y + 2, 24, 12);
        fill(ctx, earth1, x + w / 2 - 12, y + h - 14, 24, 12);

        // Stone fire ring & round wooden council table
        fill(ctx, '#5c6166', x + 18, y + 14, w - 36, h - 28);
        fill(ctx, '#7c8288', x + 22, y + 18, w - 44, h - 36);
        fill(ctx, earth0, x + 26, y + 22, w - 52, h - 44);

        // Animated pixel fire
        const flicker = Math.sin(time * 6) * 2;
        fill(ctx, ember1, x + w / 2 - 10, y + h / 2 - 6, 20, 12);
        fill(ctx, ember3, x + w / 2 - 7, y + h / 2 - 11 + flicker * 0.5, 14, 12);
        fill(ctx, ember4, x + w / 2 - 4, y + h / 2 - 14 + flicker, 8, 9);
        glowPool(ctx, x + w / 2, y + h / 2 + 4, 48, '255,180,95');
        break;
      }
      case 'drawing_table_gartic': {
        // Large studio drawing table with easel, color pots & paper sheets
        fill(ctx, baseDark, x + 6, y + 24, 8, h - 24);
        fill(ctx, baseDark, x + w - 14, y + 24, 8, h - 24);
        fill(ctx, baseColor, x, y + 10, w, 20);
        fill(ctx, baseLit, x, y + 10, w, 5);
        // Paper pad
        fill(ctx, PALETTE.paper[4], x + 12, y + 13, 34, 14);
        fill(ctx, ember2, x + 16, y + 16, 14, 3);
        fill(ctx, tide2, x + 16, y + 21, 20, 3);
        // Color pots
        fill(ctx, ember1, x + 54, y + 12, 7, 7);
        fill(ctx, tide1, x + 63, y + 12, 7, 7);
        fill(ctx, moss4, x + 58, y + 20, 7, 6);
        break;
      }
      case 'whiteboard': {
        fill(ctx, baseDark, x, y, w, h);
        fill(ctx, baseLit, x + 2, y + 2, w - 4, 4);
        fill(ctx, '#fbf8ee', x + 5, y + 6, w - 10, h - 12);
        fill(ctx, tide1, x + 12, y + 12, w * 0.42, 3);
        fill(ctx, ember1, x + 12, y + 18, w * 0.58, 3);
        fill(ctx, moss2, x + 12, y + 24, w * 0.3, 3);
        fill(ctx, baseColor, x + 3, y + h - 5, w - 6, 4);
        break;
      }
      case 'computer_project': {
        fill(ctx, baseDark, x + 6, y + 22, 7, h - 22);
        fill(ctx, baseDark, x + w - 13, y + 22, 7, h - 22);
        fill(ctx, baseColor, x, y + 12, w, 14);
        fill(ctx, baseLit, x, y + 12, w, 4);
        // Dual monitors
        for (const mx of [x + 10, x + w - 38]) {
          fill(ctx, '#223634', mx, y - 2, 28, 16);
          fill(ctx, '#162624', mx + 2, y, 24, 12);
          fill(ctx, '#6fd1b8', mx + 4, y + 2, 16, 3);
          fill(ctx, '#f0b86e', mx + 4, y + 7, 12, 2);
          fill(ctx, '#223634', mx + 11, y + 14, 6, 3);
        }
        break;
      }
      case 'bookshelf_notes': {
        fill(ctx, shade(earth0, -10), x, y, w, h);
        fill(ctx, earth1, x + 3, y + 3, w - 6, h - 6);
        const bookColors = [ember1, tide1, ember3, moss3, '#7a6ba8'];
        for (let row = 0; row < 3; row++) {
          const sy = y + 8 + row * 16;
          fill(ctx, earth0, x + 5, sy + 11, w - 10, 3);
          for (let col = 0; col < 7; col++) {
            fill(ctx, bookColors[(row + col) % bookColors.length], x + 7 + col * 9, sy + 2, 7, 9);
          }
        }
        break;
      }
      case 'flashcard_podium': {
        fill(ctx, baseDark, x + 8, y + 26, 8, h - 26);
        fill(ctx, baseDark, x + w - 16, y + 26, 8, h - 26);
        fill(ctx, baseColor, x, y + 8, w, 24);
        fill(ctx, baseLit, x + 2, y + 8, w - 4, 5);
        // Flashcard decks on the table
        for (const cx of [x + 16, x + 42, x + 68]) {
          fill(ctx, PALETTE.paper[3], cx, y + 13, 18, 12);
          fill(ctx, ember2, cx + 2, y + 15, 14, 3);
        }
        glowPool(ctx, x + w / 2, y + h / 2, 42, '255,220,150');
        break;
      }
      case 'ai_tutor_console': {
        fill(ctx, '#253c38', x + 4, y + 8, w - 8, h - 8);
        fill(ctx, '#345650', x + 6, y + 10, w - 12, h - 14);
        fill(ctx, '#162825', x + 12, y + 14, w - 24, 20);
        fill(ctx, '#84e3c8', x + 16, y + 18, w - 32, 4);
        fill(ctx, ember4, x + 16, y + 25, (w - 32) * 0.65, 4);
        glowPool(ctx, x + w / 2, y + h, 36, '132,227,200');
        break;
      }
      default: {
        fill(ctx, baseDark, x + 4, y + 16, w - 8, h - 16);
        fill(ctx, baseColor, x, y + 8, w, 14);
        fill(ctx, baseLit, x, y + 8, w, 4);
        break;
      }
    }
  }

  if (nearby || selected) {
    ctx.save();
    ctx.strokeStyle = selected ? ember3 : 'rgba(255, 228, 156, 0.92)';
    ctx.lineWidth = 2;
    if (selected) ctx.setLineDash([5, 3]);
    ctx.strokeRect(ipx(x - 3), ipx(y - 3), ipx(w + 6), ipx(h + 6));
    ctx.restore();
  }

  // Nameplate below or above station
  const label = obj.displayName.slice(0, 26);
  ctx.font = '700 8.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const tw = Math.min(148, Math.ceil(ctx.measureText(label).width) + 14);
  const ly = obj.layer === 'wall' ? y + h + 3 : y - 17;
  plate(
    ctx,
    x + w / 2 - tw / 2,
    ly,
    tw,
    14,
    nearby ? ember4 : 'rgba(251,244,226,0.94)',
    'rgba(30,55,48,0.55)',
  );
  text(ctx, label, x + w / 2, ly + 10, PALETTE.paper[0], 8.5);
}

export function drawCommunityPlaza(
  ctx: CanvasRenderingContext2D,
  people: readonly DrawPerson[],
  registry: InteractiveObjectRegistry,
  nearbyObjectId: string | null,
  selectedObjectId: string | null,
  nearbyPortalId: string | null,
  dt = 0,
): void {
  ctx.imageSmoothingEnabled = false;
  const calm = reducedMotion();
  const time = calm ? 0 : animClock();

  // Lush meadow background
  fill(ctx, moss3, 0, 0, W, H);
  for (let i = 0; i < 20; i++) {
    const n = hash01(`c_patch_${i}`);
    const m = hash01(`c_patchb_${i}`);
    ctx.fillStyle = n > 0.5 ? 'rgba(124,192,119,0.08)' : 'rgba(47,90,62,0.07)';
    ctx.beginPath();
    ctx.ellipse(m * W, n * H, 80, 42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // East-West grand cobblestone avenue + central circular plaza
  fill(ctx, earth1, 0, 190, W, 56);
  fill(ctx, earth3, 0, 194, W, 48);

  // Central stone courtyard
  fill(ctx, earth1, 108, 66, 552, 304);
  fill(ctx, earth3, 114, 72, 540, 292);
  fill(ctx, shade(earth4, 8), 124, 80, 520, 276);

  // Decorative mosaic compass in the courtyard
  ctx.strokeStyle = shade(earth2, -8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(384, 210, 118, 72, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Decorative pond on the bottom center
  fill(ctx, tide0, 330, 304, 108, 48);
  fill(ctx, tide2, 334, 308, 100, 40);
  fill(ctx, tide3, 344, 314, 36, 10);

  // Banner header on the north wall of the plaza
  plate(ctx, 264, 12, 240, 24, PALETTE.paper[3], earth0);
  text(ctx, 'PLAZA COMUNITARIA · JUEGOS Y PROYECTOS', 384, 27, PALETTE.paper[0], 9.5);

  const area = WORLD_AREAS.community;
  for (const portal of area.portals) {
    drawPortalSign(ctx, portal, portal.id === nearbyPortalId);
  }

  const sprites: Sprite[] = [];
  const trees = [
    { x: 64, y: 92 },
    { x: 704, y: 92 },
    { x: 64, y: 344 },
    { x: 704, y: 344 },
  ];
  for (const t of trees) {
    const sway = calm ? 0 : Math.sin(time * 0.9 + t.x) * 1.4;
    sprites.push({
      baseline: t.y + 12,
      paint: () => drawTree(ctx, t.x, t.y, 1.0, sway, 0),
    });
  }

  for (const obj of registry.listByArea('community')) {
    sprites.push({
      baseline: obj.layer === 'wall' ? obj.y : obj.y + obj.h,
      paint: () =>
        paintStationObject(
          ctx,
          obj,
          registry,
          obj.id === nearbyObjectId,
          obj.id === selectedObjectId,
          time,
        ),
    });
  }

  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn, 'community');
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn),
    });
  }

  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const s of sprites) s.paint();

  paintSceneFade(ctx, 'area:community', W, H);
}

export function drawStudyLibrary(
  ctx: CanvasRenderingContext2D,
  people: readonly DrawPerson[],
  registry: InteractiveObjectRegistry,
  nearbyObjectId: string | null,
  selectedObjectId: string | null,
  nearbyPortalId: string | null,
  dt = 0,
): void {
  ctx.imageSmoothingEnabled = false;
  const calm = reducedMotion();
  const time = calm ? 0 : animClock();

  // Warm library wood & sage panelling
  fill(ctx, '#bfd0ba', 0, 0, W, 72);
  fill(ctx, '#39614c', 0, 66, W, 6);
  fill(ctx, '#a8814f', 0, 72, W, H - 72);

  // Horizontal floorboards
  for (let y = 72; y < H; y += 18) {
    const band = Math.round((y - 72) / 18);
    fill(ctx, band % 2 ? '#b18956' : '#9f7847', 0, y, W, 18);
  }

  // Grand green study carpet in the center
  fill(ctx, '#264a3a', 190, 148, 388, 154);
  fill(ctx, '#356650', 198, 156, 372, 138);
  fill(ctx, '#d9c398', 206, 164, 356, 4);
  fill(ctx, '#d9c398', 206, 282, 356, 4);

  // Library header sign
  plate(ctx, 248, 10, 272, 24, PALETTE.paper[3], '#39614c');
  text(ctx, 'BIBLIOTECA Y TALLER DE ESTUDIO', 384, 25, PALETTE.paper[0], 10);

  const area = WORLD_AREAS.study;
  for (const portal of area.portals) {
    drawPortalSign(ctx, portal, portal.id === nearbyPortalId);
  }

  const sprites: Sprite[] = [];
  for (const obj of registry.listByArea('study')) {
    sprites.push({
      baseline: obj.layer === 'wall' ? obj.y : obj.y + obj.h,
      paint: () =>
        paintStationObject(
          ctx,
          obj,
          registry,
          obj.id === nearbyObjectId,
          obj.id === selectedObjectId,
          time,
        ),
    });
  }

  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn, 'study');
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn),
    });
  }

  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const s of sprites) s.paint();

  paintSceneFade(ctx, 'area:study', W, H);
}
