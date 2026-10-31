import { WardrobePanel } from './wardrobe-ui';
import { BODY_TYPES, type AvatarAppearance } from '../assets/appearance';
import { DecorationHistory, placementError } from '../house/decoration';
import { isInScene } from '../world/location';
import './style.css';
import './game.css';
import './theme.css';
import { loadAvatarSheet, setAvatarSheet } from '../assets/avatar-sheet';
import {
  LIMITS, type AppActions, type AppView, type BoardPoint, type BoardStroke,
  type Furniture, type FurnitureKind, type Position, type PublicHouse,
} from '../protocol/types';
import {
  ACCESSORY_LABELS, HAIR_COLORS, HAIR_STYLE_LABELS, SKIN_TONES,
  exportAssetPackJson, getAvatarCustomization, getFurnitureCustomColor,
  importAssetPackJson, setFurnitureCustomColor,
  setFurnitureCustomSprite, type AvatarAccessory, type HairStyle,
} from '../assets/custom-assets';
import { insertAtSelection } from '../editor/snippets';
import {
  generateBoardTutorSteps,
  generateBookshelfStudyPack,
  generateFurniturePixelSprite,
  recognizeBoardToLatex,
  type AiBookshelfResponse,
} from '../ai/study-ai';
import {
  atHouseDoor, closestFurniture, furnitureRect, HOUSE_BOUNDS, HOUSE_DOOR, houseObstacles,
  FURNITURE_ACTION_LABELS, FURNITURE_KINDS, FURNITURE_LABELS, FURNITURE_PROMPT_LABELS,
  HOUSE_SPAWN, addFurniture, deleteFurniture,
  hitFurniture, moveFurniture, setFurnitureAlias, stepHousePosition,
} from '../house/model';
import { drawHouseInterior, drawFurniturePreview } from '../house/draw';
import {
  BOARD_COLORS, DEFAULT_CAMERA, boardAtCapacity, clampBoardPoint, fitCamera, makeStroke, newestOwnStroke,
  nextSequence, panBy, screenToWorld, strokeHit, strokesBounds, visibleStrokes, zoomAt,
  type BoardCamera, type BoardUiTool,
} from '../whiteboard/model';
import { drawBoard, renderBoardForExport, textBox, textFontPx } from '../whiteboard/draw';
import { getMathGeneration } from '../whiteboard/math';
import { WORLD_SPAWN, closestDoor, findPath, occupiedParcels, pointInRect, stepPosition, worldObstacles } from '../world/model';
import { advanceAnim, drawPrompt, reducedMotion } from './art';
import { drawWorld, type DrawPerson } from '../world/draw';
import {
  WORLD_AREAS, closestPortal, drawCommunityPlaza, drawStudyLibrary, type BuiltinAreaId,
} from '../world/areas';
import {
  houseBoardId, type BoardAccessLevel,
} from '../whiteboard/boards-registry';
import { WorldExpansionUIController } from './world-expansion-ui';
import { monoIcon } from './pixel-icons';

type Pane = 'world' | 'house' | 'board' | 'contacts' | 'diagnostics';
type PhonePage = 'home' | 'village' | 'voice' | 'decorate' | 'contacts';
/** Where to walk to use something, and how to use it once there. */
type Interaction = { x: number; y: number; near(): boolean; run(): void };
type DiagnosticKind = Parameters<AppActions['runDiagnostic']>[0];
type MediaMount = { wrapper: HTMLElement; element: HTMLMediaElement; stream: MediaStream; kind: 'audio' | 'screen' };

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', label = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label) element.textContent = label;
  return element;
}

function append<T extends HTMLElement>(parent: T, ...children: (Node | null | undefined)[]): T {
  for (const child of children) if (child) parent.append(child);
  return parent;
}

function button(label: string, className = 'sv-button'): HTMLButtonElement {
  const element = node('button', className, label);
  element.type = 'button';
  return element;
}

function field(labelText: string, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): HTMLLabelElement {
  const label = node('label', 'sv-field');
  append(label, node('span', 'sv-field-label', labelText), control);
  return label;
}

function select(options: readonly { value: string; label: string }[]): HTMLSelectElement {
  const element = node('select', 'sv-select');
  for (const item of options) {
    const option = node('option');
    option.value = item.value;
    option.textContent = item.label;
    element.append(option);
  }
  return element;
}

/** Always on the board toolbar; everything else lives under «Más». */
const MAIN_BOARD_TOOLS: readonly BoardUiTool[] = ['pen', 'text', 'eraser', 'hand'];

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function setInput(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  if (document.activeElement !== element && element.value !== value) element.value = value;
}

function show(element: HTMLElement, visible: boolean): void { element.hidden = !visible; }

const PHASE_LABEL: Record<AppView['network']['phase'], string> = {
  IDLE: 'Sin sesión', SIGNALING: 'Preparando conexión', CONNECTING: 'Conectando',
  AUTHENTICATING: 'Verificando identidad', PENDING_APPROVAL: 'Esperando aprobación',
  JOINED: 'En la aldea', RECONNECTING: 'Reconectando', DENIED: 'Acceso denegado',
  EXPIRED_INVITE: 'Invitación caducada', NETWORK_FAILED: 'Sin conexión',
  KICKED: 'Has salido de la sesión', CLOSED: 'Sesión cerrada',
};

const SCREEN_LABEL: Record<AppView['network']['media']['screenPhase'], string> = {
  OFF: 'Pantalla apagada', REQUESTING_OS_PERMISSION: 'Esperando permiso del sistema',
  CAPTURING_LOCAL: 'Captura local activa', NEGOTIATING: 'Conectando emisión',
  SENDING: 'Compartiendo pantalla', DENIED: 'Permiso denegado',
  NOT_SUPPORTED: 'Captura no disponible aquí', SOURCE_ENDED: 'La fuente terminó',
  NETWORK_FAILED: 'Fallo al compartir',
};

class StudyUI {
  readonly root: HTMLElement;
  readonly actions: AppActions;
  private view: AppView | null = null;
  private pane: Pane = 'world';
  private houseOwnerId: string | null = null;
  private waitingHouseId: string | null = null;
  private selectedFurnitureId: string | null = null;
  private previewHouse: PublicHouse | null = null;
  private decorating = false;
  private decorationGrid = true;
  private pendingFurniture: FurnitureKind | null = null;
  private decorationInvalid: string | null = null;
  private decorationToolbar!: HTMLElement;
  private decorationHistory = new DecorationHistory();
  private drag: { id: string; offsetX: number; offsetY: number; baseHouse: PublicHouse } | null = null;
  private localPosition: Position = { ...WORLD_SPAWN };
  private keys = new Set<string>();
  private raf = 0;
  private lastFrame = 0;
  private lastMoveSent = 0;
  private localNotice: string | null = null;
  private offlineStrokes: BoardStroke[] = [];
  private pendingStrokes: BoardStroke[] = [];
  private hiddenAuthors = new Set<string>();
  private boardDraft: { points: BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number } | null = null;
  private mediaMounts = new Map<string, MediaMount>();
  private lastListsSignature = '';
  private lastLayersSignature = '';

  private shell!: HTMLElement;
  private statusBadge!: HTMLElement;
  private profileName!: HTMLElement;
  private profileColor!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private colorInput!: HTMLInputElement;
  private saveIdentityInput!: HTMLInputElement;
  private saveIdentityButton!: HTMLButtonElement;
  private identityStatus!: HTMLElement;
  private lockOverlay!: HTMLElement;
  private lockMessage!: HTMLElement;
  private unlockToggleButton!: HTMLButtonElement;
  private lockDismissed = false;
  private unlockInput!: HTMLInputElement;
  private phaseText!: HTMLElement;
  private joinInput!: HTMLInputElement;
  private openButton!: HTMLButtonElement;
  private joinButton!: HTMLButtonElement;
  private leaveButton!: HTMLButtonElement;
  private inviteBox!: HTMLElement;
  private inviteValue!: HTMLInputElement;
  private copyInviteButton!: HTMLButtonElement;
  private rotateInviteButton!: HTMLButtonElement;
  private noticeBox!: HTMLElement;
  private headingAction!: HTMLButtonElement;
  private noticeText!: HTMLElement;
  private title!: HTMLElement;
  private subtitle!: HTMLElement;
  private canvasPane!: HTMLElement;
  private stageCanvas!: HTMLCanvasElement;
  private boardPane!: HTMLElement;
  private boardCanvas!: HTMLCanvasElement;
  private boardToolButtons = new Map<BoardUiTool, HTMLButtonElement>();
  private boardTool: BoardUiTool = 'pen';
  private boardWrap!: HTMLElement;
  private boardZoomLabel!: HTMLElement;
  private boardClearButton!: HTMLButtonElement;
  private boardClearArmed = false;
  private boardTextInput: HTMLTextAreaElement | null = null;
  /** Each board keeps its own view, so visiting a friend's board does not move yours. */
  private boardCameras = new Map<string, BoardCamera>();
  private boardPan: { pointerId: number; x: number; y: number } | null = null;
  private boardErasing: number | null = null;
  private boardCursor: BoardPoint | null = null;
  private boardColor!: HTMLInputElement;
  private boardSwatchButtons = new Map<string, HTMLButtonElement>();
  private boardWidth!: HTMLSelectElement;
  private boardStatus!: HTMLElement;
  private boardLayers!: HTMLElement;
  private boardExportMode!: HTMLSelectElement;
  private boardUndoButton!: HTMLButtonElement;
  private boardRedoButton!: HTMLButtonElement;
  private boardNameInput!: HTMLInputElement;
  private boardAccessSelect!: HTMLSelectElement;
  private customBoardId: string | null = null;
  private activeBoardFurnitureId: string | null = null;
  private richBoardTool: 'circle' | 'arrow' | null = null;
  private richBoardDraft: { kind: 'circle' | 'arrow'; start: BoardPoint; current: BoardPoint } | null = null;
  private richToolButtons = new Map<'circle' | 'arrow', HTMLButtonElement>();
  private currentArea: BuiltinAreaId = 'residential';
  private settingsDialog!: HTMLDialogElement;
  private settingsContent!: HTMLElement;
  private villageName = localStorage.getItem('studyvillage-village-name') || 'La aldea';
  private expansion!: WorldExpansionUIController;
  private contactsPane!: HTMLElement;
  private contactsList!: HTMLElement;
  private friendCodeValue!: HTMLElement;
  private importInput!: HTMLInputElement;
  private diagnosticsPane!: HTMLElement;
  private diagnosticList!: HTMLElement;
  private navButtons = new Map<Pane, HTMLButtonElement>();
  private contextTitle!: HTMLElement;
  private contextText!: HTMLElement;
  private housesList!: HTMLElement;
  private peopleList!: HTMLElement;
  private approvalBox!: HTMLElement;
  private approvalList!: HTMLElement;
  private houseEditBox!: HTMLElement;
  private houseNameInput!: HTMLInputElement;
  private houseAccessSelect!: HTMLSelectElement;
  private houseThemeSelect!: HTMLSelectElement;
  private furnitureKindSelect!: HTMLSelectElement;
  private furnitureCount!: HTMLElement;
  private furnitureList!: HTMLElement;
  private furnitureDetail!: HTMLElement;
  private furnitureUseButton!: HTMLButtonElement;
  private furnitureColorInput!: HTMLInputElement;
  private aliasInput!: HTMLInputElement;
  private mediaBox!: HTMLElement;
  private mediaAudience!: HTMLElement;
  private mediaEyebrow!: HTMLElement;
  private privateBox!: HTMLElement;
  private lastPrivateSignature = '';
  /** Requests declined on this screen; the requester can still cancel on theirs. */
  private dismissedPrivate = new Set<string>();
  private mediaStatus!: HTMLElement;
  private mediaError!: HTMLElement;
  private micButton!: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private deafenButton!: HTMLButtonElement;
  private pttButton!: HTMLButtonElement;
  private screenButton!: HTMLButtonElement;
  private stopScreenButton!: HTMLButtonElement;
  private micMeterFill!: HTMLElement;
  private mediaTiles!: HTMLElement;
  private screenTheater!: HTMLElement;
  private screenTheaterGrid!: HTMLElement;
  private screenLayoutMode: 'spotlight' | 'grid' = 'spotlight';
  private spotlightKey: string | null = null;
  private aiBoardPromptInput!: HTMLInputElement;
  private aiBoardBusy = false;
  private boardAdvancedPanel!: HTMLElement;
  private boardAdvancedToggle!: HTMLButtonElement;
  private boardReadOnlyStatus!: HTMLElement;
  private aiSpritePromptInput!: HTMLInputElement;
  private aiSpritePreview!: HTMLImageElement;
  private studyModalOverlay!: HTMLElement;
  private studyModalTopicInput!: HTMLInputElement;
  private studyModalStatus!: HTMLElement;
  private studyFlashcardsWrap!: HTMLElement;
  private studyQuizWrap!: HTMLElement;
  private currentStudyPack: AiBookshelfResponse | null = null;
  private touchControlsRoot!: HTMLElement;
  private touchDpad!: HTMLElement;
  private touchActionBtn!: HTMLButtonElement;
  private touchActionIcon!: HTMLElement;
  private touchActionLabel!: HTMLElement;
  private touchPttBtn!: HTMLButtonElement;
  private touchSprint = false;
  private touchToggleBtn!: HTMLButtonElement;
  private touchControlsForced: boolean | null = null;
  private dpadKeys = new Set<string>();
  private moveTarget: { x: number; y: number } | null = null;
  /** Corners still to walk through after moveTarget, from pathfinding. */
  private movePath: { x: number; y: number }[] = [];
  private activeBoardPointers = new Map<number, { clientX: number; clientY: number }>();
  private lastPinchDistance = 0;
  private heading!: HTMLElement;
  private alerts!: HTMLElement;
  private villageCard!: HTMLElement;
  private phone!: HTMLElement;
  private phoneScreen!: HTMLElement;
  private phoneTitle!: HTMLElement;
  private phoneBack!: HTMLButtonElement;
  private phonePages = new Map<PhonePage, HTMLElement>();
  private phonePage: PhonePage | null = null;
  private phoneButton!: HTMLButtonElement;
  private phoneBadge!: HTMLElement;
  private phoneHouseTile!: HTMLButtonElement;
  private decorateHint!: HTMLElement;
  private hudVoice!: HTMLElement;
  private hudMic!: HTMLButtonElement;
  private hudDeafen!: HTMLButtonElement;
  private hudScreen!: HTMLButtonElement;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  /** A game, the notes or the projects fill the window: the stage takes no input. */
  private activityOpen = false;
  private wardrobe: WardrobePanel;
  /** Walking towards something that was clicked; used on arrival. */
  private pendingInteraction: Interaction | null = null;
  private dragMoved = false;

  constructor(root: HTMLElement, actions: AppActions) {
    this.root = root;
    this.actions = actions;
    this.expansion = new WorldExpansionUIController({
      getView: () => this.view,
      getCurrentArea: () => this.currentArea,
      setCurrentArea: (area: BuiltinAreaId) => this.changeWorldArea(area, WORLD_AREAS[area].defaultSpawn),
      openBoardById: (boardId, title) => {
        this.customBoardId = boardId;
        this.activeBoardFurnitureId = null;
        this.expansion.boardRegistry.ensureBoard(
          boardId,
          title,
          this.currentArea,
          this.view?.identity.fingerprint || 'system',
        );
        this.pane = 'board';
        this.lastLayersSignature = '';
        this.lastBoardRenderSig = '';
        this.notify(`Pizarra abierta: ${title}`);
        this.refresh();
      },
      navigateToPane: (pane) => {
        this.navigate(pane);
      },
      notify: (msg) => this.notify(msg),
      requestStageRedraw: () => {
        this.lastStageRenderSig = '';
      },
      activityChanged: (open) => {
        this.activityOpen = open;
        this.stopMoving();
        if (open) this.closePhone();
      },
      actions,
    });
    this.wardrobe = new WardrobePanel({
      save: look => this.actions.updateAppearance(look),
      closed: () => { this.stopMoving(); this.lastStageRenderSig = ''; this.stageCanvas?.focus(); },
    });
    loadAvatarSheet();
    this.build();
    this.shell.append(this.wardrobe.root);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.raf = requestAnimationFrame(this.tick);
  }

  update(view: AppView): void {
    const justJoined = this.view?.network.phase !== 'JOINED' && view.network.phase === 'JOINED';
    this.view = view;
    if (justJoined && !this.houseOwnerId) this.actions.move({ ...this.localPosition, areaId: this.currentArea });
    this.pendingStrokes = this.pendingStrokes.filter((stroke) => !view.network.strokes.some((received) => received.id === stroke.id));
    const ownMember = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    if (this.waitingHouseId && ownMember?.houseId === this.waitingHouseId) {
      this.houseOwnerId = this.waitingHouseId;
      this.waitingHouseId = null;
      this.localPosition = { ...HOUSE_SPAWN };
      this.pane = 'house';
      this.localNotice = null;
    }
    if (this.waitingHouseId && view.network.error) {
      this.waitingHouseId = null;
      this.localNotice = null;
    }
    if (this.houseOwnerId && this.houseOwnerId !== view.identity.fingerprint
      && (view.network.phase !== 'JOINED' || ownMember?.houseId !== this.houseOwnerId)) {
      this.houseOwnerId = null;
      this.pane = 'world';
      this.localPosition = { ...WORLD_SPAWN };
    }
    if (this.waitingHouseId && view.network.phase !== 'JOINED') this.waitingHouseId = null;
    this.expansion.syncSession();
    this.refresh();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.wardrobe.dispose();
    this.expansion.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    this.activeBoardPointers.clear();
    for (const mount of this.mediaMounts.values()) mount.element.srcObject = null;
    this.mediaMounts.clear();
    this.root.replaceChildren();
  }

  private build(): void {
    this.shell = node('div', 'sv-app');
    this.statusBadge = node('span', 'sv-status-pill', 'Sin sesión');
    this.settingsDialog = node('dialog', 'sv-settings-dialog');
    this.settingsDialog.setAttribute('aria-label', 'Ajustes');
    const settingsHead = node('div', 'sv-inline');
    const settingsTitle = node('h2', '', 'Ajustes');
    const closeSettings = button('Cerrar', 'sv-button');
    closeSettings.addEventListener('click', () => this.settingsDialog.close());
    append(settingsHead, settingsTitle, closeSettings);
    this.settingsContent = node('div', 'sv-stack');
    append(this.settingsDialog, settingsHead, this.settingsContent);

    const main = node('main', 'sv-main');
    const session = node('div', 'sv-phone-section');
    this.buildSidebar(session);
    this.buildMain(main);
    this.buildInspector();
    this.buildPhone(session);
    append(this.shell, main, this.buildHud(), this.phone, this.alerts, this.settingsDialog);
    this.root.replaceChildren(this.shell);

    this.lockOverlay = node('div', 'sv-lock-overlay');
    const lockCard = node('form', 'sv-lock-card');
    append(lockCard, node('div', 'sv-lock-icon', '⌂'), node('h2', '', 'Tu identidad está protegida'),
      node('p', '', 'Introduce tu contraseña para volver a abrirla en este equipo.'));
    this.unlockInput = node('input', 'sv-input');
    this.unlockInput.type = 'password';
    this.unlockInput.autocomplete = 'current-password';
    this.unlockInput.required = true;
    append(lockCard, field('Contraseña', this.unlockInput));
    const unlockButton = button('Desbloquear identidad', 'sv-button sv-button-primary');
    unlockButton.type = 'submit';
    lockCard.append(unlockButton);
    this.lockMessage = node('p', 'sv-error');
    this.lockMessage.setAttribute('role', 'status');
    const stayOffline = button('Continuar sin conexión', 'sv-button sv-button-outline');
    stayOffline.addEventListener('click', () => { this.lockDismissed = true; this.refresh(); });
    append(lockCard, this.lockMessage, stayOffline);
    lockCard.addEventListener('submit', (event) => {
      event.preventDefault();
      const passphrase = this.unlockInput.value;
      this.run(() => this.actions.unlockIdentity(passphrase));
      this.unlockInput.value = '';
    });
    this.lockOverlay.append(lockCard);
    this.shell.append(this.lockOverlay);
    this.buildStudyAiModal();
  }

  /** Profile settings (into Ajustes) and the connect/invite controls (into the phone). */
  private buildSidebar(sessionHost: HTMLElement): void {
    const profileForm = node('form', 'sv-stack sv-profile-form');
    this.nameInput = node('input', 'sv-input');
    this.nameInput.maxLength = 32;
    this.nameInput.required = true;
    this.colorInput = node('input', 'sv-color-input');
    this.colorInput.type = 'color';
    append(profileForm, field('Nombre visible', this.nameInput), field('Color', this.colorInput));
    const saveProfile = button('Guardar perfil', 'sv-button sv-button-small');
    saveProfile.type = 'submit';
    profileForm.append(saveProfile);
    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.run(() => this.actions.updateProfile(this.nameInput.value.trim(), this.colorInput.value));
    });

    // Customizable Avatar & Asset Pack controls
    const customizer = node('details', 'sv-customizer-details');
    const summary = node('summary', 'sv-customizer-summary', 'Personalizar Avatar y Assets');
    const currentAvatar = getAvatarCustomization();
    const hairStyleSelect = select(
      (Object.keys(HAIR_STYLE_LABELS) as HairStyle[]).map((k) => ({ value: k, label: HAIR_STYLE_LABELS[k] })),
    );
    hairStyleSelect.value = currentAvatar.hairStyle;
    hairStyleSelect.addEventListener('change', () => {
      this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), hairStyle: hairStyleSelect.value as HairStyle, useCustomSheet: false }));
    });
    const bodySelect = select(
      (Object.keys(BODY_TYPES) as AvatarAppearance['body'][]).map((k) => ({ value: k, label: BODY_TYPES[k] })),
    );
    bodySelect.value = currentAvatar.body;
    bodySelect.addEventListener('change', () => {
      this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), body: bodySelect.value as AvatarAppearance['body'], useCustomSheet: false }));
    });
    const accessorySelect = select(
      (Object.keys(ACCESSORY_LABELS) as AvatarAccessory[]).map((k) => ({ value: k, label: ACCESSORY_LABELS[k] })),
    );
    accessorySelect.value = currentAvatar.accessory;
    accessorySelect.addEventListener('change', () => {
      const accessory = accessorySelect.value as AvatarAccessory;
      this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), accessory, headwear: accessory === 'hat' ? 'explorer' : 'none', eyewear: accessory === 'glasses' ? 'square' : 'none', useCustomSheet: false }));
    });
    const hairColorInput = node('input', 'sv-color-input');
    hairColorInput.type = 'color';
    hairColorInput.value = currentAvatar.hairColor || HAIR_COLORS[0];
    hairColorInput.addEventListener('change', () => this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), hairColor: hairColorInput.value, useCustomSheet: false })));
    const skinToneSelect = select(
      SKIN_TONES.map((tone, idx) => ({ value: tone, label: `Tono ${idx + 1}` })),
    );
    skinToneSelect.value = currentAvatar.skinTone;
    skinToneSelect.addEventListener('change', () => this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), skinTone: skinToneSelect.value, useCustomSheet: false })));

    const assetGrid = node('div', 'sv-asset-grid');
    append(
      assetGrid,
      field('Cuerpo', bodySelect),
      field('Peinado', hairStyleSelect),
      field('Accesorio', accessorySelect),
      field('Pelo', hairColorInput),
      field('Piel', skinToneSelect),
    );
    const packRow = node('div', 'sv-inline');
    packRow.style.marginTop = '8px';
    const exportPackBtn = button('↓ Pack JSON', 'sv-button sv-button-small');
    exportPackBtn.title = 'Exportar configuración de avatar y muebles modificables';
    exportPackBtn.addEventListener('click', () => {
      const blob = new Blob([exportAssetPackJson('Mi Pack StudyVillage')], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'studyvillage-assets.json';
      a.click();
      URL.revokeObjectURL(url);
      this.notify('Pack de assets exportado.');
    });
    const importPackInput = node('input');
    importPackInput.type = 'file';
    importPackInput.accept = '.json,application/json';
    importPackInput.hidden = true;
    importPackInput.addEventListener('change', () => {
      const file = importPackInput.files?.[0];
      if (!file) return;
      void file.text().then((raw) => {
        const res = importAssetPackJson(raw);
        this.notify(res.message);
        if (res.ok) this.run(() => this.actions.updateAppearance(getAvatarCustomization()));
      });
      importPackInput.value = '';
    });
    const importPackBtn = button('↑ Importar Pack', 'sv-button sv-button-small');
    importPackBtn.addEventListener('click', () => importPackInput.click());
    append(packRow, exportPackBtn, importPackBtn, importPackInput);
    const avatarFile = node('input', 'sv-input');
    avatarFile.type = 'file';
    avatarFile.accept = 'image/png';
    avatarFile.addEventListener('change', () => {
      const file = avatarFile.files?.[0];
      if (!file) return;
      if (file.size > 512 * 1024) { this.notify('El PNG supera 512 KB.'); avatarFile.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { void setAvatarSheet(String(reader.result)).then(() => {
        this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), useCustomSheet: true }));
        this.lastStageRenderSig = ''; this.notify('Cuadrícula de personaje guardada en este equipo.');
      }).catch(error => this.notify(error instanceof Error ? error.message : 'No se pudo cargar el PNG.')); };
      reader.readAsDataURL(file);
    });
    const resetAvatar = button('Restablecer personaje', 'sv-button');
    resetAvatar.addEventListener('click', () => { void setAvatarSheet(null); this.run(() => this.actions.updateAppearance({ ...getAvatarCustomization(), useCustomSheet: false })); avatarFile.value = ''; this.lastStageRenderSig = ''; });
    append(customizer, summary, assetGrid, packRow, field('Cuadrícula PNG del personaje', avatarFile),
      node('p', 'sv-subtle', '3 columnas de animación y 4 filas: abajo, izquierda, derecha, arriba. Se guarda en este equipo.'), resetAvatar);

    const villageNameInput = node('input', 'sv-input');
    villageNameInput.maxLength = 48;
    villageNameInput.value = this.villageName;
    villageNameInput.addEventListener('change', () => {
      this.villageName = villageNameInput.value.trim().slice(0, 48) || 'La aldea';
      villageNameInput.value = this.villageName;
      localStorage.setItem('studyvillage-village-name', this.villageName);
      this.refresh();
    });
    const houseName = node('input', 'sv-input');
    houseName.maxLength = 32;
    this.settingsDialog.addEventListener('close', () => this.keys.clear());
    houseName.addEventListener('change', () => this.patchOwnHouse({ name: houseName.value.trim() || 'Mi casa' }));
    this.settingsDialog.addEventListener('toggle', () => { houseName.value = this.view?.ownHouse.name || ''; });
    append(this.settingsContent, node('h3', '', 'Tu espacio'), field('Nombre del vecindario (en este equipo)', villageNameInput), field('Nombre de tu casa', houseName), profileForm, customizer);

    const session = node('section', 'sv-session-card');
    this.phaseText = node('p', 'sv-subtle', 'Sin sesión');
    session.append(this.phaseText);
    this.openButton = button('Abrir mi aldea a otras personas', 'sv-button sv-button-primary sv-wide');
    this.openButton.addEventListener('click', () => this.run(() => this.actions.openVillage()));
    this.joinInput = node('input', 'sv-input');
    this.joinInput.placeholder = 'Pega una invitación';
    this.joinInput.setAttribute('aria-label', 'Código de invitación');
    const joinForm = node('form', 'sv-join-form');
    this.joinButton = button('Unirme', 'sv-button sv-button-small');
    this.joinButton.type = 'submit';
    append(joinForm, this.joinInput, this.joinButton);
    joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.joinInput.value.trim()) this.run(() => this.actions.joinVillage(this.joinInput.value.trim()));
    });
    this.inviteBox = node('div', 'sv-invite-box');
    this.inviteValue = node('input', 'sv-input sv-code-input');
    this.inviteValue.readOnly = true;
    this.inviteValue.setAttribute('aria-label', 'Invitación actual');
    this.copyInviteButton = button('Copiar', 'sv-button sv-button-small');
    this.copyInviteButton.addEventListener('click', () => this.run(() => this.actions.copyInvite()));
    this.rotateInviteButton = button('Renovar código', 'sv-link-button');
    this.rotateInviteButton.addEventListener('click', () => this.run(() => this.actions.rotateInvite()));
    append(this.inviteBox, node('span', 'sv-field-label', 'Invitación actual'), this.inviteValue,
      this.copyInviteButton, this.rotateInviteButton);
    this.leaveButton = button('Salir de la sesión', 'sv-link-button sv-danger-text');
    this.leaveButton.addEventListener('click', () => {
      if (this.view?.network.isHost && !window.confirm('¿Cerrar el vecindario para todas las personas? Tu casa y tus archivos locales se conservan.')) return;
      this.run(() => this.actions.leave());
    });
    append(session, this.openButton, node('p', 'sv-divider-text', 'o únete a la de alguien'), joinForm, this.inviteBox, this.leaveButton);
    sessionHost.append(session);
  }

  /**
   * The phone: one button opens every app, the way a life-sim handheld does.
   * Nothing else sits around the village, so the world stays the focus.
   */
  private buildPhone(sessionControls: HTMLElement): void {
    this.phone = node('div', 'sv-phone');
    this.phone.hidden = true;
    this.phone.addEventListener('click', (event) => { if (event.target === this.phone) this.closePhone(); });
    this.phoneScreen = node('section', 'sv-phone-screen');
    this.phoneScreen.setAttribute('role', 'dialog');
    this.phoneScreen.setAttribute('aria-label', 'Menú');
    const head = node('header', 'sv-phone-head');
    this.phoneBack = button('', 'sv-phone-icon-btn');
    this.phoneBack.append(monoIcon('back', 14));
    this.phoneBack.setAttribute('aria-label', 'Volver');
    this.phoneBack.addEventListener('click', () => this.openPhone('home'));
    this.phoneTitle = node('h2', 'sv-phone-title', 'Menú');
    const close = button('', 'sv-phone-icon-btn');
    close.append(monoIcon('close', 12));
    close.setAttribute('aria-label', 'Cerrar menú');
    close.addEventListener('click', () => this.closePhone());
    append(head, this.phoneBack, this.phoneTitle, close);

    const home = node('div', 'sv-phone-page sv-phone-home');
    const me = node('div', 'sv-phone-me');
    this.profileColor = node('div', 'sv-profile-avatar');
    this.profileName = node('strong', '', 'Tu nombre');
    const meText = node('div');
    append(meText, this.profileName, this.statusBadge);
    append(me, this.profileColor, meText);
    const grid = node('div', 'sv-app-grid');
    const tile = (label: string, iconName: string, hue: string, onClick: () => void, testid?: string) => {
      const item = button('', 'sv-app-tile');
      item.style.setProperty('--tile', hue);
      const face = node('span', 'sv-app-icon');
      face.append(monoIcon(iconName, 26));
      append(item, face, node('span', 'sv-app-label', label));
      if (testid) item.dataset.testid = testid;
      item.addEventListener('click', onClick);
      grid.append(item);
      return item;
    };
    this.phoneHouseTile = tile('Mi casa', 'house', '#e8894f', () => {
      this.closePhone();
      if (this.pane === 'house' && this.houseOwnerId === this.view?.identity.fingerprint) this.leaveCurrentHouse();
      else this.enterOwnHouse();
    }, 'phone-house');
    tile('Aldea', 'world', '#5fa36b', () => this.openPhone('village'), 'phone-village');
    tile('Voz', 'mic', '#d9667f', () => this.openPhone('voice'), 'phone-voice');
    tile('Proyectos', 'code', '#4c7fd1', () => { this.closePhone(); this.expansion.openActivity('projects'); }, 'phone-projects');
    tile('Apuntes', 'notes', '#d9a640', () => { this.closePhone(); this.expansion.openActivity('notes'); }, 'phone-notes');
    tile('Tarjetas', 'cards', '#8c6bc4', () => { this.closePhone(); this.openStudyAiModal(); }, 'phone-cards');
    tile('Decorar', 'brush', '#3fa3a0', () => {
      if (this.houseOwnerId !== this.view?.identity.fingerprint || this.pane !== 'house') this.enterOwnHouse();
      this.openPhone('decorate');
    }, 'phone-decorate');
    tile('Contactos', 'contacts', '#c9654f', () => this.openPhone('contacts'), 'phone-contacts');
    tile('Ajustes', 'gear', '#7c8a7a', () => { this.closePhone(); this.settingsDialog.showModal(); }, 'phone-settings');
    append(home, me, grid);

    const village = node('div', 'sv-phone-page');
    append(village, sessionControls, this.villageCard);
    const voice = node('div', 'sv-phone-page');
    voice.append(this.mediaBox);
    const decorate = node('div', 'sv-phone-page');
    this.decorateHint = node('p', 'sv-subtle', 'Entra en tu casa para decorarla.');
    append(decorate, this.decorateHint, this.houseEditBox);
    const contacts = node('div', 'sv-phone-page');
    contacts.append(this.contactsPane);
    this.phonePages = new Map<PhonePage, HTMLElement>([['home', home], ['village', village], ['voice', voice], ['decorate', decorate], ['contacts', contacts]]);
    append(this.phoneScreen, head, ...this.phonePages.values());
    this.phone.append(this.phoneScreen);
  }

  private openPhone(page: PhonePage = 'home'): void {
    const titles: Record<PhonePage, string> = { home: 'Menú', village: 'Aldea', voice: 'Voz y pantalla', decorate: 'Decorar mi casa', contacts: 'Contactos' };
    this.expansion.closeModal();
    this.phonePage = page;
    this.phone.hidden = false;
    this.phone.dataset.page = page;
    this.stopMoving();
    setText(this.phoneTitle, titles[page]);
    show(this.phoneBack, page !== 'home');
    for (const [key, el] of this.phonePages) show(el, key === page);
    this.refresh();
  }

  private closePhone(): void {
    if (this.phone.hidden) return;
    this.phone.hidden = true;
    this.phonePage = null;
    // Hand the keyboard back to the world (not to the Menú button, where Space would reopen it).
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && (this.phone.contains(focused) || focused === this.phoneButton)) focused.blur();
  }

  private stopMoving(): void {
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    this.movePath = [];
    this.pendingInteraction = null;
  }

  /** Corners only: where you are, who is here, your voice, and the phone. */
  private buildHud(): HTMLElement {
    const hud = node('div', 'sv-hud');
    const topLeft = node('div', 'sv-hud-place');
    topLeft.append(this.heading);
    // Requests to come in sit above everything, even an open phone.
    this.alerts = node('div', 'sv-hud-top-right');
    this.approvalBox.classList.add('sv-hud-card');
    this.alerts.append(this.approvalBox);
    this.noticeBox.classList.add('sv-hud-toast');

    this.hudVoice = node('div', 'sv-hud-voice');
    this.hudVoice.setAttribute('role', 'group');
    this.hudVoice.setAttribute('aria-label', 'Voz rápida');
    const quick = (iconName: string, label: string, onClick: () => void) => {
      const item = button('', 'sv-hud-round');
      item.append(monoIcon(iconName, 18));
      item.setAttribute('aria-label', label);
      item.title = label;
      item.addEventListener('click', onClick);
      this.hudVoice.append(item);
      return item;
    };
    this.hudMic = quick('micOff', 'Micrófono', () => {
      const media = this.view?.network.media;
      if (!media) return;
      if (!media.micEnabled) this.run(() => this.actions.toggleMicrophone());
      else this.actions.setMuted(!media.muted);
    });
    this.hudDeafen = quick('headphones', 'Dejar de escuchar', () => { if (this.view) this.actions.setDeafened(!this.view.network.media.deafened); });
    this.hudScreen = quick('screen', 'Compartir pantalla', () => {
      const phase = this.view?.network.media.screenPhase;
      if (phase && ['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(phase)) this.actions.stopScreen();
      else this.run(() => this.actions.startScreen());
    });

    this.phoneButton = button('', 'sv-phone-button');
    this.phoneButton.dataset.testid = 'phone-button';
    this.phoneButton.setAttribute('aria-label', 'Abrir menú (M)');
    this.phoneButton.title = 'Menú (M)';
    this.phoneBadge = node('span', 'sv-phone-badge');
    this.phoneBadge.hidden = true;
    append(this.phoneButton, monoIcon('phone', 24), node('span', 'sv-phone-button-label', 'Menú'), this.phoneBadge);
    this.phoneButton.addEventListener('click', () => (this.phone.hidden ? this.openPhone('home') : this.closePhone()));
    append(hud, topLeft, this.noticeBox, this.hudVoice, this.phoneButton);
    return hud;
  }

  private refreshHud(): void {
    const view = this.view!;
    const media = view.network.media;
    const joined = view.network.phase === 'JOINED';
    const here = view.network.members.filter((member) => member.connected).length;
    setText(this.statusBadge, joined ? `${here} ${here === 1 ? 'persona' : 'personas'} en la aldea` : PHASE_LABEL[view.network.phase]);
    const requests = (view.network.isHost ? view.network.pendingJoins.length : 0)
      + view.network.pendingVisits.filter((request) => request.houseId === view.identity.fingerprint).length;
    show(this.phoneBadge, requests > 0);
    setText(this.phoneBadge, String(requests));
    const inOwnHouse = this.pane === 'house' && this.houseOwnerId === view.identity.fingerprint;
    setText(this.phoneHouseTile.querySelector('.sv-app-label')!, inOwnHouse ? 'Salir' : 'Mi casa');
    show(this.hudVoice, joined && (this.pane === 'world' || this.pane === 'house'));
    const micLive = media.micEnabled && !media.muted;
    this.hudMic.replaceChildren(monoIcon(micLive ? 'mic' : 'micOff', 18));
    this.hudMic.classList.toggle('is-on', micLive);
    this.hudMic.title = !media.micEnabled ? 'Activar micrófono' : media.muted ? 'Quitar silencio' : 'Silenciar';
    this.hudMic.setAttribute('aria-pressed', String(micLive));
    this.hudDeafen.classList.toggle('is-off', media.deafened);
    this.hudDeafen.setAttribute('aria-pressed', String(media.deafened));
    const sharing = ['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(media.screenPhase);
    this.hudScreen.classList.toggle('is-on', sharing);
    this.hudScreen.title = sharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla';
    show(this.decorateHint, !inOwnHouse);
  }

  private buildMain(main: HTMLElement): void {
    this.noticeBox = node('div', 'sv-notice');
    this.noticeText = node('span');
    const closeNotice = button('×', 'sv-icon-button');
    closeNotice.setAttribute('aria-label', 'Cerrar aviso');
    closeNotice.addEventListener('click', () => {
      this.localNotice = null;
      this.actions.dismissNotice();
      this.refresh();
    });
    append(this.noticeBox, this.noticeText, closeNotice);
    const heading = node('div', 'sv-page-heading');
    const headingCopy = node('div');
    this.title = node('h1', '', 'La aldea');
    this.subtitle = node('p', 'sv-subtle', 'Un espacio tranquilo para estudiar a tu ritmo.');
    append(headingCopy, this.title, this.subtitle);
    // Context action: from the board it returns to the room you were in, so
    // opening the board never strands you outside a friend's house.
    this.headingAction = button('', 'sv-hud-back');
    this.headingAction.addEventListener('click', () => {
      if (this.pane === 'board' && this.houseOwnerId) this.returnToRoom();
      else if (this.pane === 'board') this.navigate('world');
      else this.leaveCurrentHouse();
    });
    append(heading, this.headingAction, headingCopy);
    this.heading = heading;

    // Expandable Screen-Share Theater Dock
    this.screenTheater = node('section', 'sv-screen-theater');
    this.screenTheater.hidden = true;
    const theaterHead = node('div', 'sv-screen-theater-head');
    const theaterTitle = node('div', 'sv-screen-theater-title');
    append(theaterTitle, node('span', 'sv-private-dot'), node('span', '', 'Escenario de pantalla compartida · Alta definición'));
    const theaterControls = node('div', 'sv-inline');
    const layoutToggle = button('Vista: Destacada', 'sv-button sv-button-small');
    layoutToggle.addEventListener('click', () => {
      this.screenLayoutMode = this.screenLayoutMode === 'spotlight' ? 'grid' : 'spotlight';
      setText(layoutToggle, this.screenLayoutMode === 'spotlight' ? 'Vista: Destacada' : 'Vista: Cuadrícula');
      this.screenTheaterGrid.classList.toggle('is-spotlight', this.screenLayoutMode === 'spotlight');
    });
    const stopTheaterBtn = button('Detener emisión', 'sv-button sv-button-small sv-danger-text');
    stopTheaterBtn.addEventListener('click', () => this.actions.stopScreen());
    append(theaterControls, layoutToggle, stopTheaterBtn);
    append(theaterHead, theaterTitle, theaterControls);
    this.screenTheaterGrid = node('div', 'sv-screen-theater-grid is-spotlight');
    append(this.screenTheater, theaterHead, this.screenTheaterGrid);

    this.canvasPane = node('section', 'sv-stage-pane');
    const stageWrap = node('div', 'sv-canvas-wrap');
    this.stageCanvas = node('canvas', 'sv-canvas');
    // 2x HiDPI physical bitmap (1536x864) over logical 768x432 coordinates for crisp rendering
    this.stageCanvas.width = 1536;
    this.stageCanvas.height = 864;
    this.stageCanvas.setAttribute('aria-label', 'Aldea interactiva');
    this.stageCanvas.tabIndex = 0;
    this.stageCanvas.addEventListener('pointerdown', this.onStagePointerDown);
    this.stageCanvas.addEventListener('pointermove', this.onStagePointerMove);
    this.stageCanvas.addEventListener('pointerup', this.onStagePointerUp);
    this.stageCanvas.addEventListener('pointercancel', this.onStagePointerUp);
    append(stageWrap, this.stageCanvas);
    this.buildTouchControls(stageWrap);
    append(this.canvasPane, stageWrap);
    this.expansion.mountStageControls(this.settingsContent, this.shell);

    this.buildBoard();
    this.buildContacts();
    this.buildDiagnostics();
    append(main, this.screenTheater, this.canvasPane, this.boardPane, this.diagnosticsPane);
  }

  private buildBoard(): void {
    this.boardPane = node('section', 'sv-panel sv-board-pane');
    const toolbar = node('div', 'sv-toolbar sv-board-primary');
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Herramientas de pizarra');
    const tools = node('div', 'sv-segment');
    const extraTools = node('div', 'sv-segment sv-board-extra-tools');
    this.boardAdvancedPanel = node('section', 'sv-board-options-panel');
    this.boardAdvancedPanel.id = 'board-advanced-options';
    this.boardAdvancedPanel.setAttribute('aria-label', 'Opciones avanzadas de pizarra');
    this.boardAdvancedPanel.hidden = true;
    this.boardAdvancedToggle = button('Más', 'sv-button sv-button-small sv-board-more');
    this.boardAdvancedToggle.setAttribute('aria-label', 'Opciones avanzadas');
    this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
    this.boardAdvancedToggle.setAttribute('aria-controls', this.boardAdvancedPanel.id);
    this.boardAdvancedToggle.addEventListener('click', () => {
      this.commitBoardText();
      this.boardAdvancedPanel.hidden = !this.boardAdvancedPanel.hidden;
      this.boardAdvancedToggle.setAttribute('aria-expanded', String(!this.boardAdvancedPanel.hidden));
    });
    const labels: [BoardUiTool, string, string][] = [
      ['pen', 'Lápiz', 'Dibujo libre'], ['text', 'Texto', 'Texto y fórmulas: escribe $x^2$ para LaTeX'],
      ['eraser', 'Borrador', 'Borra tus propios trazos pasando por encima'], ['hand', 'Mano', 'Mover la vista (también: botón central o rueda)'],
      ['line', 'Línea', 'Línea recta'], ['rectangle', 'Rectángulo', 'Rectángulo'],
    ];
    for (const [tool, label, hint] of labels) {
      const item = button(label, 'sv-segment-button');
      item.title = hint;
      item.addEventListener('click', () => {
        this.commitBoardText();
        this.richBoardTool = null;
        this.boardTool = tool;
        this.refreshBoardControls();
      });
      this.boardToolButtons.set(tool, item);
      (MAIN_BOARD_TOOLS.includes(tool) ? tools : extraTools).append(item);
    }
    const richLabels: ['circle' | 'arrow', string, string][] = [
      ['circle', 'Círculo', 'Dibuja un círculo en la pizarra'],
      ['arrow', 'Flecha', 'Dibuja una flecha direccional en la pizarra'],
    ];
    for (const [rTool, rLabel, rHint] of richLabels) {
      const item = button(rLabel, 'sv-segment-button');
      item.title = rHint;
      item.dataset.testid = `board-tool-${rTool}`;
      item.addEventListener('click', () => {
        this.commitBoardText();
        this.richBoardTool = rTool;
        this.refreshBoardControls();
      });
      this.richToolButtons.set(rTool, item);
      extraTools.append(item);
    }
    this.boardNameInput = node('input', 'sv-input');
    this.boardNameInput.maxLength = 40;
    this.boardNameInput.placeholder = 'Nombre de esta pizarra…';
    this.boardNameInput.style.maxWidth = '175px';
    this.boardNameInput.setAttribute('aria-label', 'Nombre de esta pizarra');
    this.boardNameInput.dataset.testid = 'board-rename-input';
    this.boardNameInput.addEventListener('change', () => {
      const view = this.view;
      if (!view) return;
      const bId = this.boardId();
      const newName = this.boardNameInput.value.trim().slice(0, 40) || 'Pizarra';
      this.expansion.boardRegistry.ensureBoard(
        bId,
        newName,
        this.customBoardId ? this.currentArea : 'house',
        this.houseOwnerId || view.identity.fingerprint,
      );
      this.expansion.boardRegistry.renameBoard(
        bId,
        newName,
        view.identity.fingerprint,
        view.network.isHost,
      );
      if (!this.customBoardId && (!this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint)) {
        const fId = this.activeBoardFurnitureId || 'board';
        const updated = setFurnitureAlias(view.ownHouse, fId, newName, view.identity.fingerprint);
        if (updated !== view.ownHouse) this.actions.updateOwnHouse(updated);
      }
      this.notify(`Pizarra renombrada a «${newName}».`);
      this.refreshBoardControls();
    });

    this.boardAccessSelect = select([
      { value: 'public_edit', label: '🔓 Edición compartida' },
      { value: 'view_only', label: '👁️ Solo lectura' },
      { value: 'owner_only', label: '🔒 Solo propietario' },
    ]);
    this.boardAccessSelect.setAttribute('aria-label', 'Permisos de esta pizarra');
    this.boardAccessSelect.dataset.testid = 'board-access-select';
    this.boardAccessSelect.addEventListener('change', () => {
      const view = this.view;
      if (!view) return;
      const bId = this.boardId();
      this.expansion.boardRegistry.setAccessLevel(
        bId,
        this.boardAccessSelect.value as BoardAccessLevel,
        view.identity.fingerprint,
        view.network.isHost,
      );
      this.refreshBoardControls();
    });
    this.boardColor = node('input', 'sv-color-input');
    this.boardColor.type = 'color';
    this.boardColor.value = '#1d1d1f';
    this.boardColor.setAttribute('aria-label', 'Color del trazo');
    this.boardColor.addEventListener('input', () => this.refreshBoardSwatches());
    const swatchRow = node('div', 'sv-swatch-row');
    for (const hex of BOARD_COLORS) {
      const swatch = button('', 'sv-color-swatch');
      swatch.style.backgroundColor = hex;
      swatch.title = `Color ${hex}`;
      swatch.setAttribute('aria-label', `Color ${hex}`);
      swatch.addEventListener('click', () => {
        this.boardColor.value = hex;
        this.refreshBoardSwatches();
      });
      this.boardSwatchButtons.set(hex.toLowerCase(), swatch);
      swatchRow.append(swatch);
    }
    this.refreshBoardSwatches();

    this.boardWidth = select([{ value: '2', label: 'Fino' }, { value: '4', label: 'Medio' }, { value: '8', label: 'Grueso' }]);
    this.boardWidth.setAttribute('aria-label', 'Grosor del trazo');
    this.boardUndoButton = button('↶', 'sv-button sv-button-small');
    this.boardUndoButton.setAttribute('aria-label', '↶ Deshacer');
    this.boardUndoButton.title = 'Deshacer';
    this.boardUndoButton.addEventListener('click', () => this.undoStroke());
    this.boardRedoButton = button('↷ Rehacer', 'sv-button sv-button-small');
    this.boardRedoButton.dataset.testid = 'board-redo-btn';
    this.boardRedoButton.addEventListener('click', () => this.redoStroke());
    // Two-step clear instead of a confirm() dialog, which would block the app.
    this.boardClearButton = button('Borrar lo mío', 'sv-button sv-button-small');
    this.boardClearButton.addEventListener('click', () => {
      if (!this.boardClearArmed) {
        this.boardClearArmed = true;
        this.refreshBoardControls();
        setTimeout(() => { this.boardClearArmed = false; this.refreshBoardControls(); }, 3_000);
        return;
      }
      this.boardClearArmed = false;
      this.clearOwnStrokes();
    });
    const zoom = node('div', 'sv-zoom');
    const zoomOut = button('−', 'sv-button sv-button-small');
    zoomOut.setAttribute('aria-label', 'Alejar');
    zoomOut.addEventListener('click', () => this.zoomBoard(1 / 1.25));
    this.boardZoomLabel = node('span', 'sv-zoom-label', '100%');
    const zoomIn = button('+', 'sv-button sv-button-small');
    zoomIn.setAttribute('aria-label', 'Acercar');
    zoomIn.addEventListener('click', () => this.zoomBoard(1.25));
    const fit = button('Centrar', 'sv-button sv-button-small');
    fit.title = 'Encuadrar todo lo dibujado';
    fit.addEventListener('click', () => this.fitBoard());
    append(zoom, zoomOut, this.boardZoomLabel, zoomIn, fit);
    append(toolbar, tools, this.boardColor, this.boardUndoButton, this.boardAdvancedToggle);
    // Quick LaTeX & Gemini Study Canvas Bar
    const latexBar = node('div', 'sv-latex-bar');
    append(latexBar, node('span', 'sv-field-label', 'Inserción rápida LaTeX y estudio:'));
    const quickFormulas: [string, string][] = [
      ['+ Nota de texto', 'Apunte de estudio'],
      ['f(x) = x²', '$f(x) = x^2 + 2x + 1$'],
      ['Fracción a/b', '$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'],
      ['Integral ∫', '$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$'],
      ['Sumatorio ∑', '$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$'],
      ['Raíz √', '$\\sqrt{a^2 + b^2}$'],
      ['Matriz / Sistema', '$\\alpha + \\beta = \\gamma$'],
    ];
    for (const [label, formula] of quickFormulas) {
      const chip = button(label, 'sv-latex-chip');
      chip.addEventListener('click', () => this.insertBoardFormula(formula));
      latexBar.append(chip);
    }
    const axesChip = button('⊞ Ejes XY', 'sv-latex-chip');
    axesChip.title = 'Dibujar ejes de coordenadas en el centro de la vista';
    axesChip.addEventListener('click', () => this.insertCoordinateAxes());
    latexBar.append(axesChip);

    // Item 1: Multimodal AI Whiteboard Assistant ("Pizarra Inteligente")
    const aiBoardBar = node('div', 'sv-ai-board-bar');
    const aiBoardLabel = node('span', 'sv-field-label', '✨ IA en Pizarra:');
    this.aiBoardPromptInput = node('input', 'sv-input sv-ai-board-input');
    this.aiBoardPromptInput.placeholder = 'Tema, ecuación o duda (ej. ecuación cuadrática, integral)…';
    this.aiBoardPromptInput.maxLength = 160;
    this.aiBoardPromptInput.setAttribute('aria-label', 'Consulta para IA en pizarra');
    this.aiBoardPromptInput.dataset.testid = 'ai-board-prompt';
    const aiLatexBtn = button('✨ Pasar a LaTeX', 'sv-button sv-button-small sv-button-primary');
    aiLatexBtn.dataset.testid = 'ai-board-latex-btn';
    aiLatexBtn.title = 'Convierte los trazos o apuntes de la pizarra en una fórmula LaTeX limpia y la publica en la pizarra';
    aiLatexBtn.addEventListener('click', () => this.runBoardAiLatex());
    const aiTutorStepsBtn = button('✨ Explicar paso a paso', 'sv-button sv-button-small');
    aiTutorStepsBtn.dataset.testid = 'ai-board-tutor-btn';
    aiTutorStepsBtn.title = 'Analiza la pizarra y añade notas adhesivas con la explicación paso a paso sin borrar tu capa';
    aiTutorStepsBtn.addEventListener('click', () => this.runBoardAiTutor('steps'));
    const aiTutorHintBtn = button('💡 Dar pista', 'sv-button sv-button-small');
    aiTutorHintBtn.dataset.testid = 'ai-board-hint-btn';
    aiTutorHintBtn.title = 'Inserta una pista socrática en la pizarra';
    aiTutorHintBtn.addEventListener('click', () => this.runBoardAiTutor('hint'));
    append(aiBoardBar, aiBoardLabel, this.aiBoardPromptInput, aiLatexBtn, aiTutorStepsBtn, aiTutorHintBtn);

    const wrap = node('div', 'sv-canvas-wrap sv-board-wrap');
    this.boardWrap = wrap;
    this.boardCanvas = node('canvas', 'sv-canvas');
    // 2x HiDPI resolution (1536x864) for crisp strokes, text, and LaTeX formulas
    this.boardCanvas.width = 1536;
    this.boardCanvas.height = 864;
    this.boardCanvas.setAttribute('aria-label', 'Pizarra para dibujar');
    this.boardCanvas.addEventListener('pointerdown', this.onBoardPointerDown);
    this.boardCanvas.addEventListener('pointermove', this.onBoardPointerMove);
    this.boardCanvas.addEventListener('pointerup', this.onBoardPointerUp);
    this.boardCanvas.addEventListener('pointercancel', this.onBoardPointerUp);
    this.boardCanvas.addEventListener('pointerleave', () => { this.boardCursor = null; });
    this.boardCanvas.addEventListener('wheel', this.onBoardWheel, { passive: false });
    this.boardCanvas.addEventListener('auxclick', (event) => event.preventDefault());
    wrap.append(this.boardCanvas);
    const bottom = node('div', 'sv-board-bottom');
    this.boardStatus = node('p', 'sv-subtle');
    const exportGroup = node('div', 'sv-inline');
    this.boardExportMode = select([
      { value: 'all', label: 'Todas las capas' }, { value: 'visible', label: 'Capas visibles' },
    ]);
    this.boardExportMode.setAttribute('aria-label', 'Capas que se exportarán');
    const exportButton = button('↓ Exportar PNG', 'sv-button sv-button-small');
    exportButton.addEventListener('click', () => this.exportBoard());
    append(exportGroup, this.boardExportMode, exportButton);
    append(bottom, this.boardStatus);
    this.boardLayers = node('div', 'sv-layers');
    const hint = node('p', 'sv-tiny sv-board-hint',
      'Rueda: desplazar · Ctrl + rueda: zoom · Texto: haz clic en cualquier punto o usa los botones LaTeX ($\\frac{a}{b}$) · Borrador: arrastra sobre tus trazos.');
    const category = (title: string, ...children: HTMLElement[]): HTMLDetailsElement => {
      const group = node('details', 'sv-board-option-group sv-board-category');
      group.name = 'board-options-category';
      const summary = node('summary', '', title);
      const content = node('div', 'sv-board-category-content');
      append(content, ...children);
      append(group, summary, content);
      return group;
    };
    append(this.boardAdvancedPanel,
      category('Formas', extraTools),
      category('Trazo y edición', swatchRow, field('Grosor', this.boardWidth), this.boardRedoButton, this.boardClearButton),
      category('Vista', zoom, hint),
      category('Fórmulas', latexBar),
      category('Asistente IA', aiBoardBar),
      category('Capas', this.boardLayers, bottom),
      category('Pizarra y archivo', field('Nombre', this.boardNameInput), field('Permisos', this.boardAccessSelect), exportGroup),
    );
    this.boardReadOnlyStatus = node('p', 'sv-board-readonly');
    this.boardReadOnlyStatus.setAttribute('role', 'status');
    this.boardReadOnlyStatus.hidden = true;
    append(this.boardPane, toolbar, this.boardAdvancedPanel, this.boardReadOnlyStatus, wrap);
  }

  private buildContacts(): void {
    this.contactsPane = node('section', 'sv-panel');
    const intro = node('div', 'sv-panel-intro');
    append(intro, node('div', 'sv-eyebrow', 'TU AGENDA'), node('h2', '', 'Personas de confianza'),
      node('p', 'sv-subtle', 'Comparte tu tarjeta pública o añade contactos desde un archivo. Tu clave privada nunca aparece en la tarjeta.'));
    const codeCard = node('div', 'sv-contact-code');
    append(codeCard, node('span', 'sv-field-label', 'MI CÓDIGO DE AMISTAD'));
    this.friendCodeValue = node('strong', 'sv-friend-code');
    codeCard.append(this.friendCodeValue);
    const codeButtons = node('div', 'sv-inline');
    const exportButton = button('↓ Exportar mi tarjeta', 'sv-button sv-button-primary');
    exportButton.addEventListener('click', () => this.run(() => this.actions.exportContact()));
    const rotateButton = button('Renovar código', 'sv-button sv-button-outline');
    rotateButton.addEventListener('click', () => this.run(() => this.actions.rotateFriendCode()));
    append(codeButtons, exportButton, rotateButton);
    codeCard.append(codeButtons);
    const importCard = node('div', 'sv-contact-import');
    append(importCard, node('h3', '', 'Añadir contacto'), node('p', 'sv-subtle', 'Selecciona una tarjeta .json que te haya enviado esa persona.'));
    this.importInput = node('input', 'sv-file-input');
    this.importInput.type = 'file';
    this.importInput.accept = '.json,application/json';
    this.importInput.setAttribute('aria-label', 'Importar contacto');
    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];
      if (file) this.run(() => this.actions.importContact(file));
      this.importInput.value = '';
    });
    importCard.append(this.importInput);
    this.contactsList = node('div', 'sv-contact-list');
    append(this.contactsPane, intro, codeCard, importCard, node('h3', 'sv-section-title', 'Contactos guardados'), this.contactsList);
  }

  private buildDiagnostics(): void {
    this.diagnosticsPane = node('section', 'sv-panel');
    append(this.diagnosticsPane, node('div', 'sv-eyebrow', 'COMPROBACIONES LOCALES'),
      node('h2', '', 'Diagnóstico'),
      node('p', 'sv-subtle', 'Estas pruebas muestran lo que se ha observado en este equipo. Las pruebas no verificadas siguen marcadas como tales.'));
    const controls = node('div', 'sv-diagnostic-controls');
    const items: [DiagnosticKind, string][] = [
      ['capabilities', 'Capacidades'], ['microphone', 'Micrófono'], ['screen', 'Pantalla'],
      ['stop', 'Detener captura'], ['loopback', 'Bucle local'],
    ];
    for (const [kind, label] of items) {
      const item = button(label, 'sv-button sv-button-outline');
      item.addEventListener('click', () => this.run(() => this.actions.runDiagnostic(kind)));
      controls.append(item);
    }
    this.diagnosticList = node('div', 'sv-diagnostic-list');
    const standalone = node('a', 'sv-link-button', 'Abrir diagnóstico con vista previa y exportación ↗');
    standalone.href = '?diagnostic=1';
    append(this.diagnosticsPane, controls, standalone, this.diagnosticList);
  }

  private buildInspector(): void {
    const context = node('section', 'sv-context-card');
    this.contextTitle = node('h3');
    this.contextText = node('p', 'sv-subtle');
    append(context, this.contextTitle, this.contextText);
    this.housesList = node('div', 'sv-house-list');
    this.peopleList = node('div', 'sv-people-list');
    append(context, this.housesList, this.peopleList);

    this.approvalBox = node('section', 'sv-approval-card');
    this.approvalBox.setAttribute('role', 'status');
    append(this.approvalBox, node('strong', 'sv-approval-title', 'Llaman a la puerta'));
    this.approvalList = node('div', 'sv-approval-list');
    this.approvalBox.append(this.approvalList);

    this.buildHouseEditor();
    this.buildMedia();
    const identityCard = node('section', 'sv-stack');
    append(identityCard, node('h3', '', 'Identidad protegida'));
    this.unlockToggleButton = button('Desbloquear identidad', 'sv-button sv-button-small');
    this.unlockToggleButton.addEventListener('click', () => { this.lockDismissed = false; this.refresh(); this.unlockInput.focus(); });
    identityCard.append(this.unlockToggleButton);
    this.identityStatus = node('p', 'sv-subtle');
    identityCard.append(this.identityStatus);
    const saveForm = node('form', 'sv-stack');
    this.saveIdentityInput = node('input', 'sv-input');
    this.saveIdentityInput.type = 'password';
    this.saveIdentityInput.autocomplete = 'new-password';
    this.saveIdentityInput.minLength = 12;
    this.saveIdentityInput.required = true;
    this.saveIdentityButton = button('Cifrar y guardar', 'sv-button sv-button-small');
    this.saveIdentityButton.type = 'submit';
    append(saveForm, field('Contraseña (12+ caracteres)', this.saveIdentityInput), this.saveIdentityButton);
    saveForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const passphrase = this.saveIdentityInput.value;
      this.run(() => this.actions.saveIdentity(passphrase));
      this.saveIdentityInput.value = '';
    });
    identityCard.append(saveForm);
    this.villageCard = context;
    const diagnostics = node('a', 'sv-link-button', 'Diagnóstico de micrófono y pantalla');
    diagnostics.href = '?diagnostic=1';
    append(this.settingsContent, identityCard, node('h3', '', 'Ayuda'), diagnostics);
  }

  private buildHouseEditor(): void {
    this.houseEditBox = node('section', 'sv-house-editor');
    this.houseNameInput = node('input', 'sv-input');
    this.houseNameInput.maxLength = 32;
    this.houseNameInput.addEventListener('change', () => this.patchOwnHouse({ name: this.houseNameInput.value.trim().slice(0, 32) || 'Mi casa' }));
    this.houseAccessSelect = select([
      { value: 'open', label: 'Puerta abierta' }, { value: 'ask', label: 'Pedir permiso' }, { value: 'locked', label: 'Cerrada' },
    ]);
    this.houseAccessSelect.addEventListener('change', () => this.patchOwnHouse({ access: this.houseAccessSelect.value as PublicHouse['access'] }));
    this.houseThemeSelect = select([{ value: 'mint', label: 'Menta' }, { value: 'peach', label: 'Melocotón' }]);
    this.houseThemeSelect.addEventListener('change', () => this.patchOwnHouse({ theme: this.houseThemeSelect.value as PublicHouse['theme'] }));
    append(this.houseEditBox, field('Nombre público', this.houseNameInput), field('Acceso', this.houseAccessSelect), field('Ambiente', this.houseThemeSelect));
    const furnitureHeader = node('div', 'sv-list-heading');
    this.furnitureCount = node('span', 'sv-tiny');
    append(furnitureHeader, node('strong', '', 'Muebles'), this.furnitureCount);
    this.furnitureList = node('div', 'sv-furniture-list');
    this.furnitureKindSelect = select(FURNITURE_KINDS.map((kind) => ({ value: kind, label: FURNITURE_LABELS[kind] })));
    const addButton = button('+ Añadir', 'sv-button sv-button-small');
    addButton.addEventListener('click', () => {
      const view = this.view;
      if (!view) return;
      const house = addFurniture(view.ownHouse, this.furnitureKindSelect.value as FurnitureKind, view.identity.fingerprint, crypto.randomUUID());
      if (house === view.ownHouse) this.notify('La casa ya tiene el máximo de 32 muebles.');
      else { this.selectedFurnitureId = house.furniture[house.furniture.length - 1].id; this.commitDecoration(house, this.selectedFurnitureId); }
    });
    const addRow = node('div', 'sv-inline');
    append(addRow, this.furnitureKindSelect, addButton);
    this.furnitureDetail = node('div', 'sv-furniture-detail');
    this.furnitureUseButton = button('⚡ Usar mueble (E)', 'sv-button sv-button-small sv-button-primary sv-wide');
    this.furnitureUseButton.style.marginBottom = '8px';
    this.furnitureUseButton.addEventListener('click', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const item = view.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId);
      if (item) this.interactWithFurniture(item);
    });
    this.aliasInput = node('input', 'sv-input');
    this.aliasInput.maxLength = 40;
    this.aliasInput.placeholder = 'Nombre público opcional';
    this.aliasInput.addEventListener('change', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const item = view.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId);
      const updated = setFurnitureAlias(view.ownHouse, this.selectedFurnitureId, this.aliasInput.value, view.identity.fingerprint);
      if (updated !== view.ownHouse) this.actions.updateOwnHouse(updated);
      if (item && item.kind === 'board') {
        const bId = houseBoardId('own', item.id);
        this.expansion.boardRegistry.ensureBoard(bId, this.aliasInput.value.trim() || 'Pizarra de estudio', 'house', view.identity.fingerprint);
        this.expansion.boardRegistry.renameBoard(bId, this.aliasInput.value.trim() || 'Pizarra de estudio', view.identity.fingerprint, true);
      }
    });

    // Custom furniture color & sprite upload
    const customRow = node('div', 'sv-furniture-actions');
    this.furnitureColorInput = node('input', 'sv-color-input');
    this.furnitureColorInput.type = 'color';
    this.furnitureColorInput.value = '#a67b51';
    this.furnitureColorInput.title = 'Cambiar color de este tipo de mueble';
    this.furnitureColorInput.addEventListener('input', () => {
      const item = this.view?.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId);
      if (item) setFurnitureCustomColor(item.kind, this.furnitureColorInput.value);
    });
    const spriteInput = node('input');
    spriteInput.type = 'file';
    spriteInput.accept = 'image/png,image/webp,image/jpeg';
    spriteInput.hidden = true;
    spriteInput.addEventListener('change', () => {
      const file = spriteInput.files?.[0];
      const item = this.view?.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId);
      if (!file || !item) return;
      if (file.size > 512 * 1024) {
        this.notify('El sprite supera el límite de 512 KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          if (item.kind === 'board') {
            const bId = houseBoardId('own', item.id);
            this.expansion.boardRegistry.ensureBoard(bId, item.publicAlias || 'Pizarra de estudio', 'house', this.view!.identity.fingerprint);
            this.expansion.boardRegistry.setBoardSprite(bId, reader.result, this.view!.identity.fingerprint, true);
          } else {
            setFurnitureCustomSprite(item.kind, reader.result);
          }
          this.lastStageRenderSig = '';
          this.notify(`Sprite personalizado aplicado a ${FURNITURE_LABELS[item.kind]}${item.publicAlias ? ` (${item.publicAlias})` : ''}.`);
        }
      };
      reader.readAsDataURL(file);
      spriteInput.value = '';
    });
    const uploadSpriteBtn = button('Sprite PNG', 'sv-button sv-button-small');
    uploadSpriteBtn.title = 'Subir imagen PNG personalizada para este mueble';
    uploadSpriteBtn.addEventListener('click', () => spriteInput.click());
    const resetAssetBtn = button('Restaurar', 'sv-button sv-button-small');
    resetAssetBtn.title = 'Restaurar aspecto original del mueble';
    resetAssetBtn.addEventListener('click', () => {
      const item = this.view?.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId);
      if (item) {
        setFurnitureCustomColor(item.kind, null);
        if (item.kind === 'board') {
          this.expansion.boardRegistry.setBoardSprite(houseBoardId('own', item.id), null, this.view!.identity.fingerprint, true);
        } else {
          setFurnitureCustomSprite(item.kind, null);
        }
        this.lastStageRenderSig = '';
        this.notify(`Aspecto original restaurado para ${FURNITURE_LABELS[item.kind]}.`);
      }
    });
    append(customRow, this.furnitureColorInput, uploadSpriteBtn, resetAssetBtn, spriteInput);

    // Item 3: AI Pixel-Art Sprite Generator & Furniture AI Actions
    const aiSpriteBox = node('div', 'sv-ai-sprite-box');
    const aiSpriteHead = node('span', 'sv-field-label', '✨ Generador Pixel-Art IA (32×32)');
    const aiSpriteRow = node('div', 'sv-ai-sprite-row');
    this.aiSpritePromptInput = node('input', 'sv-input');
    this.aiSpritePromptInput.maxLength = 48;
    this.aiSpritePromptInput.placeholder = 'Describe el aspecto del mueble';
    this.aiSpritePromptInput.setAttribute('aria-label', 'Descripción para generar sprite pixel-art');
    this.aiSpritePromptInput.dataset.testid = 'ai-sprite-prompt';
    const aiSpriteBtn = button('✨ Sprite IA', 'sv-button sv-button-small sv-button-primary');
    aiSpriteBtn.dataset.testid = 'ai-sprite-btn';
    aiSpriteBtn.title = 'Sintetiza un sprite pixel-art 32×32 con la paleta de StudyVillage';
    aiSpriteBtn.addEventListener('click', () => this.runFurnitureSpriteGenerator());
    this.aiSpritePreview = node('img', 'sv-ai-sprite-preview');
    this.aiSpritePreview.alt = 'Vista previa del sprite pixel-art';
    this.aiSpritePreview.hidden = true;
    append(aiSpriteRow, this.aiSpritePromptInput, aiSpriteBtn, this.aiSpritePreview);

    const furnitureAiRow = node('div', 'sv-furniture-actions');
    const houseQuizBtn = button('📚 Tarjetas / Quiz IA', 'sv-button sv-button-small');
    houseQuizBtn.title = 'Abrir estudio de tarjetas y autoevaluación IA de la librería';
    houseQuizBtn.addEventListener('click', () => this.openStudyAiModal());
    append(furnitureAiRow, houseQuizBtn);
    append(aiSpriteBox, aiSpriteHead, aiSpriteRow, furnitureAiRow);

    const deleteButton = button('Quitar mueble', 'sv-link-button sv-danger-text');
    deleteButton.addEventListener('click', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const updated = deleteFurniture(view.ownHouse, this.selectedFurnitureId, view.identity.fingerprint);
      if (updated !== view.ownHouse) this.commitDecoration(updated, this.selectedFurnitureId);
      this.selectedFurnitureId = null;
      this.refresh();
    });
    append(this.furnitureDetail, this.furnitureUseButton, field('Alias visible para todos', this.aliasInput),
      node('span', 'sv-field-label', 'Aspecto modificable (color / PNG)'), customRow, aiSpriteBox, deleteButton);
    const enterDecor = button('Decorar en la habitación', 'sv-button sv-button-primary');
    enterDecor.onclick = () => this.beginDecoration();
    const catalog = node('div', 'sv-furniture-catalog');
    for (const kind of FURNITURE_KINDS) {
      const tile = button('', 'sv-button'); tile.setAttribute('aria-label', `Colocar ${FURNITURE_LABELS[kind]}`);
      const canvas = node('canvas'); canvas.width = 100; canvas.height = 90; drawFurniturePreview(canvas.getContext('2d')!, kind);
      append(tile, canvas, node('span', '', FURNITURE_LABELS[kind]));
      tile.onclick = () => this.beginDecoration(kind); catalog.append(tile);
    }
    const advanced = node('details'); append(advanced, node('summary', '', 'Más opciones de muebles'), furnitureHeader, this.furnitureList, addRow, this.furnitureDetail);
    append(this.houseEditBox, enterDecor, catalog, advanced);
    this.decorationToolbar = node('div', 'sv-decoration-toolbar'); this.decorationToolbar.hidden = true;
    this.decorationToolbar.setAttribute('role', 'group'); this.decorationToolbar.setAttribute('aria-label', 'Decorar habitación');
    const catalogButton = button('Catálogo', 'sv-button'); catalogButton.onclick = () => this.openPhone('decorate');
    const rotate = button('Girar', 'sv-button'); rotate.onclick = () => {
      const house = this.view?.ownHouse; const item = house?.furniture.find(f => f.id === this.selectedFurnitureId);
      if (!house || !item) { this.notify('Selecciona un mueble.'); return; }
      if (item.kind === 'board' || item.kind === 'frame') { this.notify('Las piezas de pared conservan su orientación.'); return; }
      const next = { ...house, revision: house.revision + 1, furniture: house.furniture.map(f => f.id === item.id ? { ...f, rotation: (((f.rotation || 0) + 90) % 360) as 0 | 90 | 180 | 270 } : f) };
      this.commitDecoration(next, item.id);
    };
    const remove = button('Retirar', 'sv-button'); remove.onclick = () => { const h = this.view?.ownHouse; if (h && this.selectedFurnitureId) this.commitDecoration(deleteFurniture(h, this.selectedFurnitureId, h.ownerId), this.selectedFurnitureId); };
    const undo = button('Deshacer', 'sv-button'); undo.onclick = () => { const h = this.view?.ownHouse; if (h) { const previous = this.decorationHistory.undo(h); if (previous) this.actions.updateOwnHouse(previous); } };
    const redo = button('Rehacer', 'sv-button'); redo.onclick = () => { const h = this.view?.ownHouse; if (h) { const next = this.decorationHistory.redo(h); if (next) this.actions.updateOwnHouse(next); } };
    const grid = button('Cuadrícula: sí', 'sv-button'); grid.onclick = () => { this.decorationGrid = !this.decorationGrid; grid.textContent = `Cuadrícula: ${this.decorationGrid ? 'sí' : 'no'}`; this.lastStageRenderSig = ''; };
    const done = button('Terminar', 'sv-button sv-button-primary'); done.onclick = () => this.endDecoration();
    append(this.decorationToolbar, catalogButton, rotate, remove, undo, redo, grid, done); this.shell.append(this.decorationToolbar);
  }

  private buildMedia(): void {
    this.mediaBox = node('section', 'sv-media-card');
    this.mediaEyebrow = node('div', 'sv-eyebrow', 'EN LA ALDEA');
    append(this.mediaBox, this.mediaEyebrow);
    this.privateBox = node('div', 'sv-private');
    this.mediaAudience = node('p', 'sv-subtle');
    this.mediaStatus = node('p', 'sv-tiny');
    this.mediaError = node('p', 'sv-error');

    const meterWrap = node('div', 'sv-mic-meter-wrap');
    const meterBar = node('div', 'sv-mic-meter-bar');
    this.micMeterFill = node('div', 'sv-mic-meter-fill');
    meterBar.append(this.micMeterFill);
    append(meterWrap, node('span', 'sv-field-label', 'Voz'), meterBar);

    const controls = node('div', 'sv-media-controls');
    this.micButton = button('Activar micro', 'sv-button sv-button-small');
    this.micButton.addEventListener('click', () => this.run(() => this.actions.toggleMicrophone()));
    this.muteButton = button('Silenciar', 'sv-button sv-button-small');
    this.muteButton.addEventListener('click', () => { if (this.view) this.actions.setMuted(!this.view.network.media.muted); });
    this.deafenButton = button('No escuchar', 'sv-button sv-button-small');
    this.deafenButton.addEventListener('click', () => { if (this.view) this.actions.setDeafened(!this.view.network.media.deafened); });
    this.pttButton = button('Pulsar para hablar', 'sv-button sv-button-small');
    this.pttButton.addEventListener('click', () => { if (this.view) this.actions.setPushToTalk(!this.view.network.media.pushToTalk); });
    this.screenButton = button('Compartir pantalla', 'sv-button sv-button-small');
    this.screenButton.addEventListener('click', () => this.run(() => this.actions.startScreen()));
    this.stopScreenButton = button('Detener pantalla', 'sv-button sv-button-small sv-danger-text');
    this.stopScreenButton.addEventListener('click', () => this.actions.stopScreen());
    append(controls, this.micButton, this.muteButton, this.deafenButton, this.pttButton, this.screenButton, this.stopScreenButton);
    this.mediaTiles = node('div', 'sv-media-tiles');
    append(this.mediaBox, this.mediaAudience, meterWrap, controls, this.mediaStatus, this.mediaError, this.privateBox, this.mediaTiles,
      node('p', 'sv-tiny', 'Con «Pulsar para hablar», mantén la barra espaciadora para hablar.'));
  }

  private refresh(): void {
    const view = this.view;
    if (!view) return;
    const phase = view.network.phase;
    const joined = phase === 'JOINED';
    const ready = !view.lockedIdentity;
    setText(this.statusBadge, PHASE_LABEL[phase]);
    this.statusBadge.classList.toggle('is-online', joined);
    setText(this.profileName, view.identity.displayName);
    this.profileColor.style.backgroundColor = view.identity.color;
    setInput(this.nameInput, view.identity.displayName);
    setInput(this.colorInput, /^#[0-9a-fA-F]{6}$/.test(view.identity.color) ? view.identity.color : '#e88d79');
    setText(this.phaseText, view.network.hostGraceRemainingMs !== null
      ? `Reconectando al anfitrión · ${Math.ceil(view.network.hostGraceRemainingMs / 1000)} s restantes`
      : PHASE_LABEL[phase]);
    this.openButton.disabled = !ready || !['IDLE', 'CLOSED', 'DENIED', 'EXPIRED_INVITE', 'NETWORK_FAILED', 'KICKED'].includes(phase);
    this.joinButton.disabled = this.openButton.disabled;
    this.joinInput.disabled = this.openButton.disabled;
    show(this.inviteBox, view.network.isHost && !!view.network.invite);
    setInput(this.inviteValue, view.network.invite || '');
    this.copyInviteButton.disabled = !view.network.invite;
    this.rotateInviteButton.disabled = !joined || !view.network.isHost;
    show(this.leaveButton, !['IDLE', 'CLOSED'].includes(phase));
    const notice = view.network.error || this.localNotice || view.notice;
    show(this.noticeBox, !!notice);
    setText(this.noticeText, notice || '');
    show(this.lockOverlay, view.lockedIdentity && !this.lockDismissed);
    show(this.unlockToggleButton, view.lockedIdentity);
    setText(this.lockMessage, view.notice || '');
    setText(this.identityStatus, view.identitySaved
      ? 'Identidad cifrada en este equipo. No se usa el llavero del sistema.'
      : 'Puedes cifrarla para recuperarla al volver. Sin guardar, vive solo en esta sesión.');
    this.saveIdentityButton.disabled = view.lockedIdentity;
    this.refreshPane();
    this.refreshLists();
    this.refreshHouseEditor();
    this.refreshBoardControls();
    this.refreshContacts();
    this.refreshDiagnostics();
    this.refreshMedia();
    this.refreshHud();
    this.refreshTouchControls();
  }

  private refreshPane(): void {
    const view = this.view!;
    const house = this.currentHouse();
    const titles: Record<Pane, [string, string]> = {
      world: [this.currentArea === 'residential' ? this.villageName : WORLD_AREAS[this.currentArea].displayName, 'WASD para caminar · clic o E para usar'],
      house: [house?.name || 'La casa', house?.ownerId === view.identity.fingerprint
        ? 'Tu espacio sigue disponible incluso sin conexión.' : 'Un rincón compartido para estudiar en compañía.'],
      board: [this.expansion.boardRegistry.listBoards().find((board) => board.boardId === this.boardId())?.displayName || 'La pizarra', 'Un espacio para tus ideas.'],
      contacts: ['Contactos', 'Tu pequeña agenda de personas de confianza.'],
      diagnostics: ['Diagnóstico', 'Comprueba las capacidades observadas en este equipo.'],
    };
    this.shell.classList.toggle('is-board-focused', this.pane === 'board');
    if (this.pane !== 'board' && this.boardAdvancedPanel) {
      this.boardAdvancedPanel.hidden = true;
      this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
      for (const group of this.boardAdvancedPanel.querySelectorAll('details')) group.open = false;
    }
    const inRoom = !!this.houseOwnerId;
    const ownRoom = this.houseOwnerId === view.identity.fingerprint;
    if (this.pane === 'board') setText(this.headingAction, inRoom ? (ownRoom ? '← Volver a mi casa' : '← Volver a la casa') : '← Volver');
    else setText(this.headingAction, '← Salir');
    show(this.headingAction, this.pane === 'board' || this.pane === 'house');
    this.headingAction.title = this.pane === 'house' ? 'Salir a la aldea (Esc)' : 'Volver (Esc)';
    setText(this.title, titles[this.pane][0]);
    setText(this.subtitle, titles[this.pane][1]);
    show(this.canvasPane, this.pane === 'world' || this.pane === 'house');
    show(this.boardPane, this.pane === 'board');
    show(this.diagnosticsPane, this.pane === 'diagnostics');
    for (const [pane, item] of this.navButtons) {
      item.classList.toggle('is-active', this.pane === pane);
      item.setAttribute('aria-current', this.pane === pane ? 'page' : 'false');
    }
    this.stageCanvas.setAttribute('aria-label', this.pane === 'house' ? 'Interior de la casa' : 'Aldea interactiva');
  }

  private refreshLists(): void {
    const view = this.view!;
    const occupied = occupiedParcels(view);
    const house = this.currentHouse();
    setText(this.contextTitle, this.pane === 'house' || this.pane === 'board' ? (house?.name || 'Tu casa') : 'Casas de la aldea');
    setText(this.contextText, this.pane === 'house' || this.pane === 'board'
      ? `${view.network.members.filter((member) => member.connected && member.houseId === (house?.ownerId || view.identity.fingerprint)).length || 1} persona(s) aquí`
      : `${occupied.length} de 6 parcelas ocupadas`);
    const signature = JSON.stringify({
      houses: occupied.map((item) => [item.ownerId, item.house.name, item.house.access, item.parcel.slot]),
      members: view.network.members.map((member) => [member.identity.fingerprint, member.identity.displayName, member.connected, member.houseId]),
      joins: view.network.pendingJoins.map((request) => [request.requestId, request.identity.displayName]),
      visits: view.network.pendingVisits.map((request) => [request.requestId, request.identity.displayName, request.houseId]),
      isHost: view.network.isHost,
    });
    if (signature === this.lastListsSignature) return;
    this.lastListsSignature = signature;
    this.housesList.replaceChildren();
    for (const item of occupied) {
      const row = button('', 'sv-house-row');
      const houseIcon = node('span', 'sv-house-icon');
      houseIcon.append(monoIcon('house'));
      const info = node('span', 'sv-house-row-text');
      append(info, node('strong', '', item.house.name), node('small', '', item.isOwn ? 'Tu casa' : `${item.name} · ${this.accessLabel(item.house.access)}`));
      append(row, houseIcon, info, node('span', '', '→'));
      row.disabled = !item.isOwn && (view.network.phase !== 'JOINED' || item.house.access === 'locked');
      row.addEventListener('click', () => this.openHouse(item.ownerId));
      this.housesList.append(row);
    }
    this.peopleList.replaceChildren();
    if (view.network.members.length) {
      this.peopleList.append(node('div', 'sv-eyebrow sv-list-divider', 'VECINDARIO'));
      for (const member of view.network.members.filter((person) => person.connected)) {
        const row = node('div', 'sv-person-row');
        const dot = node('span', 'sv-person-dot');
        dot.style.backgroundColor = member.identity.color;
        const label = node('span', '', `${member.identity.displayName} · ${member.identity.fingerprint.slice(0, 8)}`);
        append(row, dot, label);
        if (view.network.isHost && member.identity.fingerprint !== view.identity.fingerprint) {
          const kick = button('Sacar', 'sv-link-button sv-danger-text');
          kick.setAttribute('aria-label', `Sacar a ${member.identity.displayName} de la sesión`);
          kick.addEventListener('click', () => this.actions.kickMember(member.identity.fingerprint));
          row.append(kick);
        } else if (member.houseId === view.identity.fingerprint && member.identity.fingerprint !== view.identity.fingerprint) {
          const kick = button('Salir', 'sv-link-button sv-danger-text');
          kick.setAttribute('aria-label', `Sacar a ${member.identity.displayName} de tu casa`);
          kick.addEventListener('click', () => this.actions.kickVisitor(member.identity.fingerprint));
          row.append(kick);
        }
        this.peopleList.append(row);
      }
    }
    this.approvalList.replaceChildren();
    const joins = view.network.isHost ? view.network.pendingJoins : [];
    const visits = view.network.pendingVisits.filter((request) => request.houseId === view.identity.fingerprint);
    show(this.approvalBox, joins.length + visits.length > 0);
    for (const request of joins) this.approvalList.append(this.approvalRow(`${request.identity.displayName} · ${request.identity.fingerprint.slice(0, 12)}`, 'Quiere entrar en la aldea',
      () => this.actions.decideJoin(request.requestId, true), () => this.actions.decideJoin(request.requestId, false)));
    for (const request of visits) this.approvalList.append(this.approvalRow(`${request.identity.displayName} · ${request.identity.fingerprint.slice(0, 12)}`, 'Quiere visitar tu casa',
      () => this.actions.decideVisit(request.requestId, true), () => this.actions.decideVisit(request.requestId, false)));
  }

  private approvalRow(name: string, detail: string, accept: () => void, deny: () => void): HTMLElement {
    const row = node('div', 'sv-approval-row');
    append(row, node('strong', '', name), node('small', '', detail));
    const controls = node('div', 'sv-inline');
    const yes = button('Permitir', 'sv-button sv-button-small sv-button-primary');
    const no = button('Rechazar', 'sv-button sv-button-small');
    yes.addEventListener('click', () => this.run(accept));
    no.addEventListener('click', () => this.run(deny));
    append(controls, yes, no);
    row.append(controls);
    return row;
  }

  private refreshHouseEditor(): void {
    const view = this.view!;
    show(this.houseEditBox, this.pane === 'house' && this.houseOwnerId === view.identity.fingerprint);
    if (this.houseEditBox.hidden) return;
    const house = view.ownHouse;
    setInput(this.houseNameInput, house.name);
    setInput(this.houseAccessSelect, house.access);
    setInput(this.houseThemeSelect, house.theme);
    setText(this.furnitureCount, `${house.furniture.length}/${LIMITS.furniture}`);
    const selected = house.furniture.find((item) => item.id === this.selectedFurnitureId) || null;
    show(this.furnitureDetail, !!selected);
    if (selected) {
      setInput(this.aliasInput, selected.publicAlias);
      setText(this.furnitureUseButton, `⚡ ${FURNITURE_ACTION_LABELS[selected.kind]} (E)`);
      const customColor = getFurnitureCustomColor(selected.kind);
      if (customColor) setInput(this.furnitureColorInput, customColor);
    }
    // Rebuilding on every selection would swap the row under a double-click,
    // so the list is only rebuilt when the furniture itself changes.
    const signature = JSON.stringify(house.furniture.map((item) => [item.id, item.kind, item.publicAlias]));
    if (this.furnitureList.dataset.signature !== signature) {
      this.furnitureList.dataset.signature = signature;
      this.furnitureList.replaceChildren();
      for (const item of house.furniture) {
        const row = button(`${FURNITURE_LABELS[item.kind]}${item.publicAlias ? ` · ${item.publicAlias}` : ''}`, 'sv-furniture-item');
        row.dataset.id = item.id;
        row.addEventListener('click', () => { this.selectedFurnitureId = item.id; this.refreshHouseEditor(); });
        row.addEventListener('dblclick', () => this.interactWithFurniture(item));
        this.furnitureList.append(row);
      }
    }
    for (const row of this.furnitureList.children) {
      if (row instanceof HTMLElement) row.classList.toggle('is-selected', row.dataset.id === this.selectedFurnitureId);
    }
  }

  private refreshBoardControls(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const house = this.currentHouse() || view.ownHouse;
    const activeFurniture = !this.customBoardId
      ? house.furniture.find((f) => f.id === (this.activeBoardFurnitureId || 'board') && f.kind === 'board')
      : null;
    const defaultBoardTitle = activeFurniture?.publicAlias || 'Pizarra de estudio';
    const boardMeta = this.expansion.boardRegistry.ensureBoard(
      boardId,
      defaultBoardTitle,
      this.customBoardId ? this.currentArea : 'house',
      house.ownerId || view.identity.fingerprint,
    );
    if (this.boardNameInput) {
      setInput(this.boardNameInput, boardMeta.displayName);
    }
    if (this.boardAccessSelect) {
      setInput(this.boardAccessSelect, boardMeta.access);
    }
    const strokes = this.allStrokes(boardId);
    for (const [tool, item] of this.boardToolButtons) {
      item.classList.toggle('is-active', !this.richBoardTool && tool === this.boardTool);
      item.setAttribute('aria-pressed', String(!this.richBoardTool && tool === this.boardTool));
    }
    for (const [rTool, item] of this.richToolButtons) {
      item.classList.toggle('is-active', this.richBoardTool === rTool);
      item.setAttribute('aria-pressed', String(this.richBoardTool === rTool));
    }
    const advancedTool = this.richBoardTool
      ? this.richToolButtons.get(this.richBoardTool)?.textContent
      : !MAIN_BOARD_TOOLS.includes(this.boardTool) ? this.boardToolButtons.get(this.boardTool)?.textContent : null;
    setText(this.boardAdvancedToggle, advancedTool ? `Más · ${advancedTool}` : 'Más');
    const hasOwn = !!newestOwnStroke(strokes, view.identity.fingerprint, boardId)
      || this.expansion.boardRegistry.getRichElements(boardId).some((s) => s.authorId === view.identity.fingerprint);
    this.boardUndoButton.disabled = !hasOwn;
    if (this.boardRedoButton) {
      this.boardRedoButton.disabled = !this.expansion.boardRegistry.hasRedoStroke(boardId, view.identity.fingerprint);
    }
    this.boardClearButton.disabled = !hasOwn;
    if (!hasOwn) this.boardClearArmed = false;
    setText(this.boardClearButton, this.boardClearArmed ? '¿Borrar todo lo tuyo?' : 'Borrar lo mío');
    this.boardClearButton.classList.toggle('is-armed', this.boardClearArmed);
    this.boardCanvas.dataset.tool = this.richBoardTool || this.boardTool;
    setText(this.boardZoomLabel, `${Math.round(this.boardCamera().zoom * 100)}%`);
    const canDraw = this.canDrawBoard();
    show(this.boardReadOnlyStatus, !canDraw || boardAtCapacity(strokes, boardId));
    setText(this.boardReadOnlyStatus, !canDraw ? 'Esta pizarra es de solo lectura. Puedes consultar los permisos en Más.' : 'La pizarra ha alcanzado su capacidad.');
    setText(this.boardStatus, !canDraw
      ? 'Entra en la casa o solicita permisos de edición para dibujar en esta pizarra.'
      : boardAtCapacity(strokes, boardId)
        ? `Pizarra llena · ${LIMITS.boardOperations}/${LIMITS.boardOperations} operaciones`
        : `${strokes.filter(stroke => !stroke.deleted).length} trazos en esta pizarra`);
    this.boardCanvas.classList.toggle('is-disabled', !canDraw || boardAtCapacity(strokes, boardId));
    const authors = [...new Set(strokes.map((stroke) => stroke.author))].sort();
    const signature = JSON.stringify([boardId, authors, view.network.members.map((member) => [member.identity.fingerprint, member.identity.displayName])]);
    if (signature === this.lastLayersSignature) return;
    this.lastLayersSignature = signature;
    this.boardLayers.replaceChildren();
    if (!authors.length) this.boardLayers.append(node('p', 'sv-subtle', 'Todavía no hay trazos.'));
    for (const author of authors) {
      const label = node('label', 'sv-layer');
      const input = node('input');
      input.type = 'checkbox';
      input.checked = !this.hiddenAuthors.has(author);
      input.addEventListener('change', () => {
        if (input.checked) this.hiddenAuthors.delete(author);
        else this.hiddenAuthors.add(author);
      });
      const name = author === view.identity.fingerprint ? 'Mis trazos' :
        view.network.members.find((member) => member.identity.fingerprint === author)?.identity.displayName || `${author.slice(0, 10)}…`;
      append(label, input, node('span', '', name), node('small', '', 'Solo en mi vista'));
      this.boardLayers.append(label);
    }
  }

  private refreshContacts(): void {
    const view = this.view!;
    setText(this.friendCodeValue, view.friendCode);
    const signature = JSON.stringify(view.contacts.map((contact) => [contact.identity.fingerprint, contact.identity.displayName, contact.friendCode]));
    if (this.contactsList.dataset.signature === signature) return;
    this.contactsList.dataset.signature = signature;
    this.contactsList.replaceChildren();
    if (!view.contacts.length) this.contactsList.append(node('p', 'sv-subtle', 'Aún no has añadido contactos.'));
    for (const contact of view.contacts) {
      const card = node('div', 'sv-contact-row');
      const avatar = node('span', 'sv-person-dot');
      avatar.style.backgroundColor = contact.identity.color;
      const copy = node('div');
      append(copy, node('strong', '', contact.identity.displayName), node('small', '', contact.identity.fingerprint.slice(0, 18)));
      append(card, avatar, copy);
      this.contactsList.append(card);
    }
  }

  private refreshDiagnostics(): void {
    const entries = this.view!.diagnostics;
    const signature = JSON.stringify(entries);
    if (this.diagnosticList.dataset.signature === signature) return;
    this.diagnosticList.dataset.signature = signature;
    this.diagnosticList.replaceChildren();
    if (!entries.length) this.diagnosticList.append(node('p', 'sv-subtle', 'Ejecuta una prueba para ver resultados.'));
    for (const entry of entries) {
      const row = node('div', 'sv-diagnostic-row');
      const badge = node('span', `sv-diagnostic-badge is-${entry.status.toLowerCase()}`, entry.status);
      const copy = node('div');
      append(copy, node('strong', '', entry.test), node('p', 'sv-subtle', entry.detail));
      append(row, badge, copy);
      this.diagnosticList.append(row);
    }
  }

  /** Private calls: start one, answer one, or hang up. */
  private refreshPrivate(view: AppView, connected: boolean): void {
    const call = view.network.privateCall;
    const me = view.identity.fingerprint;
    const others = view.network.members.filter((member) => member.connected && member.identity.fingerprint !== me);
    const incoming = call.incoming.filter((id) => !this.dismissedPrivate.has(id));
    for (const id of this.dismissedPrivate) if (!call.incoming.includes(id)) this.dismissedPrivate.delete(id);
    const signature = JSON.stringify([connected, call, incoming, others.map((member) => [member.identity.fingerprint, member.identity.displayName])]);
    if (signature === this.lastPrivateSignature) return;
    this.lastPrivateSignature = signature;
    this.privateBox.replaceChildren();
    show(this.privateBox, connected && (others.length > 0 || !!call.with));
    if (!connected) return;
    const nameOf = (id: string) => view.network.members.find((member) => member.identity.fingerprint === id)?.identity.displayName || 'alguien';

    for (const id of incoming) {
      const row = node('div', 'sv-private-request');
      const accept = button('Aceptar', 'sv-button sv-button-small sv-button-primary');
      accept.addEventListener('click', () => this.actions.requestPrivate(id));
      const decline = button('Rechazar', 'sv-button sv-button-small');
      decline.addEventListener('click', () => { this.dismissedPrivate.add(id); this.lastPrivateSignature = ''; this.refreshMedia(); });
      const actions = node('div', 'sv-inline');
      append(actions, accept, decline);
      append(row, node('strong', '', `${nameOf(id)} quiere hablar en privado`), actions);
      this.privateBox.append(row);
    }

    if (call.with) {
      const row = node('div', `sv-private-status${call.active ? ' is-live' : ''}`);
      const hang = button(call.active ? 'Colgar' : 'Cancelar', 'sv-button sv-button-small');
      hang.addEventListener('click', () => this.actions.requestPrivate(null));
      append(row, node('span', 'sv-private-dot'),
        node('span', '', call.active ? `En privado con ${nameOf(call.with)}` : `Esperando a ${nameOf(call.with)}…`), hang);
      this.privateBox.append(row);
      return;
    }

    if (!others.length) return;
    this.privateBox.append(node('div', 'sv-field-label', 'Hablar en privado con'));
    const list = node('div', 'sv-private-list');
    for (const member of others) {
      const pick = button(member.identity.displayName, 'sv-button sv-button-small sv-private-pick');
      const dot = node('span', 'sv-person-dot');
      dot.style.backgroundColor = member.identity.color;
      pick.prepend(dot);
      pick.title = 'Solo esa persona te oirá, y solo si acepta';
      pick.addEventListener('click', () => this.actions.requestPrivate(member.identity.fingerprint));
      list.append(pick);
    }
    this.privateBox.append(list);
  }

  private refreshMedia(): void {
    const view = this.view!;
    const media = view.network.media;
    const ownMember = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    // Voice now works wherever you are: the open village, a house, or a
    // private call. The manager already scopes who can hear you.
    const showingCurrentRoom = view.network.phase === 'JOINED';
    const connected = view.network.phase === 'JOINED' && !view.lockedIdentity;
    const call = view.network.privateCall;
    setText(this.mediaEyebrow, call.active ? 'LLAMADA PRIVADA' : ownMember?.houseId ? 'EN ESTA CASA' : 'EN LA ALDEA');
    setText(this.mediaAudience, connected ? (media.audience || 'Nadie recibe tu audio o pantalla ahora.') : 'Conéctate a una aldea para hablar con otras personas.');
    this.refreshPrivate(view, connected);
    setText(this.mediaStatus, SCREEN_LABEL[media.screenPhase]);
    setText(this.mediaError, media.error || '');
    show(this.mediaError, !!media.error);
    setText(this.micButton, media.micEnabled ? 'Apagar micro' : 'Activar micro');
    setText(this.muteButton, media.muted ? 'Quitar silencio' : 'Silenciar');
    setText(this.deafenButton, media.deafened ? 'Volver a escuchar' : 'No escuchar');
    setText(this.pttButton, media.pushToTalk ? 'PTT activo' : 'Pulsar para hablar');
    this.pttButton.classList.toggle('is-active', media.pushToTalk);
    this.muteButton.classList.toggle('is-active', media.muted);
    this.deafenButton.classList.toggle('is-active', media.deafened);
    this.micButton.disabled = !connected;
    this.muteButton.disabled = !connected || !media.micEnabled;
    this.deafenButton.disabled = !connected;
    this.pttButton.disabled = !connected || !media.micEnabled;
    this.screenButton.disabled = !connected || !['OFF', 'SOURCE_ENDED', 'DENIED', 'NETWORK_FAILED'].includes(media.screenPhase);
    this.stopScreenButton.disabled = !['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(media.screenPhase);
    this.micMeterFill.style.width = media.talking ? '82%' : media.micEnabled && !media.muted ? '28%' : '0%';

    const desired = new Map<string, { stream: MediaStream; kind: 'audio' | 'screen'; name: string; local: boolean }>();
    if (media.localScreen && showingCurrentRoom) desired.set('local-screen', { stream: media.localScreen, kind: 'screen', name: 'Tu pantalla (HD)', local: true });
    for (const remote of showingCurrentRoom ? media.remote : []) {
      const name = view.network.members.find((member) => member.identity.fingerprint === remote.identityId)?.identity.displayName || remote.identityId.slice(0, 10);
      desired.set(`${remote.kind}:${remote.identityId}`, { stream: remote.stream, kind: remote.kind, name, local: false });
    }
    for (const [key, mount] of this.mediaMounts) {
      if (!desired.has(key)) {
        mount.element.pause();
        mount.element.srcObject = null;
        mount.wrapper.remove();
        this.mediaMounts.delete(key);
        if (this.spotlightKey === key) this.spotlightKey = null;
      }
    }
    let screenCount = 0;
    for (const [key, item] of desired) {
      if (item.kind === 'screen') {
        screenCount++;
        if (!this.spotlightKey) this.spotlightKey = key;
      }
      let mount = this.mediaMounts.get(key);
      if (!mount) {
        const wrapper = node('div', 'sv-media-tile');
        const element = document.createElement(item.kind === 'screen' ? 'video' : 'audio');
        element.autoplay = true;
        element.controls = !item.local;
        element.setAttribute('playsinline', '');
        if (item.local) element.muted = true;
        if (item.kind === 'screen') {
          const head = node('div', 'sv-media-tile-head');
          const titleEl = node('strong', '', item.name);
          const btnGroup = node('div', 'sv-inline');
          const spotBtn = button('★ Destacar', 'sv-button sv-button-small');
          spotBtn.addEventListener('click', () => {
            this.spotlightKey = key;
            this.screenLayoutMode = 'spotlight';
            this.refreshMedia();
          });
          const fullBtn = button('⛶ Ampliar', 'sv-button sv-button-small');
          fullBtn.addEventListener('click', () => {
            void (element.requestFullscreen?.() || wrapper.requestFullscreen?.()).catch(() => {});
          });
          append(btnGroup, spotBtn, fullBtn);
          append(head, titleEl, btnGroup);
          append(wrapper, head, element);
          this.screenTheaterGrid.append(wrapper);
        } else {
          append(wrapper, node('strong', '', item.name), element);
          this.mediaTiles.append(wrapper);
        }
        mount = { wrapper, element, stream: item.stream, kind: item.kind };
        this.mediaMounts.set(key, mount);
        element.srcObject = item.stream;
        void element.play().catch(() => { /* Browser autoplay may require a gesture. */ });
      } else {
        setText(mount.wrapper.querySelector('strong')!, item.name);
        if (mount.stream !== item.stream) {
          mount.stream = item.stream;
          mount.element.srcObject = item.stream;
          void mount.element.play().catch(() => { /* Browser autoplay may require a gesture. */ });
        }
      }
      if (item.kind === 'screen' && mount) {
        mount.wrapper.classList.toggle('is-spotlight', this.spotlightKey === key);
      }
    }
    show(this.screenTheater, screenCount > 0);
  }

  private navigate(pane: Pane): void {
    if (!this.view) return;
    if (pane === 'contacts') { this.openPhone('contacts'); return; }
    this.closePhone();
    if (pane === 'world') {
      if (this.houseOwnerId || this.waitingHouseId) this.leaveCurrentHouse();
      else { this.pane = 'world'; this.refresh(); }
      return;
    }
    else if (pane === 'house') {
      // Already inside your own house (for example, back from the board):
      // return to it as you left it instead of re-entering at the doormat.
      if (this.houseOwnerId === this.view.identity.fingerprint) { this.returnToRoom(); return; }
      this.enterOwnHouse(); return;
    }
    this.pane = pane;
    this.refresh();
  }

  /** Back to the room the player is in, keeping their position. */
  private returnToRoom(): void {
    if (!this.houseOwnerId) return;
    this.pane = 'house';
    this.refresh();
  }

  private enterOwnHouse(): void { this.openHouse(this.view?.identity.fingerprint || ''); }

  private beginDecoration(kind?: FurnitureKind): void {
    if (!this.view || this.pane !== 'house' || this.houseOwnerId !== this.view.identity.fingerprint) return;
    this.decorating = true; this.pendingFurniture = kind ?? null; this.keys.clear(); this.dpadKeys.clear(); this.moveTarget = null; this.movePath = []; this.pendingInteraction = null;
    this.closePhone(); this.decorationToolbar.hidden = false;
    if (kind) this.previewNewFurniture(280, 300);
    this.lastStageRenderSig = '';
  }
  private endDecoration(): void { this.decorating = false; this.pendingFurniture = null; this.previewHouse = null; this.drag = null; this.decorationInvalid = null; if (this.decorationToolbar) this.decorationToolbar.hidden = true; this.lastStageRenderSig = ''; }
  private previewNewFurniture(x: number, y: number): void {
    const house = this.view?.ownHouse; if (!house || !this.pendingFurniture) return;
    const snap = (n: number) => this.decorationGrid ? Math.round(n / 8) * 8 : Math.round(n);
    const item: Furniture = { id: 'placing-preview', kind: this.pendingFurniture, x: snap(x), y: snap(y), publicAlias: '' };
    this.previewHouse = { ...house, revision: house.revision + 1, furniture: [...house.furniture, item] };
    this.decorationInvalid = house.furniture.length >= 32 ? 'La casa ya tiene 32 muebles.' : placementError(this.previewHouse, item.id); this.lastStageRenderSig = '';
  }
  private commitDecoration(next: PublicHouse, changedId: string): boolean {
    const house = this.view?.ownHouse; if (!house || next.ownerId !== house.ownerId) return false;
    const error = placementError(next, changedId); if (error) { this.notify(error); return false; }
    this.decorationHistory.remember(house);
    const furniture = next.furniture.map(f => f.id === 'placing-preview' ? { ...f, id: crypto.randomUUID() } : f);
    this.selectedFurnitureId = furniture.find(f => f.id === changedId)?.id || furniture.at(-1)?.id || null;
    this.actions.updateOwnHouse({ ...next, furniture, revision: house.revision + 1 }); this.lastStageRenderSig = ''; return true;
  }

  private openHouse(ownerId: string): void {
    const view = this.view;
    if (!view || !ownerId) return;
    const isOwn = ownerId === view.identity.fingerprint;
    const house = isOwn ? view.ownHouse : view.network.houses.find((item) => item.ownerId === ownerId);
    if (!house) return;
    if (!isOwn && (view.network.phase !== 'JOINED' || house.access === 'locked')) return;
    if (view.network.phase === 'JOINED') this.run(() => this.actions.visitHouse(ownerId));
    this.expansion.closeModal();
    if (isOwn) {
      this.houseOwnerId = ownerId;
      this.waitingHouseId = null;
      this.pane = 'house';
      this.currentArea = 'residential';
      this.localPosition = { ...HOUSE_SPAWN };
    } else {
      this.waitingHouseId = ownerId;
      this.notify(house.access === 'ask' ? 'Solicitud enviada. Espera a que te abran la puerta.' : 'Entrando en la casa…');
    }
    this.refresh();
  }

  private changeWorldArea(area: BuiltinAreaId, spawn: Position): void {
    if (this.pane !== 'world') this.leaveCurrentHouse();
    this.expansion.closeModal();
    this.pendingInteraction = null;
    this.currentArea = area;
    this.localPosition = { ...spawn, moving: false };
    this.moveTarget = null;
    this.lastStageRenderSig = '';
    this.actions.move({ ...this.localPosition, areaId: area });
    this.expansion.refreshStageControls();
    this.refreshPane();
  }

  private leaveCurrentHouse(): void {
    this.endDecoration();
    const view = this.view;
    if (!view) return;
    if (view.network.phase === 'JOINED' && (this.houseOwnerId || this.waitingHouseId)) this.run(() => this.actions.leaveHouse());
    const leftHouse = this.houseOwnerId;
    this.houseOwnerId = null;
    this.waitingHouseId = null;
    this.selectedFurnitureId = null;
    this.expansion.closeModal();
    this.pane = 'world';
    // Step out onto the street in front of the house you were in.
    const parcel = leftHouse ? occupiedParcels(view).find((item) => item.ownerId === leftHouse)?.parcel : undefined;
    if (leftHouse) this.currentArea = 'residential';
    this.localPosition = parcel
      ? { x: parcel.doorX, y: parcel.doorY + (parcel.doorY < 200 ? 16 : -16), direction: parcel.doorY < 200 ? 'down' : 'up', moving: false }
      : { ...WORLD_AREAS[this.currentArea].defaultSpawn };
    this.stopMoving();
    this.lastStageRenderSig = '';
    this.actions.move({ ...this.localPosition, areaId: this.currentArea });
    this.refresh();
  }

  private currentHouse(): PublicHouse | null {
    const view = this.view;
    if (!view) return null;
    if (!this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint) return view.ownHouse;
    return view.network.houses.find((house) => house.ownerId === this.houseOwnerId) || null;
  }

  private patchOwnHouse(patch: Partial<PublicHouse>): void {
    const view = this.view;
    if (!view) return;
    this.actions.updateOwnHouse({ ...view.ownHouse, ...patch, revision: view.ownHouse.revision + 1 });
  }

  private boardId(): string {
    if (this.customBoardId) return this.customBoardId;
    const view = this.view;
    const isOwn = !this.houseOwnerId || this.houseOwnerId === view?.identity.fingerprint;
    const scope = isOwn ? 'own' : this.houseOwnerId!;
    return houseBoardId(scope, this.activeBoardFurnitureId || 'board');
  }

  private allStrokes(boardId: string): BoardStroke[] {
    const persisted = this.expansion.boardRegistry.getStrokes(boardId);
    const byId = new Map<string, BoardStroke>();
    for (const s of persisted) {
      byId.set(s.id, { ...s, boardId });
    }
    const view = this.view;
    const isPrimaryHouseBoard = !this.customBoardId && (this.activeBoardFurnitureId || 'board') === 'board';
    if (view && isPrimaryHouseBoard) {
      const targetHouseOwner = this.houseOwnerId || view.identity.fingerprint;
      for (const netStroke of view.network.strokes) {
        if (netStroke.boardId === targetHouseOwner || netStroke.boardId === boardId) {
          byId.set(netStroke.id, { ...netStroke, boardId });
        }
      }
    }
    for (const pStroke of this.pendingStrokes) {
      if (pStroke.boardId === boardId && !byId.has(pStroke.id)) {
        byId.set(pStroke.id, pStroke);
      }
    }
    for (const oStroke of this.offlineStrokes) {
      if (oStroke.boardId === boardId) {
        byId.set(oStroke.id, oStroke);
      }
    }
    return Array.from(byId.values());
  }

  private canDrawBoard(): boolean {
    const view = this.view;
    if (!view || view.lockedIdentity) return false;
    const boardId = this.boardId();
    if (!this.expansion.boardRegistry.canEdit(boardId, view.identity.fingerprint, view.network.isHost)) {
      return false;
    }
    if (this.customBoardId) {
      return true;
    }
    const targetOwner = this.houseOwnerId || view.identity.fingerprint;
    if (view.network.phase !== 'JOINED') return targetOwner === view.identity.fingerprint;
    const own = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    return own?.houseId === targetOwner;
  }

  private undoStroke(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const ownShapes = this.expansion.boardRegistry
      .getRichElements(boardId)
      .filter((s) => s.authorId === view.identity.fingerprint);
    if (ownShapes.length > 0) {
      const lastShape = ownShapes[ownShapes.length - 1];
      this.expansion.boardRegistry.deleteRichElement(boardId, lastShape.id, view.identity.fingerprint, view.network.isHost);
      this.boardExtraFrames = 3;
      this.refreshBoardControls();
      return;
    }
    const stroke = newestOwnStroke(this.allStrokes(boardId), view.identity.fingerprint, boardId);
    if (!stroke) return;
    this.removeOwnStroke(stroke);
    this.refreshBoardControls();
  }

  private redoStroke(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const popped = this.expansion.boardRegistry.popRedoStroke(boardId, view.identity.fingerprint);
    if (!popped) return;
    this.saveStroke(
      { points: popped.points, tool: popped.tool, color: popped.color, width: popped.width },
      popped.text,
    );
    this.boardExtraFrames = 3;
    this.refreshBoardControls();
  }

  /** Deletes one of your own strokes, wherever it currently lives. */
  private removeOwnStroke(stroke: BoardStroke): void {
    this.expansion.boardRegistry.pushRedoStroke(stroke.boardId, stroke.author, { ...stroke, deleted: false });
    this.expansion.boardRegistry.markStrokeDeleted(stroke.boardId, stroke.id);
    const offline = this.offlineStrokes.find((item) => item.id === stroke.id);
    if (offline) offline.deleted = true;
    const pending = this.pendingStrokes.find((item) => item.id === stroke.id);
    if (pending) pending.deleted = true;
    if (this.view?.network.phase === 'JOINED') {
      this.run(() => this.actions.deleteStroke(stroke.id));
    }
  }

  private clearOwnStrokes(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const own = this.allStrokes(boardId).filter((stroke) => stroke.author === view.identity.fingerprint && !stroke.deleted);
    for (const stroke of own) this.removeOwnStroke(stroke);
    for (const shape of this.expansion.boardRegistry.getRichElements(boardId)) {
      if (shape.authorId === view.identity.fingerprint) {
        this.expansion.boardRegistry.deleteRichElement(boardId, shape.id, view.identity.fingerprint, view.network.isHost);
      }
    }
    this.boardExtraFrames = 3;
    this.notify(own.length ? `Se borraron ${own.length} trazo(s) tuyos.` : 'Pizarra propia limpiada.');
    this.refreshBoardControls();
  }

  /** Erases your own strokes under a board-space point. Others' work is never touched. */
  private eraseAt(point: BoardPoint): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const radius = 8 / this.boardCamera().zoom;
    let erased = false;
    for (const stroke of this.allStrokes(boardId)) {
      if (stroke.author !== view.identity.fingerprint || stroke.deleted || this.hiddenAuthors.has(stroke.author)) continue;
      if (strokeHit(stroke, point, radius, textBox(stroke))) { this.removeOwnStroke(stroke); erased = true; }
    }
    if (erased) this.refreshBoardControls();
  }

  private boardCamera(): BoardCamera {
    return this.boardCameras.get(this.boardId()) ?? DEFAULT_CAMERA;
  }

  private setBoardCamera(camera: BoardCamera): void {
    this.boardCameras.set(this.boardId(), camera);
    setText(this.boardZoomLabel, `${Math.round(camera.zoom * 100)}%`);
    this.positionBoardTextInput();
  }

  private zoomBoard(factor: number): void {
    this.setBoardCamera(zoomAt(this.boardCamera(), 384, 216, factor));
  }

  private fitBoard(): void {
    const boardId = this.boardId();
    const strokes = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    this.setBoardCamera(fitCamera(strokesBounds(strokes, textBox), 768, 432));
  }

  private boardWorldPoint(event: MouseEvent): BoardPoint {
    const local = this.canvasPoint(event, this.boardCanvas);
    return screenToWorld(this.boardCamera(), local.x, local.y);
  }

  // ------------------------------------------------------------ text tool --

  /** Opens an inline editor at a world point; Enter commits, Escape cancels. */
  private openBoardText(at: BoardPoint): void {
    this.commitBoardText();
    const input = node('textarea', 'sv-board-text');
    input.rows = 1;
    input.maxLength = LIMITS.boardText;
    input.placeholder = 'Escribe… ($x^2$ para fórmulas)';
    input.setAttribute('aria-label', 'Texto para la pizarra');
    input.dataset.x = String(at.x);
    input.dataset.y = String(at.y);
    input.style.color = this.boardColor.value;
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.cancelBoardText(); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.commitBoardText(); }
    });
    input.addEventListener('input', () => {
      input.rows = Math.min(8, input.value.split('\n').length);
    });
    input.addEventListener('blur', () => { if (this.boardTextInput === input) this.commitBoardText(); });
    this.boardTextInput = input;
    this.boardWrap.append(input);
    this.positionBoardTextInput();
    input.focus();
  }

  private positionBoardTextInput(): void {
    const input = this.boardTextInput;
    if (!input) return;
    const camera = this.boardCamera();
    const x = Number(input.dataset.x);
    const y = Number(input.dataset.y);
    // Logical 768x432 units to the canvas's displayed size.
    const scale = this.boardCanvas.clientWidth / 768 || 1;
    const size = textFontPx(Number(this.boardWidth.value)) * camera.zoom * scale;
    input.style.left = `${(x - camera.x) * camera.zoom * scale}px`;
    input.style.top = `${(y - camera.y) * camera.zoom * scale}px`;
    input.style.fontSize = `${Math.max(10, size)}px`;
  }

  private cancelBoardText(): void {
    this.boardTextInput?.remove();
    this.boardTextInput = null;
  }

  private commitBoardText(): void {
    const input = this.boardTextInput;
    if (!input) return;
    this.boardTextInput = null;
    const value = input.value.replace(/\s+$/, '');
    const at = { x: Number(input.dataset.x), y: Number(input.dataset.y) };
    input.remove();
    if (!value.trim()) return;
    this.saveStroke({ points: [at], tool: 'text', color: this.boardColor.value, width: Number(this.boardWidth.value) }, value);
  }

  private exportBoard(): void {
    const boardId = this.boardId();
    const strokes = this.boardExportMode.value === 'all'
      ? this.allStrokes(boardId).filter((stroke) => !stroke.deleted)
      : visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    // The board is infinite, so the export frames everything that was drawn
    // rather than whatever happens to be on screen.
    this.run(async () => this.actions.exportBoard(await renderBoardForExport(strokes)));
  }

  private refreshBoardSwatches(): void {
    const active = this.boardColor.value.toLowerCase();
    for (const [hex, btn] of this.boardSwatchButtons) {
      btn.classList.toggle('is-active', hex === active);
    }
  }

  private insertBoardFormula(formula: string): void {
    if (!this.canDrawBoard()) {
      this.notify('Entra en una casa para escribir en su pizarra.');
      return;
    }
    if (this.boardTextInput) {
      const input = this.boardTextInput;
      const { text, caret } = insertAtSelection(input.value, formula, input.selectionStart, input.selectionEnd);
      input.value = text;
      input.focus();
      input.setSelectionRange(caret, caret);
      return;
    }
    const cam = this.boardCamera();
    const center = clampBoardPoint({
      x: Math.round(cam.x + 384 / cam.zoom - 60),
      y: Math.round(cam.y + 216 / cam.zoom - 16),
    });
    this.boardTool = 'text';
    this.refreshBoardControls();
    this.openBoardText(center);
    const activeInput = this.boardTextInput as HTMLTextAreaElement | null;
    if (activeInput) {
      activeInput.value = formula;
      activeInput.select();
    }
  }

  private insertCoordinateAxes(): void {
    if (!this.canDrawBoard()) {
      this.notify('Entra en una casa para dibujar en su pizarra.');
      return;
    }
    const cam = this.boardCamera();
    const cx = Math.round(cam.x + 384 / cam.zoom);
    const cy = Math.round(cam.y + 216 / cam.zoom);
    const span = Math.round(110 / cam.zoom);
    const color = this.boardColor.value;
    this.saveStroke({
      points: [clampBoardPoint({ x: cx - span, y: cy }), clampBoardPoint({ x: cx + span, y: cy })],
      tool: 'line',
      color,
      width: 2,
    });
    this.saveStroke({
      points: [clampBoardPoint({ x: cx, y: cy - span }), clampBoardPoint({ x: cx, y: cy + span })],
      tool: 'line',
      color,
      width: 2,
    });
  }

  private interactWithFurniture(item: Furniture): void {
    const view = this.view;
    if (!view) return;
    this.selectedFurnitureId = item.id;
    this.refreshHouseEditor();
    const isOwn = !this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint;
    switch (item.kind) {
      case 'board': {
        this.customBoardId = null;
        this.activeBoardFurnitureId = item.id;
        const house = this.currentHouse() || view.ownHouse;
        const bId = this.boardId();
        this.expansion.boardRegistry.ensureBoard(
          bId,
          item.publicAlias || 'Pizarra de estudio',
          'house',
          house.ownerId || view.identity.fingerprint,
        );
        this.lastLayersSignature = '';
        this.lastBoardRenderSig = '';
        this.navigate('board');
        break;
      }
      case 'desk':
        this.expansion.openActivity('projects');
        break;
      case 'bookshelf':
        this.openStudyAiModal();
        break;
      case 'cabinet':
        this.closePhone(); this.expansion.closeModal(); this.stopMoving();
        this.wardrobe.open(view.identity);
        break;
      case 'frame':
        if (isOwn) {
          if (!this.aiSpritePromptInput.value.trim()) {
            this.aiSpritePromptInput.value = item.publicAlias || 'Montaña estrellada';
          }
          this.runFurnitureSpriteGenerator(item);
        } else {
          this.notify(`Cuadro${item.publicAlias ? ` «${item.publicAlias}»` : ''}: un recuerdo de quien vive aquí.`);
        }
        break;
      case 'table':
        this.openPhone('voice');
        break;
      case 'plant':
        if (isOwn) {
          if (!this.aiSpritePromptInput.value.trim()) {
            this.aiSpritePromptInput.value = item.publicAlias || 'Bonsái luminoso';
          }
          this.runFurnitureSpriteGenerator(item);
        } else {
          this.notify(`Has cuidado la planta 🌱${item.publicAlias ? ` (${item.publicAlias})` : ''} · Tu rincón de estudio se siente más vivo.`);
        }
        break;
    }
  }

  private buildStudyAiModal(): void {
    this.studyModalOverlay = node('div', 'sv-lock-overlay sv-ai-modal-overlay');
    this.studyModalOverlay.hidden = true;
    this.studyModalOverlay.dataset.testid = 'ai-study-modal';
    const card = node('section', 'sv-card sv-ai-modal-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Estudio IA de Librería: Tarjetas y Autoevaluación');

    const head = node('div', 'sv-ai-modal-head');
    const titleWrap = node('div');
    append(
      titleWrap,
      node('div', 'sv-eyebrow', 'LIBRERÍA DE ESTUDIO · IA LOCAL Y GEMINI'),
      node('h2', '', 'Tarjetas de Memoria y Autoevaluación'),
    );
    const closeBtn = button('Cerrar ×', 'sv-button sv-button-small');
    closeBtn.dataset.testid = 'ai-study-close-btn';
    closeBtn.addEventListener('click', () => {
      this.studyModalOverlay.hidden = true;
    });
    append(head, titleWrap, closeBtn);

    const controls = node('div', 'sv-ai-modal-controls');
    this.studyModalTopicInput = node('input', 'sv-input');
    this.studyModalTopicInput.placeholder = 'Tema de estudio (opcional, usa tus apuntes por defecto)…';
    this.studyModalTopicInput.maxLength = 90;
    this.studyModalTopicInput.setAttribute('aria-label', 'Tema para tarjetas y quiz');
    this.studyModalTopicInput.dataset.testid = 'ai-study-topic-input';
    const genBtn = button('✨ Generar Tarjetas y Quiz', 'sv-button sv-button-small sv-button-primary');
    genBtn.dataset.testid = 'ai-study-generate-btn';
    genBtn.addEventListener('click', () => this.refreshStudyAiPack());
    append(controls, this.studyModalTopicInput, genBtn);

    this.studyModalStatus = node('p', 'sv-subtle', 'Generando material activo a partir de tu cuaderno local…');
    this.studyFlashcardsWrap = node('div', 'sv-flashcard-grid');
    this.studyQuizWrap = node('div', 'sv-quiz-list');

    const footerActions = node('div', 'sv-inline sv-ai-modal-footer');
    const toBoardBtn = button('📌 Publicar resumen en pizarra', 'sv-button sv-button-small sv-button-primary');
    toBoardBtn.dataset.testid = 'ai-study-to-board-btn';
    toBoardBtn.addEventListener('click', () => {
      if (!this.currentStudyPack) return;
      this.studyModalOverlay.hidden = true;
      this.navigate('board');
      const cam = this.boardCamera();
      const pt = clampBoardPoint({
        x: Math.round(cam.x + 140 / cam.zoom),
        y: Math.round(cam.y + 110 / cam.zoom),
      });
      this.saveStroke({ points: [pt], tool: 'text', color: this.boardColor.value, width: 8 }, this.currentStudyPack.boardSummary);
      this.notify('Resumen de estudio publicado como nota adhesiva en la pizarra.');
    });
    const toEditorBtn = button('📝 Guardar en mis apuntes', 'sv-button sv-button-small');
    toEditorBtn.dataset.testid = 'ai-study-to-editor-btn';
    toEditorBtn.addEventListener('click', () => {
      if (!this.currentStudyPack) return;
      const pack = this.currentStudyPack;
      const md = [
        '',
        `## 📚 Tarjetas de repaso: ${pack.topic}`,
        ...pack.flashcards.map((c, idx) => `- **P${idx + 1}: ${c.front}**\n  R: ${c.back}`),
        '',
      ].join('\n');
      this.expansion.notesStore.createNote({ title: `Tarjetas: ${pack.topic}`, content: md.trim(), ownerId: 'local-owner' });
      this.studyModalOverlay.hidden = true;
      this.expansion.openActivity('notes');
      this.notify('Tarjetas guardadas como una página nueva en tus apuntes.');
    });
    append(footerActions, toBoardBtn, toEditorBtn);

    append(
      card,
      head,
      controls,
      this.studyModalStatus,
      node('h3', 'sv-section-title', 'Tarjetas de memoria (haz clic para girar)'),
      this.studyFlashcardsWrap,
      node('h3', 'sv-section-title', 'Autoevaluación rápida'),
      this.studyQuizWrap,
      footerActions,
    );
    this.studyModalOverlay.append(card);
    this.shell.append(this.studyModalOverlay);
  }

  private openStudyAiModal(): void {
    this.expansion.openModal('ollama_study');
  }

  private refreshStudyAiPack(): void {
    const content = this.expansion.notesStore.listNotes('local-owner')[0]?.content || this.view?.editorText || '';
    const topic = this.studyModalTopicInput.value.trim();
    setText(this.studyModalStatus, 'Analizando apuntes y generando tarjetas…');
    void generateBookshelfStudyPack({ content, topic }).then((pack) => {
      this.currentStudyPack = pack;
      setText(
        this.studyModalStatus,
        `Tema: «${pack.topic}» · ${pack.flashcards.length} tarjetas y ${pack.quiz.length} preguntas listas.`,
      );
      this.studyFlashcardsWrap.replaceChildren();
      for (const [idx, cardData] of pack.flashcards.entries()) {
        const cardBtn = button('', 'sv-flashcard');
        cardBtn.dataset.testid = `ai-flashcard-${idx}`;
        const badge = node('span', 'sv-eyebrow', `TARJETA ${idx + 1} · CLIC PARA GIRAR`);
        const frontEl = node('strong', 'sv-flashcard-front', cardData.front);
        const backEl = node('p', 'sv-flashcard-back', cardData.back);
        backEl.hidden = true;
        cardBtn.addEventListener('click', () => {
          const flipped = cardBtn.classList.toggle('is-flipped');
          backEl.hidden = !flipped;
          setText(badge, flipped ? `RESPUESTA ${idx + 1} · CLIC PARA OCULTAR` : `TARJETA ${idx + 1} · CLIC PARA GIRAR`);
        });
        append(cardBtn, badge, frontEl, backEl);
        this.studyFlashcardsWrap.append(cardBtn);
      }

      this.studyQuizWrap.replaceChildren();
      for (const [qIdx, q] of pack.quiz.entries()) {
        const qBox = node('div', 'sv-quiz-card');
        qBox.append(node('strong', 'sv-quiz-question', `${qIdx + 1}. ${q.question}`));
        const optsWrap = node('div', 'sv-quiz-options');
        const feedback = node('p', 'sv-quiz-feedback');
        feedback.hidden = true;
        for (const [optIdx, optText] of q.options.entries()) {
          const optBtn = button(optText, 'sv-button sv-button-small sv-quiz-option');
          optBtn.dataset.testid = `ai-quiz-${qIdx}-opt-${optIdx}`;
          optBtn.addEventListener('click', () => {
            const correct = optIdx === q.correctIndex;
            for (const child of Array.from(optsWrap.children)) {
              child.classList.remove('is-correct', 'is-wrong');
            }
            optBtn.classList.add(correct ? 'is-correct' : 'is-wrong');
            feedback.hidden = false;
            feedback.className = `sv-quiz-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
            setText(
              feedback,
              `${correct ? '✓ ¡Correcto!' : '✗ Revisa este punto:'} ${q.explanation}`,
            );
          });
          optsWrap.append(optBtn);
        }
        append(qBox, optsWrap, feedback);
        this.studyQuizWrap.append(qBox);
      }
    });
  }

  private runBoardAiLatex(): void {
    if (!this.canDrawBoard()) {
      this.notify('Entra en una casa para usar el asistente IA en su pizarra.');
      return;
    }
    if (this.aiBoardBusy) return;
    this.aiBoardBusy = true;
    const boardId = this.boardId();
    const visible = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    const textContext = visible
      .filter((s) => s.tool === 'text' && s.text)
      .map((s) => s.text!)
      .join(' ; ');
    const prompt = this.aiBoardPromptInput.value.trim();
    this.notify('✨ Convirtiendo pizarra a fórmula LaTeX…');

    void (async () => {
      try {
        let imagePngBase64: string | undefined;
        if (visible.length > 0) {
          try {
            const exportedCanvas = await renderBoardForExport(visible);
            imagePngBase64 = exportedCanvas.toDataURL('image/png');
          } catch {
            imagePngBase64 = undefined;
          }
        }
        const res = await recognizeBoardToLatex({ imagePngBase64, textContext, prompt });
        const cam = this.boardCamera();
        const existingCount = visible.length;
        const targetPt = clampBoardPoint({
          x: Math.round(cam.x + 280 / cam.zoom),
          y: Math.round(cam.y + (130 + (existingCount % 5) * 44) / cam.zoom),
        });
        this.saveStroke(
          { points: [targetPt], tool: 'text', color: this.boardColor.value, width: 4 },
          res.latex,
        );
        this.boardExtraFrames = 4;
        this.notify(`✨ ${res.summary} (${res.latex})`);
      } finally {
        this.aiBoardBusy = false;
      }
    })();
  }

  private runBoardAiTutor(mode: 'steps' | 'hint'): void {
    if (!this.canDrawBoard()) {
      this.notify('Entra en una casa para usar el tutor IA en su pizarra.');
      return;
    }
    if (this.aiBoardBusy) return;
    this.aiBoardBusy = true;
    const boardId = this.boardId();
    const visible = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    const strokesText = visible
      .filter((s) => s.tool === 'text' && s.text)
      .map((s) => s.text!);
    const prompt = this.aiBoardPromptInput.value.trim();
    this.notify(mode === 'steps' ? '✨ Generando explicación paso a paso en la pizarra…' : '💡 Generando pista en la pizarra…');

    void (async () => {
      try {
        const res = await generateBoardTutorSteps({ strokesText, mode, prompt });
        const cam = this.boardCamera();
        const baseX = Math.round(cam.x + 420 / cam.zoom);
        const baseY = Math.round(cam.y + 84 / cam.zoom);
        if (mode === 'hint') {
          const pt = clampBoardPoint({ x: baseX, y: baseY });
          this.saveStroke({ points: [pt], tool: 'text', color: '#315f51', width: 8 }, res.hint);
          this.boardExtraFrames = 4;
          this.notify('💡 Pista añadida como nota adhesiva en tu capa de la pizarra.');
        } else {
          res.steps.forEach((stepText, idx) => {
            const pt = clampBoardPoint({
              x: baseX,
              y: baseY + idx * Math.round(86 / cam.zoom),
            });
            this.saveStroke({ points: [pt], tool: 'text', color: BOARD_COLORS[idx % BOARD_COLORS.length], width: 8 }, stepText);
          });
          this.boardExtraFrames = 4;
          this.notify(`✨ Se añadieron ${res.steps.length} notas paso a paso en la pizarra.`);
        }
      } finally {
        this.aiBoardBusy = false;
      }
    })();
  }

  private runFurnitureSpriteGenerator(targetItem?: Furniture): void {
    const view = this.view;
    if (!view) return;
    const item = targetItem || view.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId) || view.ownHouse.furniture[0];
    if (!item) {
      this.notify('Selecciona un mueble en Mi casa para generarle un sprite pixel-art.');
      return;
    }
    const prompt = this.aiSpritePromptInput?.value.trim() || item.publicAlias || `${FURNITURE_LABELS[item.kind]} de estudio`;
    this.notify(`✨ Sintetizando sprite pixel-art para ${FURNITURE_LABELS[item.kind]}…`);
    void generateFurniturePixelSprite({ kind: item.kind, prompt }).then(({ grid, dataUrl }) => {
      if (item.kind === 'board') {
        const bId = houseBoardId('own', item.id);
        this.expansion.boardRegistry.ensureBoard(bId, item.publicAlias || 'Pizarra de estudio', 'house', view.identity.fingerprint);
        this.expansion.boardRegistry.setBoardSprite(bId, dataUrl, view.identity.fingerprint, true);
      } else {
        setFurnitureCustomSprite(item.kind, dataUrl);
      }
      if (this.aiSpritePreview) {
        this.aiSpritePreview.src = dataUrl;
        this.aiSpritePreview.hidden = false;
      }
      this.lastStageRenderSig = '';
      this.notify(`✨ Sprite pixel-art «${grid.label}» aplicado a ${FURNITURE_LABELS[item.kind]}.`);
    });
  }

  private run(action: () => void | Promise<void>): void {
    try { void Promise.resolve(action()).catch((error: unknown) => this.notify(this.errorMessage(error))); }
    catch (error) { this.notify(this.errorMessage(error)); }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'No se pudo completar la acción.';
  }

  private notify(message: string): void {
    this.localNotice = message;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.noticeTimer = null; if (this.localNotice === message) { this.localNotice = null; this.refresh(); } }, 6_000);
    this.refresh();
  }

  private canvasPoint(event: MouseEvent, canvas: HTMLCanvasElement): BoardPoint {
    const rect = canvas.getBoundingClientRect();
    // Map client coordinates to the logical 768x432 coordinate system even when physical bitmap is 2x HiDPI (1536x864)
    return {
      x: (event.clientX - rect.left) * 768 / (rect.width || 768),
      y: (event.clientY - rect.top) * 432 / (rect.height || 432),
    };
  }

  private isTouchDevice(): boolean {
    if (this.touchControlsForced !== null) return this.touchControlsForced;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.innerWidth <= 840;
  }

  private refreshTouchControls(): void {
    if (!this.touchControlsRoot) return;
    const show = this.isTouchDevice();
    this.touchControlsRoot.style.display = show ? 'flex' : 'none';
    if (this.touchToggleBtn) {
      this.touchToggleBtn.classList.toggle('is-active', show);
    }
    if (this.touchPttBtn) {
      this.touchPttBtn.hidden = !Boolean(this.view?.network.media.pushToTalk && this.view?.network.media.micEnabled);
    }
  }

  private triggerInteraction(): void {
    if (!this.view) return;
    if (this.decorating) return;
    try { navigator.vibrate?.(15); } catch {}
    if (this.pane === 'world') {
      const portal = closestPortal(this.currentArea, this.localPosition);
      if (portal && closestPortal(this.currentArea, this.localPosition)?.id === portal.id) {
        this.changeWorldArea(portal.toArea, portal.spawnAtTarget);
        this.notify(`Entrando en ${WORLD_AREAS[portal.toArea].displayName}…`);
        return;
      }
      if (this.currentArea === 'residential') {
        const closest = closestDoor(this.localPosition, occupiedParcels(this.view));
        if (closest) {
          this.openHouse(closest.ownerId);
          return;
        }
      }
      const nearObj = this.expansion.objectRegistry.closestInteractable(
        this.currentArea,
        this.localPosition.x,
        this.localPosition.y,
        this.view.identity.fingerprint,
      );
      if (nearObj) {
        this.expansion.interactWithWorldObject(nearObj);
        return;
      }
      this.notify(
        this.currentArea === 'residential'
          ? 'Acércate a la puerta de una casa o a un portal lateral para entrar.'
          : 'Acércate a una estación interactiva o portal y pulsa E.',
      );
    } else if (this.pane === 'house') {
      if (atHouseDoor(this.localPosition)) {
        this.leaveCurrentHouse();
      } else {
        const house = this.currentHouse() || this.view.ownHouse;
        const near = closestFurniture(this.localPosition, house);
        if (near) {
          this.interactWithFurniture(near);
        } else {
          this.notify('Acércate a un mueble o a la puerta para interactuar.');
        }
      }
    }
  }

  private updateTouchActionPrompt(prompt: string | null): void {
    if (!this.touchActionBtn) return;
    if (prompt) {
      this.touchActionBtn.classList.add('is-active-prompt');
      if (prompt.includes('Entrar')) {
        setText(this.touchActionIcon, '🚪');
        setText(this.touchActionLabel, 'Entrar');
      } else if (prompt.includes('Salir')) {
        setText(this.touchActionIcon, '🚪');
        setText(this.touchActionLabel, 'Salir');
      } else if (prompt.includes('Pizarra')) {
        setText(this.touchActionIcon, '📋');
        setText(this.touchActionLabel, 'Pizarra');
      } else if (prompt.includes('Quiz') || prompt.includes('Estantería')) {
        setText(this.touchActionIcon, '📚');
        setText(this.touchActionLabel, 'Quiz AI');
      } else if (prompt.includes('Planificar') || prompt.includes('Escritorio')) {
        setText(this.touchActionIcon, '🪑');
        setText(this.touchActionLabel, 'Estudiar');
      } else {
        setText(this.touchActionIcon, '⚡');
        setText(this.touchActionLabel, prompt.replace(/^E · /, ''));
      }
    } else {
      this.touchActionBtn.classList.remove('is-active-prompt');
      setText(this.touchActionIcon, '⚡');
      setText(this.touchActionLabel, 'E · Usar');
    }
  }

  private buildTouchControls(stageWrap: HTMLElement): void {
    this.touchControlsRoot = node('div', 'sv-touch-controls');
    this.touchControlsRoot.id = 'sv-touch-controls';

    // D-Pad
    const dpad = node('div', 'sv-dpad');
    dpad.setAttribute('role', 'group');
    dpad.setAttribute('aria-label', 'Cruceta de movimiento táctil');
    this.touchDpad = dpad;

    const upBtn = button('▲', 'sv-dpad-btn sv-dpad-up');
    upBtn.setAttribute('aria-label', 'Mover arriba');
    const middleRow = node('div', 'sv-dpad-middle');
    const leftBtn = button('◀', 'sv-dpad-btn sv-dpad-left');
    leftBtn.setAttribute('aria-label', 'Mover izquierda');
    const centerPad = node('div', 'sv-dpad-center');
    const rightBtn = button('▶', 'sv-dpad-btn sv-dpad-right');
    rightBtn.setAttribute('aria-label', 'Mover derecha');
    append(middleRow, leftBtn, centerPad, rightBtn);

    const downBtn = button('▼', 'sv-dpad-btn sv-dpad-down');
    downBtn.setAttribute('aria-label', 'Mover abajo');

    append(dpad, upBtn, middleRow, downBtn);

    let activeDpadPointer: number | null = null;
    const updateDpad = (clientX: number, clientY: number) => {
      const rect = dpad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const deadzone = 12;

      this.dpadKeys.clear();
      this.moveTarget = null; // direct D-pad cancels tap-to-walk

      if (Math.hypot(dx, dy) >= deadzone) {
        if (dy < -deadzone) this.dpadKeys.add('arrowup');
        if (dy > deadzone) this.dpadKeys.add('arrowdown');
        if (dx < -deadzone) this.dpadKeys.add('arrowleft');
        if (dx > deadzone) this.dpadKeys.add('arrowright');
      }

      upBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowup'));
      downBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowdown'));
      leftBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowleft'));
      rightBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowright'));
    };

    dpad.addEventListener('pointerdown', (e) => {
      activeDpadPointer = e.pointerId;
      try { dpad.setPointerCapture(e.pointerId); } catch {}
      updateDpad(e.clientX, e.clientY);
      try { navigator.vibrate?.(10); } catch {}
      e.preventDefault();
      e.stopPropagation();
    });

    dpad.addEventListener('pointermove', (e) => {
      if (activeDpadPointer === e.pointerId) {
        updateDpad(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
      }
    });

    const stopDpad = (e: PointerEvent) => {
      if (activeDpadPointer === e.pointerId) {
        activeDpadPointer = null;
        this.dpadKeys.clear();
        upBtn.classList.remove('is-pressed');
        downBtn.classList.remove('is-pressed');
        leftBtn.classList.remove('is-pressed');
        rightBtn.classList.remove('is-pressed');
        try { if (dpad.hasPointerCapture(e.pointerId)) dpad.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    dpad.addEventListener('pointerup', stopDpad);
    dpad.addEventListener('pointercancel', stopDpad);

    // Touch Action Cluster
    const actions = node('div', 'sv-touch-actions');

    this.touchActionBtn = button('', 'sv-touch-action-btn sv-touch-btn-action');
    this.touchActionBtn.setAttribute('aria-label', 'Interactuar');
    this.touchActionBtn.dataset.testid = 'touch-action-btn';
    this.touchActionIcon = node('span', 'sv-touch-btn-icon', '⚡');
    this.touchActionLabel = node('span', 'sv-touch-btn-label', 'E · Usar');
    append(this.touchActionBtn, this.touchActionIcon, this.touchActionLabel);
    this.touchActionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerInteraction();
    });

    this.touchPttBtn = button('', 'sv-touch-action-btn sv-touch-btn-ptt');
    this.touchPttBtn.setAttribute('aria-label', 'Pulsar para hablar');
    const pttIcon = node('span', 'sv-touch-btn-icon', '🎙️');
    const pttLabel = node('span', 'sv-touch-btn-label', 'PTT');
    append(this.touchPttBtn, pttIcon, pttLabel);
    this.touchPttBtn.hidden = true;

    this.touchPttBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.view?.network.media.pushToTalk) {
        this.actions.setTalking(true);
        this.touchPttBtn.classList.add('is-talking');
        try { navigator.vibrate?.(12); } catch {}
      }
    });
    const releasePtt = (e: PointerEvent) => {
      if (this.view?.network.media.pushToTalk) {
        this.actions.setTalking(false);
        this.touchPttBtn.classList.remove('is-talking');
      }
    };
    this.touchPttBtn.addEventListener('pointerup', releasePtt);
    this.touchPttBtn.addEventListener('pointercancel', releasePtt);

    const sprint = button('Correr', 'sv-touch-action-btn');
    sprint.setAttribute('aria-label', 'Mantener para correr');
    sprint.addEventListener('pointerdown', event => { this.touchSprint = true; sprint.setPointerCapture(event.pointerId); event.preventDefault(); });
    sprint.addEventListener('pointerup', () => { this.touchSprint = false; });
    sprint.addEventListener('pointercancel', () => { this.touchSprint = false; });
    sprint.addEventListener('lostpointercapture', () => { this.touchSprint = false; });
    append(actions, sprint, this.touchPttBtn, this.touchActionBtn);
    append(this.touchControlsRoot, dpad, actions);

    // Floating toggle button on stage
    this.touchToggleBtn = button('Mostrar u ocultar controles táctiles', 'sv-button');
    this.touchToggleBtn.setAttribute('aria-label', 'Alternar controles táctiles en pantalla');
    this.touchToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.touchControlsForced = !this.isTouchDevice();
      this.refreshTouchControls();
      this.notify(this.touchControlsForced ? 'Controles táctiles activados' : 'Controles táctiles ocultados');
    });

    append(stageWrap, this.touchControlsRoot);
    append(this.settingsContent, node('h3', '', 'Controles'), this.touchToggleBtn);
    this.refreshTouchControls();
  }

  /** What a click on the stage would use, and where to stand to use it. */
  private interactionAt(point: BoardPoint): Interaction | null {
    const view = this.view!;
    if (this.pane === 'world') {
      const portal = WORLD_AREAS[this.currentArea].portals.find((p) => pointInRect(point.x, point.y, p.rect));
      if (portal) {
        return {
          x: portal.rect.x + portal.rect.w / 2, y: portal.rect.y + portal.rect.h / 2,
          near: () => closestPortal(this.currentArea, this.localPosition)?.id === portal.id,
          run: () => { this.changeWorldArea(portal.toArea, portal.spawnAtTarget); this.notify(`Entrando en ${WORLD_AREAS[portal.toArea].displayName}…`); },
        };
      }
      if (this.currentArea === 'residential') {
        const item = occupiedParcels(view).find((candidate) => pointInRect(point.x, point.y, candidate.parcel));
        if (!item) return null;
        const top = item.parcel.doorY < 200;
        return {
          x: item.parcel.doorX, y: item.parcel.doorY + (top ? 14 : -14),
          near: () => closestDoor(this.localPosition, occupiedParcels(this.view!))?.ownerId === item.ownerId,
          run: () => this.openHouse(item.ownerId),
        };
      }
      const obj = this.expansion.objectRegistry.hitTest(this.currentArea, point.x, point.y, view.identity.fingerprint);
      if (!obj) return null;
      const bounds = WORLD_AREAS[this.currentArea].bounds;
      const below = obj.y + obj.h + 14;
      return {
        x: obj.x + obj.w / 2,
        y: below <= bounds.y + bounds.h - 12 ? below : obj.y - 14,
        near: () => this.expansion.objectRegistry.closestInteractable(this.currentArea, this.localPosition.x, this.localPosition.y, this.view!.identity.fingerprint)?.id === obj.id,
        run: () => this.expansion.interactWithWorldObject(obj),
      };
    }
    if (this.pane !== 'house') return null;
    const house = this.currentHouse();
    if (!house) return null;
    if (point.y >= 384 && point.x >= 340 && point.x <= 428) {
      return { x: HOUSE_DOOR.x, y: HOUSE_DOOR.y - 14, near: () => atHouseDoor(this.localPosition), run: () => this.leaveCurrentHouse() };
    }
    const item = hitFurniture(house, point.x, point.y);
    if (!item) return null;
    const rect = furnitureRect(item);
    const below = rect.y + rect.h + 12;
    return {
      x: rect.x + rect.w / 2, y: below < 396 ? below : rect.y - 12,
      near: () => closestFurniture(this.localPosition, this.currentHouse() || house)?.id === item.id,
      run: () => this.interactWithFurniture(item),
    };
  }

  /** Use it now if close enough, otherwise walk there first. */
  private interactOrWalk(target: Interaction): void {
    if (target.near()) { this.pendingInteraction = null; this.moveTarget = null; target.run(); return; }
    if (this.walkTo(target.x, target.y)) this.pendingInteraction = target;
  }

  /** Walks around trees, fences and furniture to a point; false when there is no way there. */
  private walkTo(x: number, y: number): boolean {
    const view = this.view;
    if (!view) return false;
    const house = this.pane === 'house' ? this.currentHouse() || view.ownHouse : null;
    const obstacles = house ? houseObstacles(house)
      : this.currentArea === 'residential' ? worldObstacles(occupiedParcels(view)) : this.expansion.objectRegistry.obstaclesForArea(this.currentArea);
    const path = findPath(this.localPosition, { x, y }, obstacles, house ? HOUSE_BOUNDS : WORLD_AREAS[this.currentArea].bounds);
    if (!path) { this.notify('No hay camino hasta ahí.'); return false; }
    this.moveTarget = path.shift() ?? { x, y };
    this.movePath = path;
    return true;
  }

  private onStagePointerDown = (event: PointerEvent): void => {
    const view = this.view;
    if (!view || this.settingsDialog.open || this.activityOpen || this.wardrobe.isOpen()) return;
    if (!this.phone.hidden) { this.closePhone(); return; }
    const point = this.canvasPoint(event, this.stageCanvas);
    if (this.decorating && this.pendingFurniture && this.pane === 'house') {
      this.previewNewFurniture(point.x, point.y);
      if (this.previewHouse && !this.decorationInvalid) { const item = this.previewHouse.furniture.at(-1)!; if (this.commitDecoration(this.previewHouse, item.id)) { this.pendingFurniture = null; this.previewHouse = null; } }
      else this.notify(this.decorationInvalid || 'Elige una posición libre.');
      return;
    }
    const allowTapMove = event.pointerType === 'touch' || this.touchControlsForced === true;
    const target = this.interactionAt(point);
    if (this.pane === 'house') {
      const house = this.currentHouse();
      const item = house ? hitFurniture(house, point.x, point.y) : null;
      this.selectedFurnitureId = item?.id || null;
      this.refreshHouseEditor();
      // Furniture moves only while explicitly decorating.
      if (this.decorating && item && house && house.ownerId === view.identity.fingerprint) {
        this.drag = { id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y, baseHouse: house };
        this.dragMoved = false;
        this.stageCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    if (this.decorating) return;
    if (target) { this.interactOrWalk(target); return; }
    if (allowTapMove) { this.pendingInteraction = null; this.walkTo(point.x, point.y); }
  };

  private onStagePointerMove = (event: PointerEvent): void => {
    if (this.decorating && this.pendingFurniture) { const p = this.canvasPoint(event, this.stageCanvas); this.previewNewFurniture(p.x, p.y); return; }
    if (!this.drag || !this.view) return;
    const point = this.canvasPoint(event, this.stageCanvas);
    const snap = (n: number) => this.decorationGrid ? Math.round(n / 8) * 8 : n;
    const x = snap(point.x - this.drag.offsetX);
    const y = snap(point.y - this.drag.offsetY);
    const item = this.drag.baseHouse.furniture.find((f) => f.id === this.drag!.id);
    if (!this.dragMoved && item && Math.hypot(item.x - x, item.y - y) < 4) return;
    this.dragMoved = true;
    this.previewHouse = moveFurniture(this.drag.baseHouse, this.drag.id, x, y, this.view.identity.fingerprint);
    this.decorationInvalid = placementError(this.previewHouse, this.drag.id);
  };

  private onStagePointerUp = (event: PointerEvent): void => {
    if (!this.drag) return;
    if (this.stageCanvas.hasPointerCapture(event.pointerId)) this.stageCanvas.releasePointerCapture(event.pointerId);
    const clicked = !this.dragMoved && event.type === 'pointerup';
    if (event.type === 'pointerup' && this.previewHouse && this.previewHouse !== this.drag.baseHouse) this.commitDecoration(this.previewHouse, this.drag.id);
    this.previewHouse = null;
    this.drag = null;
    if (clicked && !this.decorating) {
      const target = this.interactionAt(this.canvasPoint(event, this.stageCanvas));
      if (target) this.interactOrWalk(target);
    }
  };

  private onBoardPointerDown = (event: PointerEvent): void => {
    this.activeBoardPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (this.activeBoardPointers.size >= 2) {
      if (this.boardDraft && this.boardDraft.points.length <= 2) {
        this.boardDraft = null;
      }
      const pts = Array.from(this.activeBoardPointers.values());
      this.lastPinchDistance = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      return;
    }
    // Middle button, or the hand tool, pans. Panning never needs permission,
    // so you can look around a friend's board you are not allowed to edit.
    if (event.button === 1 || (this.boardTool === 'hand' && event.button === 0)) {
      this.boardPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      this.boardCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (!this.canDrawBoard()) return;
    const point = clampBoardPoint(this.boardWorldPoint(event));
    if (this.boardTool === 'eraser') {
      this.boardErasing = event.pointerId;
      this.boardCanvas.setPointerCapture(event.pointerId);
      this.eraseAt(point);
      event.preventDefault();
      return;
    }
    if (boardAtCapacity(this.allStrokes(this.boardId()), this.boardId())) return;
    if (this.richBoardTool) {
      this.richBoardDraft = { kind: this.richBoardTool, start: point, current: point };
      this.boardCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (this.boardTool === 'text') {
      event.preventDefault();
      this.openBoardText(point);
      return;
    }
    const tool = this.boardTool;
    if (tool === 'hand') return;
    this.boardDraft = { points: [point], tool, color: this.boardColor.value, width: Number(this.boardWidth.value) };
    this.boardCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private onBoardPointerMove = (event: PointerEvent): void => {
    if (this.activeBoardPointers.has(event.pointerId)) {
      this.activeBoardPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    if (this.activeBoardPointers.size >= 2) {
      const pts = Array.from(this.activeBoardPointers.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const midX = (pts[0].clientX + pts[1].clientX) / 2;
      const midY = (pts[0].clientY + pts[1].clientY) / 2;
      const localMid = this.canvasPoint({ clientX: midX, clientY: midY } as MouseEvent, this.boardCanvas);

      if (this.lastPinchDistance > 8 && dist > 8) {
        const factor = dist / this.lastPinchDistance;
        this.setBoardCamera(zoomAt(this.boardCamera(), localMid.x, localMid.y, factor));
      }
      this.lastPinchDistance = dist;
      return;
    }

    this.boardCursor = this.canvasPoint(event, this.boardCanvas);
    if (this.boardPan && event.pointerId === this.boardPan.pointerId) {
      const scale = 768 / (this.boardCanvas.clientWidth || 768);
      this.setBoardCamera(panBy(this.boardCamera(), (event.clientX - this.boardPan.x) * scale, (event.clientY - this.boardPan.y) * scale));
      this.boardPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (this.boardErasing === event.pointerId) { this.eraseAt(clampBoardPoint(this.boardWorldPoint(event))); return; }
    if (this.richBoardDraft) {
      this.richBoardDraft.current = clampBoardPoint(this.boardWorldPoint(event));
      this.boardExtraFrames = 2;
      return;
    }
    if (!this.boardDraft) return;
    const point = clampBoardPoint(this.boardWorldPoint(event));
    const points = this.boardDraft.points;
    if (this.boardDraft.tool === 'pen') {
      const last = points[points.length - 1];
      const minStep = 2 / this.boardCamera().zoom;
      if (points.length < LIMITS.strokePoints && Math.hypot(point.x - last.x, point.y - last.y) >= minStep) points.push(point);
    } else points[1] = point;
  };

  private onBoardPointerUp = (event: PointerEvent): void => {
    this.activeBoardPointers.delete(event.pointerId);
    if (this.activeBoardPointers.size < 2) {
      this.lastPinchDistance = 0;
    }
    if (this.boardCanvas.hasPointerCapture(event.pointerId)) this.boardCanvas.releasePointerCapture(event.pointerId);
    if (this.boardPan?.pointerId === event.pointerId) { this.boardPan = null; return; }
    if (this.boardErasing === event.pointerId) { this.boardErasing = null; return; }
    if (this.richBoardDraft && this.view) {
      const rDraft = this.richBoardDraft;
      this.richBoardDraft = null;
      this.expansion.boardRegistry.addRichElement(
        this.boardId(),
        this.view.identity.fingerprint,
        this.view.identity.displayName,
        rDraft.kind,
        this.boardColor.value,
        Number(this.boardWidth.value),
        [rDraft.start, rDraft.current],
        undefined,
        this.view.network.isHost,
      );
      this.boardExtraFrames = 3;
      this.refreshBoardControls();
      return;
    }
    const draft = this.boardDraft;
    if (!draft) return;
    this.boardDraft = null;
    this.saveStroke(draft);
  };

  private onBoardWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const local = this.canvasPoint(event, this.boardCanvas);
    // Ctrl+wheel is also what a trackpad pinch sends, so it zooms; a plain
    // wheel or two-finger swipe pans, as in other infinite canvases.
    if (event.ctrlKey || event.metaKey) {
      this.setBoardCamera(zoomAt(this.boardCamera(), local.x, local.y, Math.exp(-event.deltaY * 0.0025)));
    } else {
      const scale = 768 / (this.boardCanvas.clientWidth || 768);
      this.setBoardCamera(panBy(this.boardCamera(), -event.deltaX * scale, -event.deltaY * scale));
    }
  };

  /** Turns a finished draft into a stroke and sends or stores it. */
  private saveStroke(draft: { points: BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number }, text?: string): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const existing = this.allStrokes(boardId);
    if (boardAtCapacity(existing, boardId)) return;
    const online = view.network.phase === 'JOINED';
    const stroke = makeStroke(
      boardId,
      view.identity.fingerprint,
      nextSequence(existing, view.identity.fingerprint, boardId),
      draft.tool,
      draft.color,
      draft.width,
      draft.points,
      undefined,
      text,
    );
    // Persist immediately per independent whiteboard ID
    this.expansion.boardRegistry.saveStroke(boardId, stroke);
    const isPrimaryHouseBoard = !this.customBoardId && (this.activeBoardFurnitureId || 'board') === 'board';
    if (online && isPrimaryHouseBoard) {
      this.pendingStrokes.push(stroke);
      const wireBoardId = this.houseOwnerId || view.identity.fingerprint;
      this.run(() => this.actions.sendStroke({ ...stroke, boardId: wireBoardId }));
    } else {
      this.offlineStrokes.push(stroke);
    }
    this.lastBoardRenderSig = '';
    this.boardExtraFrames = 3;
    this.refreshBoardControls();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.view || this.settingsDialog.open || this.wardrobe.isOpen() || this.view.lockedIdentity) return;
    const key = event.key.toLowerCase();
    if (this.decorating && key === 'escape') { if (this.pendingFurniture || this.drag || this.previewHouse) { this.pendingFurniture = null; this.drag = null; this.previewHouse = null; this.decorationInvalid = null; } else this.endDecoration(); event.preventDefault(); return; }
    if (this.decorating) return;
    if (key === 'escape' && this.activityOpen && !this.isTypingTarget(event.target)) { this.expansion.closeModal(); event.preventDefault(); return; }
    if (key === 'escape' && !this.phone.hidden) { this.closePhone(); event.preventDefault(); return; }
    if (this.isTypingTarget(event.target) || this.activityOpen) return;
    if (key === 'm' && !event.repeat && !event.ctrlKey && !event.metaKey) {
      if (this.phone.hidden) this.openPhone('home'); else this.closePhone();
      event.preventDefault();
      return;
    }
    if (!this.phone.hidden) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift'].includes(key)) {
      this.keys.add(key);
      if (this.pane === 'world' || this.pane === 'house') event.preventDefault();
    }
    if (key === 'e' && !event.repeat) {
      this.triggerInteraction();
    }
    if (event.code === 'Space' && this.view.network.media.pushToTalk && this.view.network.media.micEnabled && !event.repeat) {
      this.actions.setTalking(true);
      event.preventDefault();
    }
    if (key === 'escape' && this.pane === 'board' && !this.boardAdvancedPanel.hidden) {
      this.boardAdvancedPanel.hidden = true;
      this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
      this.boardAdvancedToggle.focus();
      event.preventDefault();
      return;
    }
    // Escape steps back one level: board -> room, room -> village.
    if (key === 'escape' && this.pane === 'board' && this.houseOwnerId) this.returnToRoom();
    else if (key === 'escape' && (this.pane === 'house' || this.pane === 'board')) this.leaveCurrentHouse();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    if (event.code === 'Space' && this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    if (this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
  }

  private lastStageRenderSig = '';
  private lastBoardRenderSig = '';
  private boardExtraFrames = 0;

  private tick = (now: number): void => {
    if (document.hidden || (this.lastFrame && now - this.lastFrame < 1000 / 61)) {
      if (document.hidden) this.lastFrame = now;
      this.raf = requestAnimationFrame(this.tick); return;
    }
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    advanceAnim(dt);
    const view = this.view;
    if (view && (this.pane === 'world' || this.pane === 'house')) {
      let vx = Number(this.keys.has('d') || this.keys.has('arrowright') || this.dpadKeys.has('arrowright'))
        - Number(this.keys.has('a') || this.keys.has('arrowleft') || this.dpadKeys.has('arrowleft'));
      let vy = Number(this.keys.has('s') || this.keys.has('arrowdown') || this.dpadKeys.has('arrowdown'))
        - Number(this.keys.has('w') || this.keys.has('arrowup') || this.dpadKeys.has('arrowup'));

      if (this.phone.hidden === false || this.activityOpen || this.decorating || this.wardrobe.isOpen()) {
        vx = 0; vy = 0;
      }
      if (!this.moveTarget) this.movePath = [];
      if (vx !== 0 || vy !== 0) {
        this.moveTarget = null;
        this.movePath = [];
        this.pendingInteraction = null;
      } else if (this.moveTarget) {
        let dx = this.moveTarget.x - this.localPosition.x;
        let dy = this.moveTarget.y - this.localPosition.y;
        // Reaching a corner turns straight to the next one.
        if (Math.hypot(dx, dy) < 6 && this.movePath.length) {
          this.moveTarget = this.movePath.shift()!;
          dx = this.moveTarget.x - this.localPosition.x;
          dy = this.moveTarget.y - this.localPosition.y;
        }
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
          this.moveTarget = null;
        } else {
          vx = dx / dist;
          vy = dy / dist;
        }
      }

      const running = (this.keys.has('shift') || this.touchSprint) && this.phone.hidden && !this.activityOpen;
      const vector = { x: vx, y: vy };
      const previous = this.localPosition;
      const areaMeta = WORLD_AREAS[this.currentArea];
      const worldObs = this.currentArea === 'residential'
        ? worldObstacles(occupiedParcels(view))
        : this.expansion.objectRegistry.obstaclesForArea(this.currentArea);
      const next = this.pane === 'world'
        ? stepPosition(previous, vector, dt, worldObs, areaMeta.bounds, running ? 275 : 110)
        : stepHousePosition(previous, vector, dt, this.currentHouse() || view.ownHouse, running ? 2.5 : 1);

      if (this.moveTarget && Math.hypot(next.x - previous.x, next.y - previous.y) < 0.01 && dt > 0) {
        this.moveTarget = null;
      }

      this.localPosition = next;
      if (!this.moveTarget && this.pendingInteraction) {
        const arrived = this.pendingInteraction;
        this.pendingInteraction = null;
        if (arrived.near()) arrived.run();
        else this.notify('No llego hasta ahí. Acércate caminando y vuelve a intentarlo.');
      }
      if (view.network.phase === 'JOINED' && (next.x !== previous.x || next.y !== previous.y || next.moving !== previous.moving)
        && (now - this.lastMoveSent > 80 || !next.moving)) {
        this.lastMoveSent = now;
        this.actions.move({ ...next, areaId: this.currentArea });
      }
      const people = this.visiblePeople(view);
      const sceneLabel = this.pane === 'house' ? 'Interior de la casa' : WORLD_AREAS[this.currentArea].displayName;
      this.stageCanvas.setAttribute('aria-label', `${sceneLabel} · Personas aquí: ${people.map(person => person.identity.displayName).join(', ')}`);
      const activeHouse = this.previewHouse || this.currentHouse() || view.ownHouse;
      const occupied = occupiedParcels(view);
      const calm = reducedMotion();
      this.expansion.environment.tick(dt);
      const envState = this.expansion.environment.getState();
      const anyMoving = people.some((p) => p.position.moving) || !!this.moveTarget
        || envState.cycleMode === 'auto' || envState.weather !== 'clear';
      const stageSig = calm && !anyMoving
        ? JSON.stringify([this.pane, this.currentArea, envState.timeOfDay, envState.weather, this.selectedFurnitureId, activeHouse, occupied.map((o) => [o.ownerId, o.house.revision]), people, getAvatarCustomization()])
        : '';
      if (!calm || anyMoving || stageSig !== this.lastStageRenderSig) {
        this.lastStageRenderSig = stageSig;
        const ctx = this.stageCanvas.getContext('2d');
        if (ctx) {
          const scaleX = this.stageCanvas.width / 768;
          const scaleY = this.stageCanvas.height / 432;
          ctx.save();
          ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
          const nearFurniture = this.pane === 'house' && !atHouseDoor(this.localPosition)
            ? closestFurniture(this.localPosition, activeHouse)
            : null;
          const nearWorldObj = this.pane === 'world'
            ? this.expansion.objectRegistry.closestInteractable(this.currentArea, this.localPosition.x, this.localPosition.y, view.identity.fingerprint)
            : null;
          const nearPortal = this.pane === 'world'
            ? closestPortal(this.currentArea, this.localPosition)
            : null;
          if (this.pane === 'world') {
            if (this.currentArea === 'residential') {
              drawWorld(ctx, occupied, people, dt);
            } else if (this.currentArea === 'community') {
              drawCommunityPlaza(
                ctx,
                people,
                this.expansion.objectRegistry,
                nearWorldObj?.id || null,
                null,
                nearPortal?.id || null,
                dt,
              );
            } else {
              drawStudyLibrary(
                ctx,
                people,
                this.expansion.objectRegistry,
                nearWorldObj?.id || null,
                null,
                nearPortal?.id || null,
                dt,
              );
            }
            this.expansion.environment.drawAtmosphere(
              ctx,
              768,
              432,
              areaMeta.lampPositions,
              areaMeta.isInterior,
            );
          } else {
            const isOwnHouse = !this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint;
            const scope = isOwnHouse ? 'own' : activeHouse.ownerId;
            const perItemSprites = new Map<string, HTMLImageElement | null>();
            for (const f of activeHouse.furniture) {
              if (f.kind === 'board') {
                const bSprite = this.expansion.boardRegistry.getDecodedBoardSprite(houseBoardId(scope, f.id));
                if (bSprite) perItemSprites.set(f.id, bSprite);
              }
            }
            drawHouseInterior(ctx, activeHouse, people, this.selectedFurnitureId, dt, this.decorating ? null : nearFurniture?.id || null, perItemSprites);
            if (this.decorating) {
              if (this.decorationGrid) { ctx.save(); ctx.fillStyle = '#ffffff55'; for (let x = HOUSE_BOUNDS.x; x < 740; x += 8) for (let y = HOUSE_BOUNDS.y; y < 406; y += 8) ctx.fillRect(x, y, 1, 1); ctx.restore(); }
              const candidate = this.previewHouse?.furniture.find(f => f.id === (this.drag?.id || this.previewHouse?.furniture.at(-1)?.id));
              if (candidate) { const r = furnitureRect(candidate); ctx.save(); ctx.fillStyle = this.decorationInvalid ? '#d8444450' : '#59b87140'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = this.decorationInvalid ? '#b52828' : '#387e45'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
            }
          }
          if (this.moveTarget) {
            ctx.save();
            ctx.strokeStyle = '#e0724c';
            ctx.fillStyle = 'rgba(224, 114, 76, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.moveTarget.x, this.moveTarget.y, 6 + Math.sin(now / 120) * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          const prompt = this.pane === 'world'
            ? nearPortal
              ? nearPortal.prompt
              : this.currentArea === 'residential' && closestDoor(this.localPosition, occupied)
                ? 'E · Entrar'
                : nearWorldObj
                  ? `E · ${nearWorldObj.displayName}`
                  : null
            : atHouseDoor(this.localPosition)
              ? 'E · Salir'
              : nearFurniture
                ? FURNITURE_PROMPT_LABELS[nearFurniture.kind]
                : null;
          if (prompt) drawPrompt(ctx, this.localPosition.x, this.localPosition.y - 66, prompt);
          this.updateTouchActionPrompt(prompt);
          ctx.restore();
        }
      }
    }
    if (view && this.pane === 'board') {
      const boardId = this.boardId();
      const visible = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
      const richShapes = this.expansion.boardRegistry.getRichElements(boardId);
      const cam = this.boardCamera();
      const cursor = this.boardTool === 'eraser' ? this.boardCursor : null;
      const boardSig = JSON.stringify([boardId, visible.map((s) => s.id), richShapes.map((s) => s.id), this.boardDraft, this.richBoardDraft, cam, cursor, getMathGeneration()]);
      if (boardSig !== this.lastBoardRenderSig) {
        this.lastBoardRenderSig = boardSig;
        this.boardExtraFrames = 2;
      }
      if (this.boardExtraFrames > 0) {
        this.boardExtraFrames--;
        const ctx = this.boardCanvas.getContext('2d');
        if (ctx) {
          const scale = this.boardCanvas.width / 768;
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          drawBoard(ctx, visible, this.boardDraft, cam, 768, 432, false, scale);
          ctx.save();
          ctx.scale(cam.zoom, cam.zoom);
          ctx.translate(-cam.x, -cam.y);
          this.expansion.boardRegistry.drawRichLayer(ctx, boardId);
          if (this.richBoardDraft) {
            ctx.strokeStyle = this.boardColor.value;
            ctx.lineWidth = Number(this.boardWidth.value);
            if (this.richBoardDraft.kind === 'circle') {
              const cx = (this.richBoardDraft.start.x + this.richBoardDraft.current.x) / 2;
              const cy = (this.richBoardDraft.start.y + this.richBoardDraft.current.y) / 2;
              const rx = Math.max(4, Math.abs(this.richBoardDraft.current.x - this.richBoardDraft.start.x) / 2);
              const ry = Math.max(4, Math.abs(this.richBoardDraft.current.y - this.richBoardDraft.start.y) / 2);
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.moveTo(this.richBoardDraft.start.x, this.richBoardDraft.start.y);
              ctx.lineTo(this.richBoardDraft.current.x, this.richBoardDraft.current.y);
              ctx.stroke();
            }
          }
          ctx.restore();
          if (cursor) {
            ctx.strokeStyle = 'rgba(194, 84, 63, 0.85)';
            ctx.fillStyle = 'rgba(194, 84, 63, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private visiblePeople(view: AppView): DrawPerson[] {
    const sceneHouse = this.pane === 'house' ? this.houseOwnerId : null;
    const people: DrawPerson[] = [{ identity: view.identity, position: this.localPosition, isOwn: true }];
    for (const member of view.network.members) {
      if (!member.connected || member.identity.fingerprint === view.identity.fingerprint || !isInScene(member, this.currentArea, sceneHouse)) continue;
      people.push({ identity: member.identity, position: member.position, isOwn: false, appearance: member.appearance });
    }
    return people;
  }

  private accessLabel(access: PublicHouse['access']): string {
    return access === 'open' ? 'abierta' : access === 'ask' ? 'con permiso' : 'cerrada';
  }
}

export function createStudyUI(root: HTMLElement, actions: AppActions): { update(view: AppView): void; destroy(): void } {
  const ui = new StudyUI(root, actions);
  return { update: (view) => ui.update(view), destroy: () => ui.destroy() };
}
